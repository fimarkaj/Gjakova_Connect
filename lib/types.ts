export type ReportStatus =
  | "submitted"
  | "in_progress"
  | "resolved"
  | "reopened"
  | "confirmed_resolved"
  | "rejected";

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
  quality_flagged: boolean | null;
  normalized_description: string | null;
  created_at: string;
  updated_at: string;
};

// Columns safe to expose to the anon/authenticated Supabase roles — excludes
// notify_email (citizen PII), which only server routes (supabaseAdmin) read.
// Column-level privileges in schema.sql enforce this at the database too, so
// this list must stay in sync with that migration.
export const PUBLIC_REPORT_COLUMNS =
  "id, ticket_code, description, category, urgency, status, area, latitude, longitude, photo_url, duplicate_of, quality_flagged, normalized_description, created_at, updated_at";

// Mirrors the municipality's departments. `scope` is fed to the AI classifier
// (lib/ai.ts) so it knows what each department handles.
export const CATEGORIES: { id: string; label: string; scope: string }[] = [
  { id: "administrata", label: "Administration", scope: "general municipal administration, documents, civil registry, staff conduct, anything that fits no other department" },
  { id: "shendetesi", label: "Health and Social Welfare", scope: "health centers, public health hazards, stray animals, social welfare, vulnerable people" },
  { id: "arsim", label: "Education", scope: "schools, kindergartens, school buildings and yards, education services" },
  { id: "buxhet", label: "Budget and Finance", scope: "municipal taxes, fees, property tax, payments, budget spending" },
  { id: "zhvillim_ekonomik", label: "Economic Development", scope: "businesses, markets, business permits, tourism, employment" },
  { id: "urbanizem", label: "Urban Planning", scope: "illegal construction, building permits, urban planning, public squares, parks and green spaces, graffiti and facades" },
  { id: "bujqesi", label: "Agriculture", scope: "agriculture, farmland, irrigation canals, livestock, rural issues" },
  { id: "sherbime_publike", label: "Public Services", scope: "garbage collection, waste containers, illegal dumps, street cleaning, drinking water supply, sewage, public transport" },
  { id: "infrastruktura", label: "Infrastructure", scope: "roads, potholes, sidewalks, bridges, street lighting, traffic lights and signs, drainage" },
  { id: "kulture", label: "Culture", scope: "cultural heritage, monuments, the old bazaar, museums, cultural events, sports facilities" },
  { id: "mbrojtje_shpetim", label: "Protection and Rescue", scope: "fire, floods, emergencies, dangerous structures, fallen trees, immediate safety hazards" },
  { id: "kadastri", label: "Cadastre", scope: "land parcels, property boundaries, cadastral records, ownership disputes" },
  { id: "inspektorati", label: "Inspectorate", scope: "violations of municipal rules, noise, occupied sidewalks, unhygienic businesses, sanitary and construction inspections" },
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
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
}

export const STATUS_LABELS: Record<ReportStatus, { label: string; cls: string }> = {
  submitted: { label: "Submitted", cls: "status-received" },
  in_progress: { label: "In progress", cls: "status-progress" },
  resolved: { label: "Resolved", cls: "status-resolved" },
  reopened: { label: "Reopened", cls: "status-progress" },
  confirmed_resolved: { label: "Confirmed resolved", cls: "status-resolved" },
  rejected: { label: "Rejected", cls: "status-rejected" },
};

// Statuses staff can set from /admin. "reopened" / "confirmed_resolved" are
// set by citizens via /api/reports/confirm, not by staff. "rejected" is set
// only by rejecting a quality-flagged report (/api/admin/reports/[id]/quality),
// so it stays out of the general status control.
export const STAFF_STATUSES: ReportStatus[] = ["submitted", "in_progress", "resolved"];

export const URGENCY_LABELS: Record<string, { label: string; cls: string; rank: number }> = {
  high: { label: "High", cls: "urgency-high", rank: 3 },
  medium: { label: "Medium", cls: "urgency-medium", rank: 2 },
  low: { label: "Low", cls: "urgency-low", rank: 1 },
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
