/**
 * Seeds ~40 fake reports for the /admin dashboard and /admin/silence-map.
 *
 *   npm run seed           # remove previous seed rows, insert fresh ones
 *   npm run seed -- --clean  # only remove seed rows
 *
 * Seed rows use ticket codes GJK-S01..GJK-S40, so re-running never touches
 * real citizen reports. created_at is relative to "now", so the data always
 * spans the last ~90 days.
 *
 * Shape of the data (deliberate):
 * - Krena: a cluster of 5 sewage reports within ~20 m of each other over the
 *   last 4 weeks, the later ones marked duplicate_of the first — a chronic issue.
 * - Damjan: 0 reports, Ujz: 1 report — both should be flagged as silent zones,
 *   while Babaj i Bokës and Lipovec (same weight) get 2 each.
 */
import { config as loadEnv } from "dotenv";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEED_PREFIX = "GJK-S";

// Approximate area centers — good enough for demo pins, not survey-grade.
const AREA_CENTERS: Record<string, [number, number]> = {
  Qendra: [42.3806, 20.431],
  "Çarshia e Vjetër": [42.3838, 20.4285],
  "Bahçallëk": [42.376, 20.438],
  Sopot: [42.39, 20.436],
  "Ura e Shejtë": [42.394, 20.425],
  "Kodra e Diellit": [42.372, 20.427],
  "Rruga e Prizrenit": [42.374, 20.442],
  Krena: [42.3818, 20.4275],
  Damjan: [42.306, 20.503],
  Ujz: [42.339, 20.502],
  "Babaj i Bokës": [42.427, 20.357],
  Lipovec: [42.335, 20.406],
};

// The Krena hotspot: sewage outflow by the footbridge.
const KRENA_HOTSPOT: [number, number] = [42.38252, 20.42618];

type Seed = {
  area: string;
  category: string;
  urgency: "low" | "medium" | "high";
  status: "submitted" | "in_progress" | "resolved";
  daysAgo: number;
  description: string;
  hotspot?: boolean;
};

