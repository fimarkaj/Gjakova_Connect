// Relative population weights per area — rough placeholders, not census figures.
// Only the ratios matter: an area with weight 10 is expected to produce ~3x the
// reports of an area with weight 3. Replace with real population data when available.
export const AREA_WEIGHTS: Record<string, number> = {
  Qendra: 10,
  "Bahçallëk": 8,
  Sopot: 8,
  "Kodra e Diellit": 6,
  "Rruga e Prizrenit": 6,
  "Çarshia e Vjetër": 5,
  Krena: 5,
  "Ura e Shejtë": 4,
  // villages
  Damjan: 3,
  Ujz: 3,
  "Babaj i Bokës": 3,
  Lipovec: 3,
};

// An area reporting at less than this fraction of its expected count is flagged.
export const SILENT_RATIO = 0.6;
// Areas at or above this ratio (with enough volume to matter) are flagged as high volume.
export const HIGH_VOLUME_RATIO = 1.5;
export const HIGH_VOLUME_MIN_REPORTS = 5;

export type SilenceFlag = "silent" | "normal" | "high";

export type SilenceRow = {
  area: string;
  weight: number;
  actual: number;
  expected: number;
  ratio: number;
  flag: SilenceFlag;
};

export type SilenceSummary = {
  rows: SilenceRow[];
  totalCounted: number;
  // Reports with no area or an area outside AREA_WEIGHTS — not part of the comparison.
  uncounted: number;
};

/**
 * Compares each area's report count with the count it "should" have if reports
 * were spread in proportion to AREA_WEIGHTS. Sorted worst-first (lowest ratio).
 */
export function computeSilenceMap(areas: (string | null)[]): SilenceSummary {
  const counts: Record<string, number> = {};
  for (const name of Object.keys(AREA_WEIGHTS)) counts[name] = 0;

  let uncounted = 0;
  for (const area of areas) {
    if (area && area in counts) counts[area] += 1;
    else uncounted += 1;
  }

  const totalCounted = areas.length - uncounted;
  const totalWeight = Object.values(AREA_WEIGHTS).reduce((sum, w) => sum + w, 0);

  const rows: SilenceRow[] = Object.entries(AREA_WEIGHTS).map(([area, weight]) => {
    const actual = counts[area];
    const expected = (totalCounted * weight) / totalWeight;
    const ratio = expected > 0 ? actual / expected : 0;
    let flag: SilenceFlag = "normal";
    if (totalCounted > 0 && ratio < SILENT_RATIO) flag = "silent";
    else if (ratio >= HIGH_VOLUME_RATIO && actual >= HIGH_VOLUME_MIN_REPORTS) flag = "high";
    return { area, weight, actual, expected, ratio, flag };
  });

  rows.sort((a, b) => a.ratio - b.ratio || b.weight - a.weight);

  return { rows, totalCounted, uncounted };
}
