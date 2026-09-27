/**
 * Backfills `vision_analysis` and re-embeds existing reports under the scheme
 * findDuplicates() now uses (normalized_description + the photo's
 * visual_summary and objects — see buildEmbedInput in lib/ai.ts).
 *
 * Rows embedded before that change hold vectors built from the raw description
 * alone. Comparing across the two schemes scores far below the similarity
 * threshold, so duplicate detection silently degrades against old rows until
 * they are re-embedded. Rows that already have a vision_analysis are skipped.
 *
 *   npm run backfill-vision            # every open report with a photo
 *   npm run backfill-vision GJK-1031   # one report, by ticket code
 */
import { config as loadEnv } from "dotenv";
import Module from "module";
import path from "path";

loadEnv({ path: ".env.local" });

// lib/vision.ts -> lib/ai.ts import "server-only" and use the "@/*" alias,
// neither of which works under plain node. Same shim as scripts/test-quality.ts.
const ROOT = path.resolve(__dirname, "..");
const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  if (request.startsWith("@/")) {
    return originalLoad.call(this, path.join(ROOT, request.slice(2)), ...rest);
  }
  return originalLoad.call(this, request, ...rest);
};

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { buildEmbedInput, openai } = await import("../lib/ai");
  const { analyzePhoto } = await import("../lib/vision");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const only = process.argv[2];

  let query = supabase
    .from("reports")
    .select("id, ticket_code, description, normalized_description, photo_url, vision_analysis")
    .not("photo_url", "is", null)
    .in("status", ["submitted", "in_progress"]);

  if (only) query = query.eq("ticket_code", only);

  const { data: rows, error } = await query;
  if (error) throw error;

  console.log(`Candidate rows: ${rows?.length ?? 0}${only ? ` (filtered to ${only})` : ""}`);

  let analyzed = 0;
  let reembedded = 0;
  let skipped = 0;

  for (const row of rows ?? []) {
    let vision = row.vision_analysis as Awaited<ReturnType<typeof analyzePhoto>>;

    if (vision) {
      console.log(`  ${row.ticket_code}: vision_analysis already present — reusing`);
    } else {
      vision = await analyzePhoto(row.photo_url as string);
      if (!vision) {
        console.log(`  ${row.ticket_code}: vision unavailable — skipped`);
        skipped += 1;
        continue;
      }
      const { error: visionError } = await supabase
        .from("reports")
        .update({ vision_analysis: vision })
        .eq("id", row.id);
      if (visionError) {
        console.error(`  ${row.ticket_code}: vision update failed`, visionError);
        skipped += 1;
        continue;
      }
      analyzed += 1;
    }

    // Re-embed with the same helper the live path uses, so the stored vector
    // is directly comparable to vectors written at submission.
    const input = buildEmbedInput({
      id: row.id as string,
      description: row.description as string,
      normalizedDescription: row.normalized_description as string | null,
      visionAnalysis: vision,
      latitude: null,
      longitude: null,
      area: null,
    });

    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: input.slice(0, 1500),
    });

    const { error: embedError } = await supabase
      .from("report_embeddings")
      .upsert({ report_id: row.id, embedding: res.data[0].embedding }, { onConflict: "report_id" });

    if (embedError) {
      console.error(`  ${row.ticket_code}: embedding upsert failed`, embedError);
      continue;
    }
    reembedded += 1;
    console.log(`  ${row.ticket_code}: re-embedded`);
  }

  console.log(`\nAnalyzed: ${analyzed}   Re-embedded: ${reembedded}   Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