const SEEDS: Seed[] = [
  // Qendra (7)
  { area: "Qendra", category: "infrastruktura", urgency: "high", status: "submitted", daysAgo: 3, description: "Gropë e thellë në mes të rrugës para Komunës, makinat po e anashkalojnë në korsinë tjetër." },
  { area: "Qendra", category: "infrastruktura", urgency: "medium", status: "in_progress", daysAgo: 11, description: "Tri llamba të fikura në sheshin qendror, shumë errësirë pas orës 20:00." },
  { area: "Qendra", category: "sherbime_publike", urgency: "medium", status: "resolved", daysAgo: 24, description: "Kontejnerët pranë stacionit të autobusëve janë plot që prej tre ditësh." },
  { area: "Qendra", category: "infrastruktura", urgency: "low", status: "resolved", daysAgo: 38, description: "Pllakat e trotuarit janë të lirshme te Rruga Nëna Terezë — someone is going to trip." },
  { area: "Qendra", category: "infrastruktura", urgency: "low", status: "submitted", daysAgo: 52, description: "Semafori te kryqëzimi kryesor ndërron shumë shpejt për këmbësorët." },
  { area: "Qendra", category: "sherbime_publike", urgency: "high", status: "resolved", daysAgo: 67, description: "Water main leak on the street behind the post office, water has been running for hours." },
  { area: "Qendra", category: "urbanizem", urgency: "low", status: "in_progress", daysAgo: 81, description: "Pemët në parkun e qytetit kanë nevojë për krasitje, degët prekin telat elektrikë." },

  // Bahçallëk (5)
  { area: "Bahçallëk", category: "infrastruktura", urgency: "medium", status: "submitted", daysAgo: 5, description: "Asfalti i dëmtuar pas punimeve të ujësjellësit nuk është rregulluar ende." },
  { area: "Bahçallëk", category: "inspektorati", urgency: "high", status: "in_progress", daysAgo: 17, description: "Deponi ilegale mbeturinash pranë shkollës — bad smell, kids walk past it every day." },
  { area: "Bahçallëk", category: "infrastruktura", urgency: "low", status: "resolved", daysAgo: 33, description: "Ndriçimi publik ndizet me vonesë në rrugicat e lagjes." },
  { area: "Bahçallëk", category: "sherbime_publike", urgency: "medium", status: "resolved", daysAgo: 46, description: "Kapak pusete i thyer në trotuar, rrezik për fëmijët." },
  { area: "Bahçallëk", category: "infrastruktura", urgency: "low", status: "submitted", daysAgo: 74, description: "Mungojnë vijat e kalimit të këmbësorëve para marketit." },

  // Sopot (5)
  { area: "Sopot", category: "infrastruktura", urgency: "high", status: "submitted", daysAgo: 2, description: "Rruga kryesore e Sopotit krejtësisht pa dritë, several streetlights are out." },
  { area: "Sopot", category: "infrastruktura", urgency: "medium", status: "in_progress", daysAgo: 14, description: "Gropa të shumta pas shiut, uji mbetet në rrugë për ditë të tëra." },
  { area: "Sopot", category: "sherbime_publike", urgency: "low", status: "resolved", daysAgo: 29, description: "Kontejneri është dëmtuar dhe mbeturinat bien jashtë." },
  { area: "Sopot", category: "urbanizem", urgency: "low", status: "resolved", daysAgo: 55, description: "Bari në hapësirën e gjelbër nuk është kositur prej javësh." },
  { area: "Sopot", category: "sherbime_publike", urgency: "medium", status: "in_progress", daysAgo: 86, description: "Kanalizimi del në rrugë sa herë bie shi i fortë." },

  // Kodra e Diellit (3)
  { area: "Kodra e Diellit", category: "infrastruktura", urgency: "medium", status: "submitted", daysAgo: 9, description: "Rruga e pjerrët ka çarje të mëdha, në dimër do të jetë e rrezikshme." },
  { area: "Kodra e Diellit", category: "infrastruktura", urgency: "low", status: "resolved", daysAgo: 41, description: "Streetlight flickering all night near the upper apartment blocks." },
  { area: "Kodra e Diellit", category: "sherbime_publike", urgency: "medium", status: "resolved", daysAgo: 63, description: "Mbeturinat nuk janë mbledhur këtë javë në asnjë nga kontejnerët." },

  // Rruga e Prizrenit (3)
  { area: "Rruga e Prizrenit", category: "infrastruktura", urgency: "high", status: "in_progress", daysAgo: 7, description: "Gropë e madhe në korsinë drejt Prizrenit, dy vetura kanë dëmtuar gomat." },
  { area: "Rruga e Prizrenit", category: "infrastruktura", urgency: "medium", status: "resolved", daysAgo: 31, description: "Shenja STOP është rrëzuar në kryqëzim." },
  { area: "Rruga e Prizrenit", category: "infrastruktura", urgency: "medium", status: "submitted", daysAgo: 58, description: "Dark stretch of road near the petrol station, no working lights at all." },

  // Çarshia e Vjetër (3)
  { area: "Çarshia e Vjetër", category: "infrastruktura", urgency: "medium", status: "submitted", daysAgo: 4, description: "Kalldrëmi i lirshëm në Çarshi, turistët po pengohen." },
  { area: "Çarshia e Vjetër", category: "sherbime_publike", urgency: "low", status: "resolved", daysAgo: 22, description: "Shportat e mbeturinave në Çarshi mbushen shpejt gjatë fundjavës." },
  { area: "Çarshia e Vjetër", category: "urbanizem", urgency: "low", status: "in_progress", daysAgo: 48, description: "Grafite në kepenget e dyqaneve të vjetra — needs cleaning before the season." },

  // Krena (7) — first five are the hotspot cluster
  { area: "Krena", category: "sherbime_publike", urgency: "high", status: "resolved", daysAgo: 27, hotspot: true, description: "Kanalizimi derdhet në lumin Krena pranë urës së këmbësorëve, erë shumë e rëndë." },
  { area: "Krena", category: "sherbime_publike", urgency: "high", status: "submitted", daysAgo: 20, hotspot: true, description: "Sewage overflowing into the Krena again, same spot by the footbridge as last month." },
  { area: "Krena", category: "sherbime_publike", urgency: "medium", status: "submitted", daysAgo: 13, hotspot: true, description: "Pusi i kanalizimit pranë lumit Krena po rrjedh sërish." },
  { area: "Krena", category: "sherbime_publike", urgency: "high", status: "submitted", daysAgo: 6, hotspot: true, description: "Ujëra të zeza në bregun e Krenës, fëmijët luajnë aty afër." },
  { area: "Krena", category: "sherbime_publike", urgency: "high", status: "submitted", daysAgo: 2, hotspot: true, description: "Still leaking — raw sewage into the Krena by the footbridge, fourth time reported." },
  { area: "Krena", category: "sherbime_publike", urgency: "medium", status: "in_progress", daysAgo: 44, description: "Mbeturina plastike të grumbulluara në shtratin e lumit Krena." },
  { area: "Krena", category: "urbanizem", urgency: "low", status: "resolved", daysAgo: 70, description: "Shkurret përgjatë shëtitores së Krenës kanë zënë shtegun." },

  // Ura e Shejtë (2)
  { area: "Ura e Shejtë", category: "infrastruktura", urgency: "medium", status: "submitted", daysAgo: 19, description: "Rruga për te Ura e Shejtë ka shumë gropa, duhet mirëmbajtje." },
  { area: "Ura e Shejtë", category: "kulture", urgency: "low", status: "resolved", daysAgo: 61, description: "Tabela informuese te ura është e dëmtuar dhe nuk lexohet." },

  // Ujz (1) — deliberately almost silent
  { area: "Ujz", category: "sherbime_publike", urgency: "medium", status: "submitted", daysAgo: 36, description: "Uji i pijshëm në fshat ndërpritet çdo mbrëmje." },

  // Babaj i Bokës (2)
  { area: "Babaj i Bokës", category: "infrastruktura", urgency: "high", status: "in_progress", daysAgo: 15, description: "Rruga për në fshat pothuajse e pakalueshme pas shiut, mud everywhere." },
  { area: "Babaj i Bokës", category: "infrastruktura", urgency: "low", status: "submitted", daysAgo: 50, description: "Asnjë ndriçim publik në qendër të fshatit." },

  // Lipovec (2)
  { area: "Lipovec", category: "sherbime_publike", urgency: "medium", status: "submitted", daysAgo: 26, description: "Mbeturinat mblidhen vetëm një herë në muaj në fshat." },
  { area: "Lipovec", category: "bujqesi", urgency: "medium", status: "resolved", daysAgo: 77, description: "Kanali i ujitjes është bllokuar dhe uji po vërshon arat." },

  // Damjan: intentionally no reports.
];

