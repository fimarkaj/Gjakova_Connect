import { config as loadEnv } from "dotenv";
import Module from "module";

loadEnv({ path: ".env.local" });

// lib/ai.ts and lib/supabase-admin.ts import "server-only" to fail fast if
// ever imported from a client bundle. That guard throws unconditionally
// outside Next's server-component build, so stub it out for this standalone
// test run only — the real app files are untouched.
const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

async function main() {
  const { supabaseAdmin } = await import("../lib/supabase-admin");
  const { classifyReport, findDuplicates } = await import("../lib/ai");

  const baseLat = 42.3803;
  const baseLng = 20.4308;

  async function insertFakeReport(description: string, offset: number, area: string) {
    const { data, error } = await supabaseAdmin
      .from("reports")
      .insert({
        description,
        latitude: baseLat + offset,
        longitude: baseLng + offset,
        photo_url: "https://example.com/fake.jpg",
        area,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  console.log("--- Inserting report 1 ---");
  const r1 = await insertFakeReport(
    "Ka nje gropë të madhe në rrugën 'Ndre Mjeda', afër kryqëzimit me shkollën. Është shumë e rrezikshme për makinat.",
    0,
    "Qendra"
  );
  console.log("Inserted:", r1.ticket_code, r1.id);

  const c1 = await classifyReport(r1.description);
  console.log("Classification 1:", c1);
  const dup1 = await findDuplicates({
    id: r1.id,
    description: r1.description,
    latitude: r1.latitude,
    longitude: r1.longitude,
    area: r1.area,
  });
  console.log("Duplicate check 1 (expect null):", dup1);

  await supabaseAdmin
    .from("reports")
    .update({ category: c1.category, urgency: c1.urgency, duplicate_of: dup1?.reportId ?? null })
    .eq("id", r1.id);

  console.log("\n--- Inserting report 2 (same street, same problem, same area) ---");
  const r2 = await insertFakeReport(
    "Gropë e madhe në rrugën Ndre Mjeda, pranë shkollës, shumë e rrezikshme, mund të dëmtojë makinat.",
    0.0005,
    "Qendra"
  );
  console.log("Inserted:", r2.ticket_code, r2.id);

  const c2 = await classifyReport(r2.description);
  console.log("Classification 2:", c2);
  const dup2 = await findDuplicates({
    id: r2.id,
    description: r2.description,
    latitude: r2.latitude,
    longitude: r2.longitude,
    area: r2.area,
  });
  console.log("Duplicate check 2 (expect match on report 1):", dup2);

  await supabaseAdmin
    .from("reports")
    .update({ category: c2.category, urgency: c2.urgency, duplicate_of: dup2?.reportId ?? null })
    .eq("id", r2.id);

  console.log("\n--- Result ---");
  if (dup2 && dup2.reportId === r1.id) {
    console.log(
      `PASS: report 2 (${r2.ticket_code}) flagged as duplicate of report 1 (${r1.ticket_code}), similarity=${dup2.similarity.toFixed(4)}`
    );
  } else {
    console.log("FAIL: report 2 was not flagged as a duplicate of report 1");
  }

  console.log("\nCleaning up fake reports...");
  await supabaseAdmin.from("report_embeddings").delete().in("report_id", [r1.id, r2.id]);
  await supabaseAdmin.from("reports").delete().in("id", [r1.id, r2.id]);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
