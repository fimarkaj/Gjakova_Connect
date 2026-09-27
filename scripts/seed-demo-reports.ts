/**
 * Submits 24 realistic demo reports through the real submission pipeline —
 * the same insert -> quality gate -> vision -> classify + duplicate-detection
 * sequence as app/api/reports/route.ts — so duplicate_of links actually form
 * from semantic similarity, the way they would for real citizen reports.
 *
 * This does NOT insert finished rows directly: a straight insert has no
 * embedding, so findDuplicates() would never match anything. Each report is
 * submitted one at a time, oldest first, so later reports about the same
 * problem can find the earlier ones as candidates.
 *
 *   npm run seed:demo
 *
 * No photos: photo_url is left null, which analyzePhoto() treats as "skip
 * vision" (same as an unphotographed report would).
 *
 * Reports get real auto-generated ticket codes (GJK-####, same sequence as
 * live traffic) — there's no seed prefix to filter on for cleanup, unlike
 * scripts/seed-reports.ts.
 *
 * Shape of the data:
 * - Krena, illegal dumping: 5 reports, same riverbank spot, heavily reworded.
 * - Qendra, pothole: 4 reports, same stretch of road.
 * - Çarshia e Vjetër, broken streetlight: 3 reports.
 * - Ura e Shejtë, water leak: 3 reports.
 * - 9 standalone reports (no duplicates), spread across Damjan (at most 1 —
 *   its near-silence is the Silence Map's headline finding), Lipovec,
 *   Babaj i Bokës, and the urban areas.
 */
import { config as loadEnv } from "dotenv";
import Module from "module";

loadEnv({ path: ".env.local" });

// Same stub as scripts/test-ai-pipeline.ts: lib/ai.ts, lib/quality.ts,
// lib/vision.ts and lib/supabase-admin.ts all import "server-only" to fail
// fast outside Next's server build. Stub it for this standalone run only.
const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

type Item = {
  area: string;
  daysAgo: number;
  description: string;
  jitterSeed: number;
  radiusMeters: number;
};

// Deterministic jitter around an area centroid: golden-angle spread keeps
// points from stacking, sqrt(frac) keeps the distribution roughly even
// across the disc rather than bunched at the center.
function jitterLatLng([lat, lng]: [number, number], seed: number, radiusMeters: number): [number, number] {
  const angleDeg = (seed * 137.50776) % 360;
  const frac = ((seed * 9301 + 49297) % 233280) / 233280;
  const r = radiusMeters * Math.sqrt(frac);
  const rad = (angleDeg * Math.PI) / 180;
  const dNorth = r * Math.cos(rad);
  const dEast = r * Math.sin(rad);
  const dLat = dNorth / 111320;
  const dLng = dEast / (111320 * Math.cos((lat * Math.PI) / 180));
  return [Number((lat + dLat).toFixed(6)), Number((lng + dLng).toFixed(6))];
}

// Cluster jitter radius stays small (max pairwise distance = 2x radius) so
// every member of a cluster lands within ~100m of the others, as chronic-issue
// detection (lib/chronic-issues.ts) and duplicate detection (same-area
// fallback in lib/ai.ts) both expect for the same real-world problem.
const CLUSTER_RADIUS = 35;
const STANDALONE_RADIUS = 120;

