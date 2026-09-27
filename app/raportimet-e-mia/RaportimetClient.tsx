"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMyTickets } from "@/lib/my-tickets";
import { CATEGORIES, PUBLIC_REPORT_COLUMNS, STATUS_LABELS, categoryLabel, isDone } from "@/lib/types";
import type { Report } from "@/lib/types";
import { timeAgo } from "@/lib/time";
import CategoryIcon from "./CategoryIcon";

const ReportsMap = dynamic(() => import("./ReportsMap"), {
  ssr: false,
  loading: () => <div className="pin-map-hint">Loading map…</div>,
});

type StatusFilter = "all" | "pending" | "done";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg
      className="empty-state-icon"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h3l1.5-2.5h7L17 7h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z" />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  );
}

export default function RaportimetClient() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [myTickets, setMyTickets] = useState<string[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [verifiedTicket, setVerifiedTicket] = useState<{ reportId: string; ticketCode: string } | null>(
    null
  );
  const [confirmBusy, setConfirmBusy] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<{ id: string; message: string } | null>(null);

  const [ticketQuery, setTicketQuery] = useState("");
  const [ticketNotFound, setTicketNotFound] = useState(false);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchParams = useSearchParams();
  const ticketDeepLinkHandled = useRef(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("reports")
      .select(PUBLIC_REPORT_COLUMNS)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setReports(data as Report[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMyTickets(getMyTickets());
  }, []);

  const term = search.trim().toLowerCase();

  useEffect(() => {
    if (!term) return;
    const match = reports.find((r) => r.ticket_code.toLowerCase() === term);
    if (match) setVerifiedTicket({ reportId: match.id, ticketCode: match.ticket_code });
  }, [term, reports]);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (onlyMine && !myTickets.includes(r.ticket_code)) return false;
      if (categories.length && (!r.category || !categories.includes(r.category))) return false;
      if (statusFilter === "pending" && isDone(r.status)) return false;
      if (statusFilter === "done" && !isDone(r.status)) return false;
      if (term) {
        const exactTicket = r.ticket_code.toLowerCase() === term;
        const descMatch = r.description.toLowerCase().includes(term);
        const areaMatch = r.area ? r.area.toLowerCase().includes(term) : false;
        if (!exactTicket && !descMatch && !areaMatch) return false;
      }
      return true;
    });
  }, [reports, onlyMine, myTickets, categories, statusFilter, term]);

  function toggleCategory(id: string) {
    setCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function handlePinClick(id: string) {
    setHighlightId(id);
    const el = cardRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHighlightId((current) => (current === id ? null : current)), 1600);
  }

  // Looks up a ticket code across ALL reports (not just this browser's
  // localStorage list) and clears the other filters so the match is
  // guaranteed to be visible, regardless of which category/status was active.
  function lookupTicket(code: string) {
    const normalized = code.trim().toLowerCase();
    if (!normalized) return;
    const match = reports.find((r) => r.ticket_code.toLowerCase() === normalized);
    if (!match) {
      setTicketNotFound(true);
      return;
    }
    setTicketNotFound(false);
    setOnlyMine(false);
    setCategories([]);
    setStatusFilter("all");
    setSearch(match.ticket_code);
    setVerifiedTicket({ reportId: match.id, ticketCode: match.ticket_code });
    requestAnimationFrame(() => handlePinClick(match.id));
  }

  useEffect(() => {
    if (ticketDeepLinkHandled.current || reports.length === 0) return;
    const ticket = searchParams.get("ticket");
    if (!ticket) return;
    ticketDeepLinkHandled.current = true;
    setTicketQuery(ticket);
    lookupTicket(ticket);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, searchParams]);

  async function handleConfirm(report: Report, action: "confirm" | "reopen") {
    const ticketCode = myTickets.includes(report.ticket_code)
      ? report.ticket_code
      : verifiedTicket?.reportId === report.id
        ? verifiedTicket.ticketCode
        : undefined;
    setConfirmBusy(report.id);
    setConfirmError(null);
    try {
      const res = await fetch("/api/reports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: report.id, action, ticketCode }),
      });
      const body = await res.json();
      if (!res.ok) {
        setConfirmError({ id: report.id, message: body.error || "Something went wrong." });
        return;
      }
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status: body.report.status } : r)));
    } catch {
      setConfirmError({ id: report.id, message: "Something went wrong — please try again." });
    } finally {
      setConfirmBusy(null);
    }
  }

  const noDataAtAll = !loading && reports.length === 0;
  const noResults = !loading && reports.length > 0 && filtered.length === 0;

  return (
    <section>
      <div className="wrap">
        <div className="section-head">
          <h2>My reports</h2>
          <p>
            Every point on the map is a citizen report. Click a point or search to find your
            report.
          </p>
        </div>

        <div className="field ticket-lookup">
          <label htmlFor="ticket-lookup-input">Search by ticket number</label>
          <div className="loc-row">
            <input
              id="ticket-lookup-input"
              type="text"
              placeholder="e.g. GJK-1001"
              value={ticketQuery}
              onChange={(e) => {
                setTicketQuery(e.target.value);
                setTicketNotFound(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") lookupTicket(ticketQuery);
              }}
            />
            <button type="button" className="btn-geo" onClick={() => lookupTicket(ticketQuery)}>
              Search
            </button>
          </div>
          {ticketNotFound && (
            <div className="geo-status">No report found with this ticket code.</div>
          )}
        </div>

        <div className="mine-toggle-row">
          <button
            type="button"
            className={`filter-chip${!onlyMine ? " selected" : ""}`}
            onClick={() => setOnlyMine(false)}
          >
            All reports
          </button>
          <button
            type="button"
            className={`filter-chip${onlyMine ? " selected" : ""}`}
            onClick={() => setOnlyMine(true)}
          >
            Mine only
          </button>
        </div>
        {onlyMine && myTickets.length === 0 && (
          <div className="mine-toggle-note">
            You haven&apos;t submitted anything from this browser yet.
          </div>
        )}

        <div className="search-bar">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search by report code, description, or area…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-row">
          <button
            type="button"
            className={`filter-chip${categories.length === 0 ? " selected" : ""}`}
            onClick={() => setCategories([])}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`filter-chip${categories.includes(c.id) ? " selected" : ""}`}
              onClick={() => toggleCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <button
            type="button"
            className={`filter-chip${statusFilter === "all" ? " selected" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`filter-chip${statusFilter === "pending" ? " selected" : ""}`}
            onClick={() => setStatusFilter("pending")}
          >
            Pending
          </button>
          <button
            type="button"
            className={`filter-chip${statusFilter === "done" ? " selected" : ""}`}
            onClick={() => setStatusFilter("done")}
          >
            Done
          </button>
        </div>

        <div className="feed-grid">
          <div>
            <div className="map-frame" style={{ padding: 0, overflow: "hidden" }}>
              <ReportsMap reports={filtered} onPinClick={handlePinClick} />
            </div>
            <div className="map-caption">Gjakova — click a point to see the report below</div>
          </div>

          <div>
            {noDataAtAll ? (
              <div className="empty-state">
                <EmptyIcon />
                <p>No reports here yet</p>
                <Link href="/raporto" className="btn-primary">
                  Submit the first report
                </Link>
              </div>
            ) : noResults ? (
              <div className="empty-state">
                <EmptyIcon />
                <p>No results for this search</p>
                <Link href="/raporto" className="btn-primary">
                  Submit another report
                </Link>
              </div>
            ) : (
              <div className="report-list">
                {filtered.map((r) => {
                  const st = STATUS_LABELS[r.status];
                  const canConfirm =
                    r.status === "resolved" &&
                    (myTickets.includes(r.ticket_code) || verifiedTicket?.reportId === r.id);
                  return (
                    <div
                      key={r.id}
                      id={`card-${r.id}`}
                      ref={(el) => {
                        cardRefs.current[r.id] = el;
                      }}
                      className={`report-card${highlightId === r.id ? " highlight" : ""}`}
                    >
                      <div className={`report-thumb${r.photo_url ? "" : " placeholder"}`}>
                        {r.photo_url ? <img src={r.photo_url} alt="" /> : <CategoryIcon id={r.category} />}
                      </div>
                      <div className="report-body">
                        <div className="report-top">
                          <div>
                            <div className="report-cat">
                              <CategoryIcon id={r.category} />
                              <span>{categoryLabel(r.category)}</span>
                            </div>
                            <div className="report-loc">{r.area || "Point marked on the map"}</div>
                          </div>
                          <div className={`status-pill ${st.cls}`}>{st.label}</div>
                        </div>
                        <div className="report-desc">{r.description}</div>
                        <div className="report-meta">
                          {r.ticket_code} · {timeAgo(r.created_at)}
                        </div>

                        {canConfirm && (
                          <div className="confirm-resolved">
                            <span>Was it really resolved?</span>
                            <div className="confirm-resolved-actions">
                              <button
                                type="button"
                                className="confirm-yes"
                                disabled={confirmBusy === r.id}
                                onClick={() => handleConfirm(r, "confirm")}
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                className="confirm-no"
                                disabled={confirmBusy === r.id}
                                onClick={() => handleConfirm(r, "reopen")}
                              >
                                No
                              </button>
                            </div>
                            {confirmError?.id === r.id && (
                              <div className="confirm-resolved-error">{confirmError.message}</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
