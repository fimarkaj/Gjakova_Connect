/**
 * Fills `area` for existing rows where it's null but coordinates are present,
 * using the same resolveArea() the reports POST route now uses at insert.
 * Rows that already have an area are left untouched.
 *
 *   npm run backfill-areas
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resolveArea } from "../lib/areas";

loadEnv({ path: ".env.local" });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: rows, error } = await supabase
    .from("reports")
    .select("id, latitude, longitude")
    .is("area", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  if (error) throw error;

  const { count: totalWithNullArea } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .is("area", null);

  console.log(`Rows with null area (total): ${totalWithNullArea ?? 0}`);
  console.log(`Rows with null area and coordinates present: ${rows?.length ?? 0}`);

  let resolvedCount = 0;
  let stillNullCount = 0;

  for (const row of rows ?? []) {
    const area = resolveArea(row.latitude as number, row.longitude as number);
    if (area === null) {
      stillNullCount += 1;
      continue;
    }
    const { error: updateError } = await supabase.from("reports").update({ area }).eq("id", row.id);
    if (updateError) {
      console.error(`Failed to update row ${row.id}:`, updateError);
      continue;
    }
    resolvedCount += 1;
  }

  const { count: afterNullArea } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .is("area", null);

  console.log(`Resolved to an area: ${resolvedCount}`);
  console.log(`Resolved to null (too far from any centroid): ${stillNullCount}`);
  console.log(`Rows with null area (after): ${afterNullArea ?? 0}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
