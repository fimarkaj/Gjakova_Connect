import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { classifyReport, findDuplicates, AIBudgetExceededError } from "@/lib/ai";

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

  // category/area are no longer collected from the submitter — category is
  // assigned below by classifyReport, and area stays null (findDuplicates
  // falls back to a distance check when area is unset).
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("reports")
    .insert({ description, latitude, longitude, photo_url: photoUrl, notify_email: notifyEmail })
    .select()
    .single();

  if (insertError || !inserted) {
    console.error("reports POST: insert failed", insertError);
    return NextResponse.json({ error: "Diçka shkoi keq — provo përsëri." }, { status: 500 });
  }

  // The report already exists at this point — if classification or duplicate
  // detection fails, the submission still succeeds, just without enrichment.
  try {
    const [classification, duplicate] = await Promise.all([
      classifyReport(description),
      findDuplicates({ id: inserted.id, description, latitude, longitude, area: inserted.area }),
    ]);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("reports")
      .update({
        category: classification.category,
        urgency: classification.urgency,
        duplicate_of: duplicate?.reportId ?? null,
      })
      .eq("id", inserted.id)
      .select()
      .single();

    if (updateError) {
      console.error("reports POST: enrichment update failed", updateError);
      return NextResponse.json({ report: inserted, duplicate: null });
    }

    return NextResponse.json({ report: updated, duplicate });
  } catch (err) {
    if (err instanceof AIBudgetExceededError) {
      console.error("reports POST: AI budget exhausted — skipping enrichment for this report");
    } else {
      console.error("reports POST: AI pipeline failed", err);
    }
    return NextResponse.json({ report: inserted, duplicate: null });
  }
}
