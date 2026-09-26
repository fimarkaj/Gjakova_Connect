export type ReportStatus =
  | "submitted"
  | "in_progress"
  | "resolved"
  | "reopened"
  | "confirmed_resolved";

export type Report = {
  id: string;
  ticket_code: string;
  description: string;
  category: string | null;
  urgency: string | null;
  status: ReportStatus;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  photo_url: string | null;
  duplicate_of: string | null;
  notify_email: string | null;
  created_at: string;
  updated_at: string;
};

// Columns safe to expose to the anon/authenticated Supabase roles — excludes
// notify_email (citizen PII), which only server routes (supabaseAdmin) read.
// Column-level privileges in schema.sql enforce this at the database too, so
// this list must stay in sync with that migration.
export const PUBLIC_REPORT_COLUMNS =
  "id, ticket_code, description, category, urgency, status, area, latitude, longitude, photo_url, duplicate_of, created_at, updated_at";

// Mirrors the municipality's departments. `scope` is fed to the AI classifier
// (lib/ai.ts) so it knows what each department handles.
export const CATEGORIES: { id: string; label: string; scope: string }[] = [
  { id: "administrata", label: "Administrata", scope: "general municipal administration, documents, civil registry, staff conduct, anything that fits no other department" },
  { id: "shendetesi", label: "Shëndetësi dhe Mirëqenie Sociale", scope: "health centers, public health hazards, stray animals, social welfare, vulnerable people" },
  { id: "arsim", label: "Arsim", scope: "schools, kindergartens, school buildings and yards, education services" },
  { id: "buxhet", label: "Buxhet dhe Financa", scope: "municipal taxes, fees, property tax, payments, budget spending" },
  { id: "zhvillim_ekonomik", label: "Zhvillimi Ekonomik", scope: "businesses, markets, business permits, tourism, employment" },
  { id: "urbanizem", label: "Urbanizëm", scope: "illegal construction, building permits, urban planning, public squares, parks and green spaces, graffiti and facades" },
  { id: "bujqesi", label: "Bujqësi", scope: "agriculture, farmland, irrigation canals, livestock, rural issues" },
  { id: "sherbime_publike", label: "Shërbime publike", scope: "garbage collection, waste containers, illegal dumps, street cleaning, drinking water supply, sewage, public transport" },
  { id: "infrastruktura", label: "Infrastruktura", scope: "roads, potholes, sidewalks, bridges, street lighting, traffic lights and signs, drainage" },
  { id: "kulture", label: "Kulturë", scope: "cultural heritage, monuments, the old bazaar, museums, cultural events, sports facilities" },
  { id: "mbrojtje_shpetim", label: "Mbrojtje dhe Shpëtim", scope: "fire, floods, emergencies, dangerous structures, fallen trees, immediate safety hazards" },
  { id: "kadastri", label: "Kadastri", scope: "land parcels, property boundaries, cadastral records, ownership disputes" },
  { id: "inspektorati", label: "Inspektorati", scope: "violations of municipal rules, noise, occupied sidewalks, unhygienic businesses, sanitary and construction inspections" },
];

export type Department = {
  id: string;
  name: string;
  category: string | null;
  contact_email: string | null;
  updated_at: string;
};

export type DepartmentSend = {
  department_id: string;
  department_name: string | null;
  sent_to_email: string;
  sent_at: string;
};

export function categoryLabel(id: string | null): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Tjetër";
}

export const STATUS_LABELS: Record<ReportStatus, { label: string; cls: string }> = {
  submitted: { label: "Pranuar", cls: "status-received" },
  in_progress: { label: "Në proces", cls: "status-progress" },
  resolved: { label: "Zgjidhur", cls: "status-resolved" },
  reopened: { label: "Rihapur", cls: "status-progress" },
  confirmed_resolved: { label: "Konfirmuar e zgjidhur", cls: "status-resolved" },
};

// Statuses staff can set from /admin. "reopened" / "confirmed_resolved" are
// set by citizens via /api/reports/confirm, not by staff.
export const STAFF_STATUSES: ReportStatus[] = ["submitted", "in_progress", "resolved"];

export const URGENCY_LABELS: Record<string, { label: string; cls: string; rank: number }> = {
  high: { label: "E lartë", cls: "urgency-high", rank: 3 },
  medium: { label: "Mesatare", cls: "urgency-medium", rank: 2 },
  low: { label: "E ulët", cls: "urgency-low", rank: 1 },
};

export function urgencyRank(urgency: string | null): number {
  return (urgency && URGENCY_LABELS[urgency]?.rank) || 0;
}

// Pin colors on the map, per the mockup's status palette.
export function statusPinColor(status: ReportStatus): string {
  if (status === "resolved" || status === "confirmed_resolved") return "var(--olive)";
  if (status === "in_progress" || status === "reopened") return "var(--amber)";
  return "var(--clay)";
}

// Pin colors for the /admin map — unlike statusPinColor, staff need reopened
// (a citizen rejecting a resolution) visually distinct from in_progress.
export function adminPinColor(status: ReportStatus): string {
  if (status === "resolved" || status === "confirmed_resolved") return "var(--olive)";
  if (status === "in_progress") return "var(--amber)";
  if (status === "reopened") return "var(--clay)";
  return "var(--slate)";
}

export function isDone(status: ReportStatus): boolean {
  return status === "resolved" || status === "confirmed_resolved";
}
