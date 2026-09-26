// Centroids for auto-assigning `area` from a report's lat/lng. Only areas with
// a known, trustworthy centroid are listed here — Bahçallëk, Sopot, Kodra e
// Diellit and Rruga e Prizrenit are deliberately absent because their real
// centroids aren't known yet, so a live report there is never auto-assigned
// to them. They remain valid stored values (from seed data or manual edits);
// resolveArea just never produces them.
export const AREA_CENTROIDS: Record<string, [number, number]> = {
  Qendra: [42.385176, 20.430551],
  "Çarshia e Vjetër": [42.38087, 20.426965],
  Krena: [42.378389, 20.429238],
  "Ura e Shejtë": [42.352853, 20.541337],
  Damjan: [42.296, 20.516227],
  Lipovec: [42.311551, 20.477271],
  Ujz: [42.339679, 20.53973],
  "Babaj i Bokës": [42.36167, 20.33417],
};

// Beyond this distance from even the nearest centroid, a pin isn't confidently
// in that area — return null rather than guess. No per-area radii: Qendra,
// Çarshia e Vjetër and Krena are under 1km apart, so per-area radii would overlap.
const MAX_DISTANCE_METERS = 4000;

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

export function resolveArea(lat: number, lng: number): string | null {
  let nearestArea: string | null = null;
  let nearestDistance = Infinity;

  for (const [area, [centroidLat, centroidLng]] of Object.entries(AREA_CENTROIDS)) {
    const distance = haversineMeters(lat, lng, centroidLat, centroidLng);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestArea = area;
    }
  }

  if (nearestArea === null || nearestDistance > MAX_DISTANCE_METERS) return null;
  return nearestArea;
}