const DAY = 24 * 60 * 60 * 1000;

// Deterministic small offset so pins don't stack; hotspot offsets stay within ~20 m.
function jitter(i: number, scale: number): [number, number] {
  return [Math.sin(i * 12.9898) * scale, Math.cos(i * 78.233) * scale];
}

async function clean() {
  const { error, count } = await supabase
    .from("reports")
    .delete({ count: "exact" })
    .like("ticket_code", `${SEED_PREFIX}%`);
  if (error) throw error;
  console.log(`Removed ${count ?? 0} previous seed rows.`);
}

async function seed() {
  const now = Date.now();
  let hotspotLeadId: string | null = null;

  const rows = SEEDS.map((s, i) => {
    const id = randomUUID();
    const [baseLat, baseLng] = s.hotspot ? KRENA_HOTSPOT : AREA_CENTERS[s.area];
    const [dLat, dLng] = jitter(i + 1, s.hotspot ? 0.00015 : 0.003);

    // Vary the hour of day so reports don't all share a timestamp.
    const created = new Date(now - s.daysAgo * DAY - ((i * 7) % 12) * 60 * 60 * 1000);
    const updated =
      s.status === "submitted" ? created : new Date(Math.min(now - 60 * 60 * 1000, created.getTime() + 3 * DAY));

    let duplicateOf: string | null = null;
    if (s.hotspot) {
      if (hotspotLeadId) duplicateOf = hotspotLeadId;
      else hotspotLeadId = id;
    }

    return {
      id,
      ticket_code: `${SEED_PREFIX}${String(i + 1).padStart(2, "0")}`,
      description: s.description,
      category: s.category,
      urgency: s.urgency,
      status: s.status,
      area: s.area,
      latitude: Number((baseLat + dLat).toFixed(6)),
      longitude: Number((baseLng + dLng).toFixed(6)),
      photo_url: null,
      duplicate_of: duplicateOf,
      created_at: created.toISOString(),
      updated_at: updated.toISOString(),
    };
  });

  const { error } = await supabase.from("reports").insert(rows);
  if (error) throw error;

  const perArea: Record<string, number> = {};
  for (const r of rows) perArea[r.area] = (perArea[r.area] ?? 0) + 1;
  console.log(`Inserted ${rows.length} seed reports.`);
  for (const area of Object.keys(AREA_CENTERS)) console.log(`  ${area.padEnd(20)} ${perArea[area] ?? 0}`);
}

async function main() {
  await clean();
  if (process.argv.includes("--clean")) return;
  await seed();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
