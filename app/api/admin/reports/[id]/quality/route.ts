import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { classifyReport, findDuplicates, AIBudgetExceededError } from "@/lib/ai";
import { analyzePhoto } from "@/lib/vision";

// Access to this route is gated by middleware.ts (shared admin password via
// HTTP Basic Auth on /api/admin/*), so no per-request identity check happens here.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const action: string | undefined = body?.action;

  if (action !== "accept" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const { data: report, error: loadError } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("id", params.id)
    .single();

  if (loadError || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // flag_reason is kept on both paths — it's the record of why the gate
  // stopped this report, and stays useful after the clerk has decided.
  if (action === "reject") {
    const { data: rejected, error } = await supabaseAdmin
      .from("reports")
      .update({ status: "rejected", quality_flagged: false })
      .eq("id", params.id)
      .select()
      .single();

    if (error || !rejected) {
      console.error("quality POST: reject failed", error);
      return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
    }

    return NextResponse.json({ report: rejected, duplicate: null });
  }

  // Clear the flag in its own update so the clerk's decision is stored even if
  // the AI step below fails.
  const { data: accepted, error: acceptError } = await supabaseAdmin
    .from("reports")
    .update({ quality_flagged: false })
    .eq("id", params.id)
    .select()
    .single();

  if (acceptError || !accepted) {
    console.error("quality POST: accept failed", acceptError);
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }

  // Classification and duplicate detection were skipped at submission because
  // the gate flagged this report, so this is their first run for it. A failure
  // here must not undo the acceptance — the report stays accepted, unenriched.
  // A clerk accepting the report is the gate passing, so vision runs here for
  // the same reason it runs on submission — before classification, and never
  // able to block the acceptance.
  const visionAnalysis = await analyzePhoto(accepted.photo_url);

  if (visionAnalysis) {
    const { error: visionError } = await supabaseAdmin
      .from("reports")
      .update({ vision_analysis: visionAnalysis })
      .eq("id", accepted.id);

    if (visionError) console.error("quality POST: vision update failed", visionError);
  }

  try {
    const [classification, duplicate] = await Promise.all([
      classifyReport(accepted.description, visionAnalysis),
      findDuplicates({
        id: accepted.id,
        description: accepted.description,
        normalizedDescription: accepted.normalized_description,
        visionAnalysis,
        latitude: accepted.latitude,
        longitude: accepted.longitude,
        area: accepted.area,
      }),
    ]);

    const { data: enriched, error: updateError } = await supabaseAdmin
      .from("reports")
      .update({
        category: classification.category,
        urgency: classification.urgency,
        reasoning: classification.reasoning,
        duplicate_of: duplicate?.reportId ?? null,
      })
      .eq("id", accepted.id)
      .select()
      .single();

    if (updateError || !enriched) {
      console.error("quality POST: enrichment update failed", updateError);
      return NextResponse.json({ report: accepted, duplicate: null });
    }

    return NextResponse.json({ report: enriched, duplicate });
  } catch (err) {
    if (err instanceof AIBudgetExceededError) {
      console.error("quality POST: AI budget exhausted — accepted without enrichment");
    } else {
      console.error("quality POST: AI pipeline failed", err);
    }
    return NextResponse.json({ report: accepted, duplicate: null });
  }
}
