// Population per area, used to derive each area's expected share of reports.
// The four villages are real 2024 Kosovo Agency of Statistics census figures.
// There is no per-neighbourhood breakdown for the urban core, so its 41,809
// population is split evenly across the eight urban areas below — an even
// estimate, not census data.
const URBAN_CORE_POPULATION = 41809;
const URBAN_AREAS = [
  "Qendra",
  "Bahçallëk",
  "Sopot",
  "Kodra e Diellit",
  "Rruga e Prizrenit",
  "Çarshia e Vjetër",
  "Krena",
  "Ura e Shejtë",
];
const URBAN_AREA_POPULATION = URBAN_CORE_POPULATION / URBAN_AREAS.length;

export const AREA_POPULATIONS: Record<string, number> = {
  ...Object.fromEntries(URBAN_AREAS.map((area) => [area, URBAN_AREA_POPULATION])),
  // villages — real census figures
  Damjan: 4212,
  Lipovec: 694,
  "Babaj i Bokës": 487,
  Ujz: 325,
};

// An area reporting at less than this fraction of its expected count is flagged.
export const SILENT_RATIO = 0.6;
// Areas at or above this ratio (with enough volume to matter) are flagged as high volume.
export const HIGH_VOLUME_RATIO = 1.5;
export const HIGH_VOLUME_MIN_REPORTS = 5;

export type SilenceFlag = "silent" | "normal" | "high";

export type SilenceRow = {
  area: string;
  population: number;
  actual: number;
  expected: number;
  ratio: number;
  flag: SilenceFlag;
};

export type SilenceSummary = {
  rows: SilenceRow[];
  totalCounted: number;
  // Reports with no area or an area outside AREA_POPULATIONS — not part of the comparison.
  uncounted: number;
};

/**
 * Compares each area's report count with the count it "should" have if reports
 * were spread in proportion to each area's share of total population. Sorted
 * worst-first (lowest ratio).
 */
export function computeSilenceMap(areas: (string | null)[]): SilenceSummary {
  const counts: Record<string, number> = {};
  for (const name of Object.keys(AREA_POPULATIONS)) counts[name] = 0;

  let uncounted = 0;
  for (const area of areas) {
    if (area && area in counts) counts[area] += 1;
    else uncounted += 1;
  }

  const totalCounted = areas.length - uncounted;
  const totalPopulation = Object.values(AREA_POPULATIONS).reduce((sum, p) => sum + p, 0);

  const rows: SilenceRow[] = Object.entries(AREA_POPULATIONS).map(([area, population]) => {
    const actual = counts[area];
    const expected = (totalCounted * population) / totalPopulation;
    const ratio = expected > 0 ? actual / expected : 0;
    let flag: SilenceFlag = "normal";
    if (totalCounted > 0 && ratio < SILENT_RATIO) flag = "silent";
    else if (ratio >= HIGH_VOLUME_RATIO && actual >= HIGH_VOLUME_MIN_REPORTS) flag = "high";
    return { area, population, actual, expected, ratio, flag };
  });

  rows.sort((a, b) => a.ratio - b.ratio || b.population - a.population);

  return { rows, totalCounted, uncounted };
}
