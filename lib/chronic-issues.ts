// A "chronic issue" is a cluster of reports that share an area and category
// and sit within ~100m of each other — the same underlying problem being
// reported repeatedly rather than several unrelated one-off tickets. Distance
// clustering (not just area name) matters because an area can be large enough
// that same-category reports from opposite ends of it aren't really the same
// spot. Uses the same haversine approach as lib/ai.ts's findDuplicates().
const CHRONIC_RADIUS_METERS = 100;
export const CHRONIC_MIN_REPORTS = 3;

export type ChronicReport = {
  id: string;
  ticket_code: string;
  area: string | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
};

export type ChronicIssueGroup = {
  key: string;
  area: string;
  category: string;
  reports: ChronicReport[];
  firstReportedAt: string;
};

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Groups reports by area + category, then splits each group into spatial
 * clusters (single-linkage within CHRONIC_RADIUS_METERS). Any cluster with
 * CHRONIC_MIN_REPORTS or more reports is returned as a chronic issue, sorted
 * worst-first (most reports, then oldest).
 */
export function computeChronicIssues(reports: ChronicReport[]): ChronicIssueGroup[] {
  const groups = new Map<string, ChronicReport[]>();
  for (const r of reports) {
    if (!r.area || !r.category || r.latitude == null || r.longitude == null) continue;
    const key = `${r.area}::${r.category}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  const result: ChronicIssueGroup[] = [];

  for (const [key, groupReports] of groups) {
    if (groupReports.length < CHRONIC_MIN_REPORTS) continue;
    const [area, category] = key.split("::");

    // Union-find over pairwise distance to split the group into clusters —
    // a group can contain more than one physical hotspot.
    const n = groupReports.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    function find(i: number): number {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = groupReports[i];
        const b = groupReports[j];
        const distance = haversineMeters(a.latitude!, a.longitude!, b.latitude!, b.longitude!);
        if (distance <= CHRONIC_RADIUS_METERS) {
          const ra = find(i);
          const rb = find(j);
          if (ra !== rb) parent[ra] = rb;
        }
      }
    }

    const clusters = new Map<number, ChronicReport[]>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      const bucket = clusters.get(root);
      if (bucket) bucket.push(groupReports[i]);
      else clusters.set(root, [groupReports[i]]);
    }

    let clusterIndex = 0;
    for (const clusterReports of clusters.values()) {
      if (clusterReports.length < CHRONIC_MIN_REPORTS) continue;
      const sorted = [...clusterReports].sort((a, b) => a.created_at.localeCompare(b.created_at));
      result.push({
        key: `${key}::${clusterIndex++}`,
        area,
        category,
        reports: sorted,
        firstReportedAt: sorted[0].created_at,
      });
    }
  }

  result.sort((a, b) => b.reports.length - a.reports.length || a.firstReportedAt.localeCompare(b.firstReportedAt));

  return result;
}