const ITEMS: Item[] = [
  // --- Krena: illegal dumping by the riverbank (5, one real problem) ---
  {
    area: "Krena",
    daysAgo: 55,
    jitterSeed: 0,
    radiusMeters: CLUSTER_RADIUS,
    description: "Rubbish piling up by the river again, whole bags of it near the bank, smells terible.",
  },
  {
    area: "Krena",
    daysAgo: 42,
    jitterSeed: 1,
    radiusMeters: CLUSTER_RADIUS,
    description: "someone keeps dumping bags near the bank in krena, this is the third time this month",
  },
  {
    area: "Krena",
    daysAgo: 30,
    jitterSeed: 2,
    radiusMeters: CLUSTER_RADIUS,
    description: "trash everywhere along krena riverside, nobody ever picks it up",
  },
  {
    area: "Krena",
    daysAgo: 18,
    jitterSeed: 3,
    radiusMeters: CLUSTER_RADIUS,
    description: "Garbage bags dumped by the river in Krena, kids play near there its not safe",
  },
  {
    area: "Krena",
    daysAgo: 5,
    jitterSeed: 4,
    radiusMeters: CLUSTER_RADIUS,
    description: "Illegal dumping continues by the Krena river bank, same spot as before, realy needs cleaning up",
  },

  // --- Qendra: pothole on the same stretch of road (4) ---
  {
    area: "Qendra",
    daysAgo: 48,
    jitterSeed: 5,
    radiusMeters: CLUSTER_RADIUS,
    description: "Big pothole in the middle of the road near the main square, almost hit it with my car",
  },
  {
    area: "Qendra",
    daysAgo: 33,
    jitterSeed: 6,
    radiusMeters: CLUSTER_RADIUS,
    description: "theres a huge hole in the street by the square, cars keep swerving to avoid it",
  },
  {
    area: "Qendra",
    daysAgo: 19,
    jitterSeed: 7,
    radiusMeters: CLUSTER_RADIUS,
    description: "pothole getting worse every week near qendra square, someone will get hurt",
  },
  {
    area: "Qendra",
    daysAgo: 7,
    jitterSeed: 8,
    radiusMeters: CLUSTER_RADIUS,
    description: "Deep pothole on the road by the center, my tire got damaged yesterday",
  },

  // --- Çarshia e Vjetër: broken streetlight (3) ---
  {
    area: "Çarshia e Vjetër",
    daysAgo: 40,
    jitterSeed: 9,
    radiusMeters: CLUSTER_RADIUS,
    description: "Streetlight by the old bazaar has been out for days, its really dark at night",
  },
  {
    area: "Çarshia e Vjetër",
    daysAgo: 22,
    jitterSeed: 10,
    radiusMeters: CLUSTER_RADIUS,
    description: "the light near carshia e vjeter isnt working, hard to see walking home",
  },
  {
    area: "Çarshia e Vjetër",
    daysAgo: 9,
    jitterSeed: 11,
    radiusMeters: CLUSTER_RADIUS,
    description: "Broken street lamp in the old bazaar area, been dark for almost two weeks now",
  },

  // --- Ura e Shejtë: water leak (3) ---
  {
    area: "Ura e Shejtë",
    daysAgo: 37,
    jitterSeed: 12,
    radiusMeters: CLUSTER_RADIUS,
    description: "Water leaking from a pipe near ura e shejte, been running for days now",
  },
  {
    area: "Ura e Shejtë",
    daysAgo: 16,
    jitterSeed: 13,
    radiusMeters: CLUSTER_RADIUS,
    description: "Theres a water leak on the road to ura e shejte, wasting so much water",
  },
  {
    area: "Ura e Shejtë",
    daysAgo: 4,
    jitterSeed: 14,
    radiusMeters: CLUSTER_RADIUS,
    description: "pipe burst near ura e shejte, water just flowing into the street now",
  },

  // --- Standalone reports (9, no duplicates) ---
  {
    area: "Damjan",
    daysAgo: 44,
    jitterSeed: 15,
    radiusMeters: STANDALONE_RADIUS,
    description: "No streetlights working in the center of Damjan village, its pitch dark at night",
  },
  {
    area: "Lipovec",
    daysAgo: 58,
    jitterSeed: 16,
    radiusMeters: STANDALONE_RADIUS,
    description: "Garbage only gets collected once a month here in Lipovec, bins are overflowing",
  },
  {
    area: "Lipovec",
    daysAgo: 12,
    jitterSeed: 17,
    radiusMeters: STANDALONE_RADIUS,
    description: "Irrigation canal blocked in Lipovec, water flooding into the fields",
  },
  {
    area: "Babaj i Bokës",
    daysAgo: 50,
    jitterSeed: 18,
    radiusMeters: STANDALONE_RADIUS,
    description: "Road to Babaj i Bokes almost impossible after rain, so much mud",
  },
  {
    area: "Babaj i Bokës",
    daysAgo: 3,
    jitterSeed: 19,
    radiusMeters: STANDALONE_RADIUS,
    description: "No public lighting at all in the village center of Babaj i Bokes",
  },
  {
    area: "Qendra",
    daysAgo: 26,
    jitterSeed: 20,
    radiusMeters: STANDALONE_RADIUS,
    description: "Trees in the city park near qendra need trimming, branches touching the power lines",
  },
  {
    area: "Çarshia e Vjetër",
    daysAgo: 60,
    jitterSeed: 21,
    radiusMeters: STANDALONE_RADIUS,
    description: "Old graffiti all over the shop shutters in the bazaar, needs cleaning before tourist season",
  },
  {
    area: "Krena",
    daysAgo: 15,
    jitterSeed: 22,
    radiusMeters: STANDALONE_RADIUS,
    description: "Loose cobblestones along the Krena promenade, tourists keep tripping on them",
  },
  {
    area: "Ura e Shejtë",
    daysAgo: 34,
    jitterSeed: 23,
    radiusMeters: STANDALONE_RADIUS,
    description: "Information sign near the bridge is broken and you cant read it anymore",
  },
];

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const { supabaseAdmin } = await import("../lib/supabase-admin");
  const { classifyReport, findDuplicates, AIBudgetExceededError } = await import("../lib/ai");
  const { assessReport } = await import("../lib/quality");
  const { analyzePhoto } = await import("../lib/vision");
  const { AREA_CENTROIDS, resolveArea } = await import("../lib/areas");

  // Oldest first: a later report about the same problem must find the
  // earlier one already in the table (with an embedding) to be linked as a
  // duplicate, exactly like real submissions arriving over time.
  const ordered = [...ITEMS].sort((a, b) => b.daysAgo - a.daysAgo);

  const now = Date.now();
  let created = 0;
  let duplicatesLinked = 0;

  for (const item of ordered) {
    const centroid = AREA_CENTROIDS[item.area as keyof typeof AREA_CENTROIDS];
    if (!centroid) throw new Error(`No centroid for area "${item.area}" in lib/areas.ts`);
    const [latitude, longitude] = jitterLatLng(centroid, item.jitterSeed, item.radiusMeters);

    // --- Mirrors app/api/reports/route.ts from here down ---
    const area = resolveArea(latitude, longitude);
    if (area !== item.area) {
      console.warn(`  note: resolved area "${area}" differs from intended "${item.area}" for this pin`);
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("reports")
      .insert({
        description: item.description,
        latitude,
        longitude,
        photo_url: null,
        notify_email: null,
        quality_flagged: false,
        area,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      console.error("insert failed", insertError);
      continue;
    }

    let row = inserted;

    let quality = null;
    try {
      quality = await assessReport(item.description);
    } catch (err) {
      console.warn(`  quality gate unavailable for ${row.ticket_code} — continuing unflagged`, err);
    }

    if (quality) {
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

      if (qualityError) console.error("quality update failed", qualityError);
      if (assessed) row = assessed;

      if (!quality.usable) {
        console.log(`${row.ticket_code}  ${item.area.padEnd(18)} FLAGGED by quality gate: ${quality.flag_reason}`);
        await backdate(supabaseAdmin, row.id, item.daysAgo, now);
        created++;
        continue;
      }
    }

    const visionAnalysis = await analyzePhoto(row.photo_url);
    if (visionAnalysis) {
      await supabaseAdmin.from("reports").update({ vision_analysis: visionAnalysis }).eq("id", row.id);
    }

    let duplicate: Awaited<ReturnType<typeof findDuplicates>> = null;
    try {
      const [classification, dup] = await Promise.all([
        classifyReport(item.description, visionAnalysis),
        findDuplicates({
          id: row.id,
          description: item.description,
          normalizedDescription: row.normalized_description,
          visionAnalysis,
          latitude,
          longitude,
          area: row.area,
        }),
      ]);
      duplicate = dup;

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

      if (updateError || !updated) {
        console.error("enrichment update failed", updateError);
      } else {
        row = updated;
      }
    } catch (err) {
      if (err instanceof AIBudgetExceededError) {
        console.error(`  AI budget exhausted — ${row.ticket_code} submitted without enrichment`);
      } else {
        console.error(`  AI pipeline failed for ${row.ticket_code}`, err);
      }
    }
    // --- End of route.ts equivalent ---

    await backdate(supabaseAdmin, row.id, item.daysAgo, now);

    const dupNote = duplicate ? ` -> duplicate of ${duplicate.ticketCode} (${duplicate.similarity.toFixed(3)})` : "";
    if (duplicate) duplicatesLinked++;
    console.log(
      `${row.ticket_code}  ${item.area.padEnd(18)} ${(row.category ?? "?").padEnd(18)} ${item.daysAgo}d ago${dupNote}`
    );
    created++;
  }

  console.log(`\nSubmitted ${created}/${ITEMS.length} reports, ${duplicatesLinked} linked as duplicates.`);
}

// Applied after the real pipeline has already made its duplicate/category
// decisions — backdating created_at afterward can't affect them, since
// findDuplicates only ever saw each report's true insert time. updated_at is
// left alone: a BEFORE UPDATE trigger (schema.sql) always stamps it to the
// real current time, which is accurate here — the enrichment above really
// did just happen.
async function backdate(supabaseAdmin: any, id: string, daysAgo: number, now: number) {
  const createdAt = new Date(now - daysAgo * DAY - Math.floor(Math.random() * 12) * 60 * 60 * 1000);
  const { error } = await supabaseAdmin.from("reports").update({ created_at: createdAt.toISOString() }).eq("id", id);
  if (error) console.error("backdate failed", error);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
