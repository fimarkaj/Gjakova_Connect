import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { classifyReport, findDuplicates, AIBudgetExceededError } from "@/lib/ai";
import { assessReport, type QualityAssessment } from "@/lib/quality";
import { analyzePhoto } from "@/lib/vision";
import { resolveArea } from "@/lib/areas";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const description: string | undefined = body?.description?.trim();
  const latitude: number | undefined = body?.latitude;
  const longitude: number | undefined = body?.longitude;
  const photoUrl: string | undefined = body?.photoUrl;
  const notifyEmailRaw: string | undefined = body?.notifyEmail;
  const notifyEmail = notifyEmailRaw?.trim() || null;

  if (!description || latitude == null || longitude == null || !photoUrl) {
    return NextResponse.json({ error: "Kërkesë e pavlefshme." }, { status: 400 });
  }
  if (notifyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)) {
    return NextResponse.json({ error: "Formati i email-it nuk është i vlefshëm." }, { status: 400 });
  }

  // category is no longer collected from the submitter — it's assigned below
  // by classifyReport. area is resolved from the pin here; it stays null for
  // a pin too far from any known centroid (findDuplicates falls back to a
  // distance check when area is unset).
  const area = resolveArea(latitude, longitude);
  if (area === null) {
    console.log("reports POST: could not resolve area for pin", { latitude, longitude });
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("reports")
    .insert({
      description,
      latitude,
      longitude,
      photo_url: photoUrl,
      notify_email: notifyEmail,
      quality_flagged: false,
      area,
    })
    .select()
    .single();

  if (insertError || !inserted) {
    console.error("reports POST: insert failed", insertError);
    return NextResponse.json({ error: "Diçka shkoi keq — provo përsëri." }, { status: 500 });
  }

  // Quality gate. Runs before classification and duplicate detection so an
  // unusable report never spends tokens on the rest of the pipeline. A gate
  // failure must never block a citizen's submission, so the report falls
  // through unflagged (quality_flagged stays false from the insert above).
  let row = inserted;
  let quality: QualityAssessment | null = null;
  try {
    quality = await assessReport(description);
  } catch (err) {
    console.warn("reports POST: quality assessment unavailable — continuing unflagged", err);
  }

  if (quality) {
    // Written in its own update rather than folded into the enrichment update
    // below, so the verdict is stored even if classification later fails.
    const { data: assessed, error: qualityError } = await supabaseAdmin
      .from("reports")
      .update({
        quality_flagged: !quality.usable,
        flag_reason: quality.flag_reason,
        normalized_description: quality.normalized_description,
        quality_confidence: quality.confidence,
      })
      .eq("id", inserted.id)
      .select()
      .single();

    if (qualityError) console.error("reports POST: quality update failed", qualityError);
    if (assessed) row = assessed;

    if (!quality.usable) {
      return NextResponse.json({ report: row, duplicate: null });
    }
  }

  // Vision runs after the gate and before classification, so an unusable
  // report never reaches it and the classifier gets to see what the photo
  // shows. analyzePhoto never throws — a null photo, an unreachable image or a
  // failed call returns null and the pipeline continues text-only.
  const visionAnalysis = await analyzePhoto(row.photo_url);

  if (visionAnalysis) {
    const { error: visionError } = await supabaseAdmin
      .from("reports")
      .update({ vision_analysis: visionAnalysis })
      .eq("id", row.id);

    // Stored in its own update so the analysis survives a later
    // classification failure, matching how the quality verdict is written.
    if (visionError) console.error("reports POST: vision update failed", visionError);
  }

  // The report already exists at this point — if classification or duplicate
  // detection fails, the submission still succeeds, just without enrichment.
  try {
    const [classification, duplicate] = await Promise.all([
      classifyReport(description, visionAnalysis),
      findDuplicates({
        id: row.id,
        description,
        normalizedDescription: row.normalized_description,
        visionAnalysis,
        latitude,
        longitude,
        area: row.area,
      }),
    ]);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("reports")
      .update({
        category: classification.category,
        urgency: classification.urgency,
        reasoning: classification.reasoning,
        duplicate_of: duplicate?.reportId ?? null,
      })
      .eq("id", row.id)
      .select()
      .single();

    if (updateError) {
      console.error("reports POST: enrichment update failed", updateError);
      return NextResponse.json({ report: row, duplicate: null });
    }

    return NextResponse.json({ report: updated, duplicate });
  } catch (err) {
    if (err instanceof AIBudgetExceededError) {
      console.error("reports POST: AI budget exhausted — skipping enrichment for this report");
    } else {
      console.error("reports POST: AI pipeline failed", err);
    }
    return NextResponse.json({ report: row, duplicate: null });
  }
}
