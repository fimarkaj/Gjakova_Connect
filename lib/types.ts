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
  created_at: string;
  updated_at: string;
};

export const CATEGORIES: { id: string; label: string }[] = [
  { id: "rruge", label: "Rrugë & Trotuare" },
  { id: "drite", label: "Ndriçim Publik" },
  { id: "mbeturina", label: "Mbeturina" },
  { id: "uji", label: "Uji & Kanalizimi" },
  { id: "gjelberim", label: "Gjelbërim" },
  { id: "tjeter", label: "Tjetër" },
];

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
