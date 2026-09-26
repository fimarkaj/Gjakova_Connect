import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { classifyReport, findDuplicates, AIBudgetExceededError } from "@/lib/ai";
import { CATEGORIES } from "@/lib/types";
import { AREA_WEIGHTS } from "@/lib/silence-map";

const VALID_CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
const VALID_AREAS = new Set(Object.keys(AREA_WEIGHTS));

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const description: string | undefined = body?.description?.trim();
  const latitude: number | undefined = body?.latitude;
  const longitude: number | undefined = body?.longitude;
  const photoUrl: string | undefined = body?.photoUrl;
  const category: string | undefined = body?.category;
  const area: string | undefined = body?.area;

  if (
    !description ||
    latitude == null ||
    longitude == null ||
    !photoUrl ||
    !category ||
    !area ||
    !VALID_CATEGORY_IDS.has(category) ||
    !VALID_AREAS.has(area)
  ) {
    return NextResponse.json({ error: "Kërkesë e pavlefshme." }, { status: 400 });
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("reports")
    .insert({ description, latitude, longitude, photo_url: photoUrl, category, area })
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
