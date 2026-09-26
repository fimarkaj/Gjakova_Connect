"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMyTickets } from "@/lib/my-tickets";
import { CATEGORIES, STATUS_LABELS, categoryLabel, isDone } from "@/lib/types";
import type { Report } from "@/lib/types";
import { timeAgo } from "@/lib/time";
import CategoryIcon from "./CategoryIcon";

const ReportsMap = dynamic(() => import("./ReportsMap"), {
  ssr: false,
  loading: () => <div className="pin-map-hint">Duke ngarkuar hartën…</div>,
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

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("reports")
      .select("*")
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
        setConfirmError({ id: report.id, message: body.error || "Diçka shkoi keq." });
        return;
      }
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status: body.report.status } : r)));
    } catch {
      setConfirmError({ id: report.id, message: "Diçka shkoi keq — provo përsëri." });
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
          <h2>Raportimet e mia</h2>
          <p>
            Çdo pikë në hartë është një raportim i qytetarëve. Kliko një pikë ose kërko për ta gjetur
            raportimin tënd.
          </p>
        </div>

        <div className="mine-toggle-row">
          <button
            type="button"
            className={`filter-chip${!onlyMine ? " selected" : ""}`}
            onClick={() => setOnlyMine(false)}
          >
            Të gjitha raportimet
          </button>
          <button
            type="button"
            className={`filter-chip${onlyMine ? " selected" : ""}`}
            onClick={() => setOnlyMine(true)}
          >
            Vetëm të miat
          </button>
        </div>
        {onlyMine && myTickets.length === 0 && (
          <div className="mine-toggle-note">
            Ende nuk ke raportuar asgjë nga ky shfletues.
          </div>
        )}

        <div className="search-bar">
          <SearchIcon />
          <input
            type="text"
            placeholder="Kërko me kod raportimi, përshkrim ose zonë…"
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
            Të gjitha
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
            Të gjitha
          </button>
          <button
            type="button"
            className={`filter-chip${statusFilter === "pending" ? " selected" : ""}`}
            onClick={() => setStatusFilter("pending")}
          >
            Në pritje
          </button>
          <button
            type="button"
            className={`filter-chip${statusFilter === "done" ? " selected" : ""}`}
            onClick={() => setStatusFilter("done")}
          >
            E kryer
          </button>
        </div>

        <div className="feed-grid">
          <div>
            <div className="map-frame" style={{ padding: 0, overflow: "hidden" }}>
              <ReportsMap reports={filtered} onPinClick={handlePinClick} />
            </div>
            <div className="map-caption">Gjakovë — kliko një pikë për ta parë raportimin poshtë</div>
          </div>

          <div>
            {noDataAtAll ? (
              <div className="empty-state">
                <EmptyIcon />
                <p>Ende nuk ka raportime këtu</p>
                <Link href="/raporto" className="btn-primary">
                  Raporto problemin e parë
                </Link>
              </div>
            ) : noResults ? (
              <div className="empty-state">
                <EmptyIcon />
                <p>Asnjë rezultat për këtë kërkim</p>
                <Link href="/raporto" className="btn-primary">
                  Raporto një problem tjetër
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
                            <div className="report-loc">{r.area || "Pikë e shënuar në hartë"}</div>
                          </div>
                          <div className={`status-pill ${st.cls}`}>{st.label}</div>
                        </div>
                        <div className="report-desc">{r.description}</div>
                        <div className="report-meta">
                          {r.ticket_code} · {timeAgo(r.created_at)}
                        </div>

                        {canConfirm && (
                          <div className="confirm-resolved">
                            <span>A u zgjidh me të vërtetë?</span>
                            <div className="confirm-resolved-actions">
                              <button
                                type="button"
                                className="confirm-yes"
                                disabled={confirmBusy === r.id}
                                onClick={() => handleConfirm(r, "confirm")}
                              >
                                Po
                              </button>
                              <button
                                type="button"
                                className="confirm-no"
                                disabled={confirmBusy === r.id}
                                onClick={() => handleConfirm(r, "reopen")}
                              >
                                Jo
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
