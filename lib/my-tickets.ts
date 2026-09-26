// Tracks which ticket codes this browser has submitted, so /raportimet-e-mia
// can show "my reports" without any account or server-side identity lookup.
const STORAGE_KEY = "gjk_my_tickets";

export function getMyTickets(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addMyTicket(ticketCode: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getMyTickets();
    if (existing.includes(ticketCode)) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([ticketCode, ...existing]));
  } catch {
    // localStorage unavailable (private mode, quota) — the ticket code is
    // still shown to the citizen on-screen so they can save it themselves.
  }
}
