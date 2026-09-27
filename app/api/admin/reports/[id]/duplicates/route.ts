import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cosineSimilarity, parseEmbedding } from "@/lib/ai";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Access to this route is gated by middleware.ts (shared admin password via
// HTTP Basic Auth on /api/admin/*), so no per-request identity check happens here.
//
// Similarity is not stored anywhere: findDuplicates() computes it in memory at
// submission and only duplicate_of is written. So /admin recomputes it here
// from the stored vectors in report_embeddings, which the anon key cannot read
// (RLS is on with no policies). Nothing about detection is re-run and nothing
// is written — this is read-only.
//
// Because vectors can be rewritten by scripts/backfill-vision.ts, a score shown
// here is the similarity of the two reports as they are embedded now, which may
// differ slightly from the score at the moment the duplicate was detected.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const idsParam = req.nextUrl.searchParams.get("ids");
  const memberIds = (idsParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "" && s !== params.id && UUID_RE.test(s));

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "Identifikues i pavlefshëm." }, { status: 400 });
  }
  if (memberIds.length === 0) {
    return NextResponse.json({ similarities: {} });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("report_embeddings")
    .select("report_id, embedding")
    .in("report_id", [params.id, ...memberIds]);

  if (error) {
    console.error("duplicates GET: embedding query failed", error);
    return NextResponse.json({ error: "Ngjashmëria nuk u lexua." }, { status: 500 });
  }

  const vectors = new Map<string, number[]>();
  for (const row of rows ?? []) {
    const vector = parseEmbedding(row.embedding);
    if (vector) vectors.set(row.report_id as string, vector);
  }

  const canonical = vectors.get(params.id);

  // null for any member whose vector (or the canonical one) is missing — an old
  // row from before embeddings were stored. The UI shows a dash, not a zero.
  const similarities: Record<string, number | null> = {};
  for (const memberId of memberIds) {
    const vector = vectors.get(memberId);
    similarities[memberId] = canonical && vector ? cosineSimilarity(canonical, vector) : null;
  }

  return NextResponse.json({ similarities });
}
