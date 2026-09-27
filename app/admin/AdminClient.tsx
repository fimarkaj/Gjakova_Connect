"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  CATEGORIES,
  PUBLIC_REPORT_COLUMNS,
  STAFF_STATUSES,
  STATUS_LABELS,
  URGENCY_LABELS,
  categoryLabel,
  urgencyRank,
} from "@/lib/types";
import type { Department, DepartmentSend, Report, ReportStatus } from "@/lib/types";
import { AREA_POPULATIONS } from "@/lib/silence-map";
import { formatClock, formatDate, timeAgo } from "@/lib/time";
import AdminNav from "./AdminNav";
import { InlineError, TableSkeleton } from "./AdminStates";

const AdminMap = dynamic(() => import("./AdminMap"), {
  ssr: false,
  loading: () => <div className="pin-map-hint">Duke ngarkuar hartën…</div>,
});

type SortKey = "newest" | "urgency";
type View = "table" | "map";

const NO_AREA = "__none__";

const MAP_LEGEND: { status: ReportStatus; color: string; label: string }[] = [
  { status: "submitted", color: "var(--slate)", label: "Pranuar" },
  { status: "in_progress", color: "var(--amber)", label: "Në proces" },
  { status: "resolved", color: "var(--olive)", label: "Zgjidhur" },
  { status: "reopened", color: "var(--clay)", label: "Rihapur" },
];

function UrgencyPill({ urgency }: { urgency: string | null }) {
  const u = urgency ? URGENCY_LABELS[urgency] : undefined;
  if (!u) return <span className="urgency-pill urgency-none">—</span>;
  return <span className={`urgency-pill ${u.cls}`}>{u.label}</span>;
}

function StatusPill({ status }: { status: ReportStatus }) {
  const st = STATUS_LABELS[status];
  return <span className={`status-pill ${st.cls}`}>{st.label}</span>;
}

export default function AdminClient() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("newest");
  const [view, setView] = useState<View>("table");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // notify_email is PII, and flag_reason and reasoning are staff-only notes —
  // all three are excluded from the anon-key list fetch above, so they're
  // loaded per report (via the admin-gated API route) only when its detail
  // panel is open.
  const [detailMeta, setDetailMeta] = useState<{
    reportId: string;
    notifyEmail: string | null;
    flagReason: string | null;
    reasoning: string | null;
    clarificationSentAt: string | null;
  } | null>(null);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [notifySent, setNotifySent] = useState<string | null>(null);

  // Departments for the "Send to Department" control — loaded once, reused
  // across every report detail panel.
  const [departments, setDepartments] = useState<Department[]>([]);
  const [detailSends, setDetailSends] = useState<{ reportId: string; sends: DepartmentSend[] } | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // The AI-written work order awaiting the clerk's review. Nothing is ever sent
  // until they approve it, so this holds the whole send flow: no preview, no send.
  const [workOrder, setWorkOrder] = useState<{
    reportId: string;
    departmentId: string;
    subject: string;
    body: string;
    fallback: boolean;
    fallbackReason: string | null;
  } | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // The AI-drafted clarification email awaiting the clerk's review. Same rule
  // as the work order: nothing reaches the citizen until they approve it.
  const [clarification, setClarification] = useState<{
    reportId: string;
    subject: string;
    body: string;
  } | null>(null);
  const [clarBusy, setClarBusy] = useState(false);
  const [clarSendBusy, setClarSendBusy] = useState(false);
  const [clarError, setClarError] = useState<string | null>(null);

  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Duplicate clusters are collapsed until the clerk opens one. Similarity is
  // not a stored column, so it is fetched per cluster on first expand and cached
  // here; "pending" renders as an ellipsis rather than a misleading zero.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [similarities, setSimilarities] = useState<Record<string, Record<string, number | null>>>({});

  const toggleCluster = useCallback(
    (canonicalId: string, duplicateIds: string[]) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(canonicalId)) {
          next.delete(canonicalId);
          return next;
        }
        next.add(canonicalId);
        return next;
      });

      setSimilarities((prev) => {
        if (prev[canonicalId] || duplicateIds.length === 0) return prev;
        const ids = encodeURIComponent(duplicateIds.join(","));
        fetch(`/api/admin/reports/${canonicalId}/duplicates?ids=${ids}`)
          .then((res) => res.json())
          .then((body) => {
            if (!body?.similarities) return;
            setSimilarities((current) => ({ ...current, [canonicalId]: body.similarities }));
          })
          .catch(() => {
            // Leave it pending-with-no-data: the rows still show code and date.
            setSimilarities((current) => ({ ...current, [canonicalId]: {} }));
          });
        return prev;
      });
    },
    []
  );

  const searchParams = useSearchParams();
  const deepLinkHandled = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("reports")
      .select(PUBLIC_REPORT_COLUMNS)
      .order("created_at", { ascending: false });
    if (error || !data) {
      setLoadError("Raportimet nuk u ngarkuan.");
    } else {
      setReports(data as Report[]);
      setLoadedAt(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/admin/departments")
      .then((res) => res.json())
      .then((body) => {
        if (body?.departments) setDepartments(body.departments as Department[]);
      })
      .catch(() => {
        // The send-to-department control just stays empty if this fails —
        // staff can still change status and use the notify-citizen flow.
      });
  }, []);

  // Live updates: new submissions and status changes land here without a manual
  // refresh. The refresh button stays as a fallback if the socket ever drops.
  useEffect(() => {
    const channel = supabase
      .channel("admin-reports-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reports" },
        (payload) => {
          const incoming = payload.new as Report;
          setReports((prev) =>
            prev.some((r) => r.id === incoming.id) ? prev : [incoming, ...prev]
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "reports" },
        (payload) => {
          const updated = payload.new as Report;
          setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Supports links like /admin/chronic-issues linking a ticket straight into
  // its detail panel here. Only fires once — reopening after the user closes
  // it would be surprising.
  useEffect(() => {
    if (deepLinkHandled.current || reports.length === 0) return;
    const reportId = searchParams.get("report");
    if (!reportId) return;
    deepLinkHandled.current = true;
    if (reports.some((r) => r.id === reportId)) openDetail(reportId);
  }, [reports, searchParams]);

  const areaOptions = useMemo(() => {
    const names = new Set(Object.keys(AREA_POPULATIONS));
    for (const r of reports) if (r.area) names.add(r.area);
    return Array.from(names).sort((a, b) => a.localeCompare(b, "sq"));
  }, [reports]);

  // Safe to count over every report rather than per cluster: the quality gate
  // runs before duplicate detection and returns early when it flags, so a
  // flagged report never has duplicate_of set and is always its own canonical row.
  const flaggedCount = useMemo(() => reports.filter((r) => r.quality_flagged).length, [reports]);

  // Duplicates collapse into one cluster per real-world issue. A report with
  // duplicate_of set is never its own top-level row; it is listed under the
  // cluster's canonical report instead.
  //
  // duplicate_of can chain (report C matching report B, which already matched
  // report A), so membership is resolved by walking up to the chain root rather
  // than by grouping on duplicate_of directly. A report whose parent is not in
  // the loaded set — or one caught in a cycle — falls back to being its own
  // root, so no report can ever disappear from the table.
  const clusters = useMemo(() => {
    const byId = new Map(reports.map((r) => [r.id, r]));

    function rootOf(report: Report): Report {
      let current = report;
      const seen = new Set<string>([current.id]);
      while (current.duplicate_of) {
        const parent = byId.get(current.duplicate_of);
        if (!parent || seen.has(parent.id)) break;
        seen.add(parent.id);
        current = parent;
      }
      return current;
    }

    const members = new Map<string, Report[]>();
    for (const report of reports) {
      const root = rootOf(report);
      const list = members.get(root.id);
      if (list) list.push(report);
      else members.set(root.id, [report]);
    }

    const built = Array.from(members.values()).map((group) => {
      // Oldest first, so the canonical report is the earliest one reported.
      const ordered = [...group].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const [canonical, ...duplicates] = ordered;
      return { canonical, duplicates };
    });

    // Filters and sorting apply to the canonical report, so a cluster counts
    // once however many duplicates it holds.
    const rows = built.filter(({ canonical: r }) => {
      if (reviewOnly && !r.quality_flagged) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (areaFilter === NO_AREA && r.area) return false;
      if (areaFilter && areaFilter !== NO_AREA && r.area !== areaFilter) return false;
      return true;
    });

    // `reports` is already newest-first from the query, which clustering
    // preserved; urgency sort keeps that as the tiebreak.
    rows.sort((a, b) =>
      sort === "urgency"
        ? urgencyRank(b.canonical.urgency) - urgencyRank(a.canonical.urgency)
        : new Date(b.canonical.created_at).getTime() - new Date(a.canonical.created_at).getTime()
    );
    return rows;
  }, [reports, reviewOnly, statusFilter, categoryFilter, areaFilter, sort]);

  // The canonical rows alone, for the map and the empty/count checks — one pin
  // and one tally per issue, matching the table.
  const filtered = useMemo(() => clusters.map((c) => c.canonical), [clusters]);

  const hasFilters = Boolean(statusFilter || categoryFilter || areaFilter || reviewOnly);

  function clearFilters() {
    setStatusFilter("");
    setCategoryFilter("");
    setAreaFilter("");
    setReviewOnly(false);
  }

  const selected = selectedId ? reports.find((r) => r.id === selectedId) ?? null : null;
  const duplicateOf = selected?.duplicate_of
    ? reports.find((r) => r.id === selected.duplicate_of) ?? null
    : null;

  const closeDetail = useCallback(() => setSelectedId(null), []);

  function openDetail(id: string) {
    setSelectedId(id);
    setStatusError(null);
    setNotifyError(null);
    setNotifySent(null);
    setDetailMeta(null);
    setSendError(null);
    setDetailSends(null);
    setReviewError(null);
    setWorkOrder(null);
    setGenError(null);
    setClarification(null);
    setClarError(null);
    fetch(`/api/admin/reports/${id}`)
      .then((res) => res.json())
      .then((body) => {
        if (body?.report) {
          setDetailMeta({
            reportId: id,
            notifyEmail: body.report.notify_email ?? null,
            flagReason: body.report.flag_reason ?? null,
            reasoning: body.report.reasoning ?? null,
            clarificationSentAt: body.report.clarification_sent_at ?? null,
          });
        }
        setDetailSends({ reportId: id, sends: (body?.sends ?? []) as DepartmentSend[] });
      })
      .catch(() => {
        // Detail panel still works without it — the notify button just stays hidden.
      });
  }

  async function reviewReport(report: Report, action: "accept" | "reject") {
    setReviewBusy(true);
    setReviewError(null);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}/quality`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) {
        setReviewError(body.error || "Diçka shkoi keq.");
        return;
      }
      setReports((prev) => prev.map((r) => (r.id === report.id ? (body.report as Report) : r)));
    } catch {
      setReviewError("Diçka shkoi keq — provo përsëri.");
    } finally {
      setReviewBusy(false);
    }
  }

  // Generation never sends. A failure here still yields a usable preview: the
  // route returns the fixed template with fallback: true, which the panel shows
  // with an inline notice so the clerk always knows what they are about to send.
  async function prepareWorkOrder(report: Report, departmentId: string, adminNote: string) {
    setGenBusy(true);
    setGenError(null);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}/send-department/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, adminNote }),
      });
      const body = await res.json();
      if (!res.ok) {
        setGenError(body.error || "Përgatitja e email-it dështoi.");
        return;
      }
      setWorkOrder({
        reportId: report.id,
        departmentId,
        subject: body.subject as string,
        body: body.body as string,
        fallback: Boolean(body.fallback),
        fallbackReason: (body.fallbackReason as string | undefined) ?? null,
      });
    } catch {
      setGenError("Diçka shkoi keq — provo përsëri.");
    } finally {
      setGenBusy(false);
    }
  }

  function cancelWorkOrder() {
    setWorkOrder(null);
    setGenError(null);
    setSendError(null);
  }

  // Drafting never sends. Unlike the work order there is no fallback template:
  // a failure is surfaced inline and leaves the clerk with nothing to send by
  // mistake — a generic "tell us more" letter would read to the citizen as if
  // it had been written about their report.
  async function prepareClarification(report: Report) {
    setClarBusy(true);
    setClarError(null);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}/clarification/generate`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        setClarError(body.error || "Përgatitja e email-it dështoi.");
        return;
      }
      setClarification({
        reportId: report.id,
        subject: body.subject as string,
        body: body.body as string,
      });
    } catch {
      setClarError("Diçka shkoi keq — provo përsëri.");
    } finally {
      setClarBusy(false);
    }
  }

  function cancelClarification() {
    setClarification(null);
    setClarError(null);
  }

  async function sendClarification(report: Report, subject: string, emailBody: string) {
    setClarSendBusy(true);
    setClarError(null);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}/clarification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body: emailBody }),
      });
      const body = await res.json();
      if (!res.ok) {
        setClarError(body.error || "Diçka shkoi keq.");
        return;
      }
      if (body.demo) {
        setClarError("Nuk u dërgua me të vërtetë — GMAIL_USER/GMAIL_APP_PASSWORD mungon (mënyra demo).");
        return;
      }
      setClarification(null);
      // Stamp the open panel so the clerk sees straight away that the request
      // went out, without having to reopen the report.
      setDetailMeta((prev) =>
        prev && prev.reportId === report.id
          ? {
              ...prev,
              clarificationSentAt:
                (body.clarificationSentAt as string | null) ?? new Date().toISOString(),
            }
          : prev
      );
    } catch {
      setClarError("Diçka shkoi keq — provo përsëri.");
    } finally {
      setClarSendBusy(false);
    }
  }

  async function sendToDepartment(report: Report, departmentId: string, subject: string, emailBody: string) {
    setSendBusy(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}/send-department`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, subject, body: emailBody }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSendError(body.error || "Diçka shkoi keq.");
        return;
      }
      if (body.demo) {
        setSendError("Nuk u dërgua me të vërtetë — GMAIL_USER/GMAIL_APP_PASSWORD mungon (mënyra demo).");
        return;
      }
      setWorkOrder(null);
      // Refresh the send history so "Sent to X on <date>" reflects this send.
      fetch(`/api/admin/reports/${report.id}`)
        .then((r) => r.json())
        .then((b) => setDetailSends({ reportId: report.id, sends: (b?.sends ?? []) as DepartmentSend[] }))
        .catch(() => {});
    } catch {
      setSendError("Diçka shkoi keq — provo përsëri.");
    } finally {
      setSendBusy(false);
    }
  }

  async function sendManualNotify(report: Report, message?: string) {
    setNotifyBusy(true);
    setNotifyError(null);
    setNotifySent(null);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotifyError(body.error || "Diçka shkoi keq.");
        return;
      }
      setNotifySent(body.demo ? "U regjistrua në konsolë (mënyra demo)." : "Email-i u dërgua.");
    } catch {
      setNotifyError("Diçka shkoi keq — provo përsëri.");
    } finally {
      setNotifyBusy(false);
    }
  }

  async function changeStatus(report: Report, status: ReportStatus) {
    if (status === report.status) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatusError(body.error || "Diçka shkoi keq.");
        return;
      }
      setReports((prev) => prev.map((r) => (r.id === report.id ? (body.report as Report) : r)));
    } catch {
      setStatusError("Diçka shkoi keq — provo përsëri.");
    } finally {
      setStatusBusy(false);
    }
  }

  const initialLoad = loading && !loadedAt;

  return (
    <section>
      <div className="wrap">
        <div className="section-head">
          <h2>Paneli i stafit</h2>
          <p>Të gjitha raportimet e qytetarëve. Kliko një rresht për detajet dhe për të ndryshuar statusin.</p>
        </div>

        <AdminNav />

        <div className="filter-row">
          <button
            type="button"
            className={`filter-chip${view === "table" ? " selected" : ""}`}
            onClick={() => setView("table")}
          >
            Tabela
          </button>
          <button
            type="button"
            className={`filter-chip${view === "map" ? " selected" : ""}`}
            onClick={() => setView("map")}
          >
            Harta
          </button>
          <button
            type="button"
            className={`filter-chip filter-chip-review${reviewOnly ? " selected" : ""}`}
            aria-pressed={reviewOnly}
            onClick={() => setReviewOnly((v) => !v)}
          >
            Për rishikim
            <span className="chip-count">{flaggedCount}</span>
          </button>
        </div>

        <div className="admin-toolbar">
          <label className="admin-control">
            <span>Statusi</span>
            <select className="admin-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Të gjitha</option>
              {(Object.keys(STATUS_LABELS) as ReportStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-control">
            <span>Kategoria</span>
            <select
              className="admin-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Të gjitha</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-control">
            <span>Zona</span>
            <select className="admin-select" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
              <option value="">Të gjitha</option>
              {areaOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              <option value={NO_AREA}>Pa zonë</option>
            </select>
          </label>
          <label className="admin-control">
            <span>Rendit sipas</span>
            <select className="admin-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="newest">Më të rejat</option>
              <option value="urgency">Urgjencës</option>
            </select>
          </label>
          <button type="button" className="btn-geo admin-refresh" onClick={load} disabled={loading}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 11a8 8 0 10-2.3 5.7" />
              <path d="M20 4v7h-7" />
            </svg>
            {loading ? "Duke rifreskuar…" : "Rifresko"}
          </button>
        </div>

        {!initialLoad && !loadError && (
          <div className="admin-meta">
            {filtered.length} nga {reports.length} raportime
            {loadedAt && ` · përditësuar ${formatClock(loadedAt)}`}
          </div>
        )}

        {loadError && <InlineError message={loadError} onRetry={load} />}

        {initialLoad ? (
          <TableSkeleton cols={6} />
        ) : loadError && reports.length === 0 ? null : reports.length === 0 ? (
          <div className="empty-state">
            <p>Ende nuk ka asnjë raportim.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>Asnjë raportim nuk përputhet me këta filtra.</p>
            {hasFilters && (
              <button type="button" className="btn-ghost" onClick={clearFilters}>
                Pastro filtrat
              </button>
            )}
          </div>
        ) : view === "map" ? (
          <>
            <div className="admin-map-frame">
              <AdminMap reports={filtered} onPinClick={openDetail} />
            </div>
            <div className="admin-map-legend">
              {MAP_LEGEND.map((l) => (
                <span key={l.status}>
                  <i style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Kodi</th>
                  <th>Zona</th>
                  <th>Kategoria</th>
                  <th>Urgjenca</th>
                  <th>Statusi</th>
                  <th>Krijuar</th>
                </tr>
              </thead>
              <tbody>
                {clusters.map(({ canonical: r, duplicates }) => {
                  const isOpen = expanded.has(r.id);
                  const scores = similarities[r.id];
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={`admin-row${selectedId === r.id ? " selected" : ""}${
                          r.quality_flagged ? " row-flagged" : ""
                        }`}
                        tabIndex={0}
                        onClick={() => openDetail(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openDetail(r.id);
                          }
                        }}
                      >
                        <td className="admin-ticket">
                          {duplicates.length > 0 && (
                            <button
                              type="button"
                              className="dup-toggle"
                              aria-expanded={isOpen}
                              aria-label={
                                isOpen
                                  ? `Fshih ${duplicates.length} dublikate të ${r.ticket_code}`
                                  : `Shfaq ${duplicates.length} dublikate të ${r.ticket_code}`
                              }
                              onClick={(e) => {
                                // The row itself opens the detail panel.
                                e.stopPropagation();
                                toggleCluster(
                                  r.id,
                                  duplicates.map((d) => d.id)
                                );
                              }}
                            >
                              {isOpen ? "−" : "+"}
                            </button>
                          )}
                          {r.ticket_code}
                          {r.quality_flagged && <span className="flag-tag">për rishikim</span>}
                          {duplicates.length > 0 && (
                            <span className="dup-tag">+{duplicates.length} dublikate</span>
                          )}
                        </td>
                        <td>{r.area || <span className="admin-muted">Pa zonë</span>}</td>
                        <td>{categoryLabel(r.category)}</td>
                        <td>
                          <UrgencyPill urgency={r.urgency} />
                        </td>
                        <td>
                          <StatusPill status={r.status} />
                        </td>
                        <td className="admin-date" title={formatDate(r.created_at, true)}>
                          {formatDate(r.created_at)}
                        </td>
                      </tr>

                      {isOpen &&
                        duplicates.map((d) => {
                          const score = scores ? scores[d.id] : undefined;
                          return (
                            <tr
                              key={d.id}
                              className={`admin-row admin-row-dup${selectedId === d.id ? " selected" : ""}`}
                              tabIndex={0}
                              onClick={() => openDetail(d.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openDetail(d.id);
                                }
                              }}
                            >
                              <td className="admin-ticket admin-ticket-dup">
                                <span className="dup-branch" aria-hidden="true" />
                                {d.ticket_code}
                              </td>
                              <td colSpan={3} className="admin-muted dup-meta">
                                Ngjashmëria:{" "}
                                {score == null ? (
                                  <span className="admin-muted">{scores ? "—" : "…"}</span>
                                ) : (
                                  <strong>{(score * 100).toFixed(1)}%</strong>
                                )}
                              </td>
                              <td>
                                <StatusPill status={d.status} />
                              </td>
                              <td className="admin-date" title={formatDate(d.created_at, true)}>
                                {formatDate(d.created_at)}
                              </td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <ReportDetail
          report={selected}
          duplicateOf={duplicateOf}
          busy={statusBusy}
          error={statusError}
          onClose={closeDetail}
          onOpen={openDetail}
          onChangeStatus={(s) => changeStatus(selected, s)}
          flagReason={detailMeta?.reportId === selected.id ? detailMeta.flagReason : null}
          reasoning={detailMeta?.reportId === selected.id ? detailMeta.reasoning : null}
          reviewBusy={reviewBusy}
          reviewError={reviewError}
          onReview={(action) => reviewReport(selected, action)}
          notifyEmail={detailMeta?.reportId === selected.id ? detailMeta.notifyEmail : null}
          notifyBusy={notifyBusy}
          notifyError={notifyError}
          notifySent={notifySent}
          onSendNotify={(message) => sendManualNotify(selected, message)}
          departments={departments}
          sends={detailSends?.reportId === selected.id ? detailSends.sends : []}
          sendBusy={sendBusy}
          sendError={sendError}
          onSendDepartment={(departmentId, subject, emailBody) =>
            sendToDepartment(selected, departmentId, subject, emailBody)
          }
          workOrder={workOrder?.reportId === selected.id ? workOrder : null}
          genBusy={genBusy}
          genError={genError}
          onPrepareWorkOrder={(departmentId, adminNote) =>
            prepareWorkOrder(selected, departmentId, adminNote)
          }
          onCancelWorkOrder={cancelWorkOrder}
          metaLoaded={detailMeta?.reportId === selected.id}
          clarificationSentAt={detailMeta?.reportId === selected.id ? detailMeta.clarificationSentAt : null}
          clarification={clarification?.reportId === selected.id ? clarification : null}
          clarBusy={clarBusy}
          clarSendBusy={clarSendBusy}
          clarError={clarError}
          onPrepareClarification={() => prepareClarification(selected)}
          onSendClarification={(subject, emailBody) => sendClarification(selected, subject, emailBody)}
          onCancelClarification={cancelClarification}
        />
      )}
    </section>
  );
}

function ReportDetail({
  report,
  duplicateOf,
  busy,
  error,
  onClose,
  onOpen,
  onChangeStatus,
  flagReason,
  reasoning,
  reviewBusy,
  reviewError,
  onReview,
  notifyEmail,
  notifyBusy,
  notifyError,
  notifySent,
  onSendNotify,
  departments,
  sends,
  sendBusy,
  sendError,
  onSendDepartment,
  workOrder,
  genBusy,
  genError,
  onPrepareWorkOrder,
  onCancelWorkOrder,
  metaLoaded,
  clarificationSentAt,
  clarification,
  clarBusy,
  clarSendBusy,
  clarError,
  onPrepareClarification,
  onSendClarification,
  onCancelClarification,
}: {
  report: Report;
  duplicateOf: Report | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onOpen: (id: string) => void;
  onChangeStatus: (status: ReportStatus) => void;
  flagReason: string | null;
  reasoning: string | null;
  reviewBusy: boolean;
  reviewError: string | null;
  onReview: (action: "accept" | "reject") => void;
  notifyEmail: string | null;
  notifyBusy: boolean;
  notifyError: string | null;
  notifySent: string | null;
  onSendNotify: (message?: string) => void;
  departments: Department[];
  sends: DepartmentSend[];
  sendBusy: boolean;
  sendError: string | null;
  onSendDepartment: (departmentId: string, subject: string, body: string) => void;
  workOrder: WorkOrderPreview | null;
  genBusy: boolean;
  genError: string | null;
  onPrepareWorkOrder: (departmentId: string, adminNote: string) => void;
  onCancelWorkOrder: () => void;
  metaLoaded: boolean;
  clarificationSentAt: string | null;
  clarification: EmailDraft | null;
  clarBusy: boolean;
  clarSendBusy: boolean;
  clarError: string | null;
  onPrepareClarification: () => void;
  onSendClarification: (subject: string, body: string) => void;
  onCancelClarification: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [deptId, setDeptId] = useState("");

  // Default to the department matching this report's category, falling back
  // to "Administrata" (the catch-all department) if none matches yet.
  useEffect(() => {
    const match = departments.find((d) => d.category === report.category);
    const fallback = departments.find((d) => d.category === "administrata");
    setDeptId(match?.id ?? fallback?.id ?? departments[0]?.id ?? "");
  }, [report.id, departments, report.category]);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-head">
          <div>
            <div className="report-cat">{categoryLabel(report.category)}</div>
            {reasoning && (
              <p className="detail-reasoning">
                <span className="ai-tag">gjeneruar nga AI</span>
                {reasoning}
              </p>
            )}
            <h3 id="detail-title">{report.ticket_code}</h3>
          </div>
          <button ref={closeRef} type="button" className="preview-remove detail-close" onClick={onClose} aria-label="Mbyll">
            &times;
          </button>
        </div>

        {report.photo_url && (
          <div className="detail-photo">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote Supabase storage URL */}
            <img src={report.photo_url} alt="" />
          </div>
        )}

        {report.quality_flagged ? (
          <div className="detail-review">
            <div className="review-head">
              <span className="flag-tag">për rishikim</span>
              <span>Porta e cilësisë e shënoi këtë raportim</span>
            </div>
            {flagReason && <p className="review-reason">{flagReason}</p>}
            <div className="review-original">
              <label>Raportimi origjinal:</label>
              <p>{report.description}</p>
            </div>
            <div className="loc-row review-actions">
              <button
                type="button"
                className="btn-geo btn-geo-full"
                disabled={reviewBusy}
                onClick={() => onReview("accept")}
              >
                {reviewBusy ? "Duke ruajtur…" : "Prano"}
              </button>
              <button
                type="button"
                className="btn-ghost review-reject"
                disabled={reviewBusy}
                onClick={() => onReview("reject")}
              >
                Refuzo
              </button>
            </div>
            {reviewError && <div className="confirm-resolved-error detail-error">{reviewError}</div>}

            {/* Held back until the per-report fetch lands: notify_email is not
                in the list payload, so before it resolves "no address" and "not
                loaded yet" look identical. */}
            {metaLoaded && (
              <ClarificationRequest
                notifyEmail={notifyEmail}
                sentAt={clarificationSentAt}
                draft={clarification}
                busy={clarBusy}
                sendBusy={clarSendBusy}
                error={clarError}
                onPrepare={onPrepareClarification}
                onSend={onSendClarification}
                onCancel={onCancelClarification}
              />
            )}
          </div>
        ) : report.normalized_description ? (
          <>
            <p className="detail-desc">{report.normalized_description}</p>
            <div className="detail-original">
              <label>Raportimi origjinal:</label>
              <p>{report.description}</p>
            </div>
          </>
        ) : (
          <p className="detail-desc">{report.description}</p>
        )}

        <dl className="detail-grid">
          <dt>Zona</dt>
          <dd>{report.area || "Pa zonë"}</dd>
          <dt>Urgjenca</dt>
          <dd>
            <UrgencyPill urgency={report.urgency} />
          </dd>
          <dt>Krijuar</dt>
          <dd>
            {formatDate(report.created_at, true)} · {timeAgo(report.created_at)}
          </dd>
          <dt>Përditësuar</dt>
          <dd>{formatDate(report.updated_at, true)}</dd>
          {report.latitude != null && report.longitude != null && (
            <>
              <dt>Koordinatat</dt>
              <dd>
                {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
              </dd>
            </>
          )}
          {report.duplicate_of && (
            <>
              <dt>Dublikatë e</dt>
              <dd>
                {duplicateOf ? (
                  <button type="button" className="link-button" onClick={() => onOpen(duplicateOf.id)}>
                    {duplicateOf.ticket_code}
                  </button>
                ) : (
                  <code>{report.duplicate_of}</code>
                )}
              </dd>
            </>
          )}
        </dl>

        <div className="field detail-status">
          <label>
            Statusi <span className="hint">aktualisht: {STATUS_LABELS[report.status].label}</span>
          </label>
          <div className="chip-row">
            {STAFF_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip${report.status === s ? " selected" : ""}`}
                disabled={busy}
                aria-pressed={report.status === s}
                onClick={() => onChangeStatus(s)}
              >
                {STATUS_LABELS[s].label}
              </button>
            ))}
          </div>
          {busy && <div className="geo-status">Duke ruajtur…</div>}
          {error && <div className="confirm-resolved-error detail-error">{error}</div>}
        </div>

        {notifyEmail && (
          <div className="field detail-notify">
            <label>
              Njoftim me email <span className="hint">{notifyEmail}</span>
            </label>
            {notifyOpen ? (
              <>
                <textarea
                  rows={2}
                  placeholder="Mesazh i shkurtër opsional (nëse bosh, dërgohet njoftimi standard i statusit)"
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                />
                <div className="loc-row">
                  <button
                    type="button"
                    className="btn-geo btn-geo-full"
                    disabled={notifyBusy}
                    onClick={() => onSendNotify(notifyMessage.trim() || undefined)}
                  >
                    {notifyBusy ? "Duke dërguar…" : "Dërgo"}
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="btn-geo btn-geo-full" onClick={() => setNotifyOpen(true)}>
                Dërgo njoftim me email
              </button>
            )}
            {notifySent && <div className="geo-status">{notifySent}</div>}
            {notifyError && <div className="confirm-resolved-error detail-error">{notifyError}</div>}
          </div>
        )}

        {departments.length > 0 && (
          <SendToDepartment
            departments={departments}
            sends={sends}
            deptId={deptId}
            onChangeDeptId={setDeptId}
            busy={sendBusy}
            error={sendError}
            onSend={(subject, body) => onSendDepartment(deptId, subject, body)}
            workOrder={workOrder}
            genBusy={genBusy}
            genError={genError}
            onPrepare={(adminNote) => onPrepareWorkOrder(deptId, adminNote)}
            onCancel={onCancelWorkOrder}
          />
        )}
      </div>
    </div>
  );
}

// The editable draft an EmailPreview shows. Both AI-written emails — the
// department work order and the citizen clarification — are reviewed through
// the same component, so they share this shape.
type EmailDraft = {
  subject: string;
  body: string;
  // Only the work order has a fallback path (the fixed template, shown when
  // generation failed). A clarification is never sent from a template, so
  // these stay unset there.
  fallback?: boolean;
  fallbackReason?: string | null;
};

type WorkOrderPreview = EmailDraft & {
  reportId: string;
  departmentId: string;
};

/**
 * The review step every AI-written email goes through before it is sent:
 * editable subject and body, then Send / Regenerate / Cancel. It holds the
 * clerk's edits and hands them back on send — it never sends anything itself.
 */
function EmailPreview({
  idPrefix,
  heading,
  draft,
  sendDisabled = false,
  sendBusy,
  regenBusy,
  onSend,
  onRegenerate,
  onCancel,
}: {
  // Keeps the field ids unique when two previews are open in the same panel.
  idPrefix: string;
  heading: string;
  draft: EmailDraft;
  sendDisabled?: boolean;
  sendBusy: boolean;
  regenBusy: boolean;
  onSend: (subject: string, body: string) => void;
  onRegenerate: () => void;
  onCancel: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);

  // Reseed from each freshly generated draft, so a Regenerate replaces what the
  // clerk is looking at rather than leaving stale edits over new text.
  useEffect(() => {
    setSubject(draft.subject);
    setBody(draft.body);
  }, [draft]);

  const canSend = !sendDisabled && subject.trim() !== "" && body.trim() !== "";

  return (
    <div className="wo-preview">
      <div className="wo-head">
        <span className="ai-tag">gjeneruar nga AI</span>
        <span>{heading}</span>
      </div>

      {draft.fallback && draft.fallbackReason && (
        <div className="wo-fallback">{draft.fallbackReason}</div>
      )}

      <label className="wo-sublabel" htmlFor={`${idPrefix}-subject`}>
        Subjekti
      </label>
      <input
        id={`${idPrefix}-subject`}
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />

      <label className="wo-sublabel" htmlFor={`${idPrefix}-body`}>
        Teksti
      </label>
      <textarea
        id={`${idPrefix}-body`}
        className="wo-body"
        rows={12}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="loc-row wo-actions">
        <button
          type="button"
          className="btn-geo btn-geo-full"
          disabled={sendBusy || regenBusy || !canSend}
          onClick={() => onSend(subject, body)}
        >
          {sendBusy ? "Duke dërguar…" : "Dërgo"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={sendBusy || regenBusy}
          onClick={onRegenerate}
        >
          {regenBusy ? "Duke rigjeneruar…" : "Rigjenero"}
        </button>
        <button type="button" className="btn-ghost" disabled={sendBusy} onClick={onCancel}>
          Anulo
        </button>
      </div>
    </div>
  );
}

/**
 * Asks the citizen behind a flagged report for the detail it is missing. Only
 * offered when they left a contact address — without one there is nowhere to
 * send it, so the panel says so instead of showing a button that cannot work.
 */
function ClarificationRequest({
  notifyEmail,
  sentAt,
  draft,
  busy,
  sendBusy,
  error,
  onPrepare,
  onSend,
  onCancel,
}: {
  notifyEmail: string | null;
  sentAt: string | null;
  draft: EmailDraft | null;
  busy: boolean;
  sendBusy: boolean;
  error: string | null;
  onPrepare: () => void;
  onSend: (subject: string, body: string) => void;
  onCancel: () => void;
}) {
  if (!notifyEmail) {
    return (
      <p className="clar-none">
        Qytetari nuk la adresë kontakti, prandaj sqarimi nuk mund të kërkohet.
      </p>
    );
  }

  return (
    <div className="clar-request">
      {/* Above the button, so a clerk sees a request already went out rather
          than sending a second one. */}
      {sentAt && <div className="geo-status">Sqarimi u kërkua më {formatDate(sentAt, true)}</div>}

      {!draft ? (
        <div className="loc-row">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onPrepare}>
            {busy ? "Duke përgatitur…" : "Kërko sqarim"}
          </button>
        </div>
      ) : (
        <EmailPreview
          idPrefix="clar"
          heading={`Shqyrto përpara dërgimit te ${notifyEmail}`}
          draft={draft}
          sendBusy={sendBusy}
          regenBusy={busy}
          onSend={onSend}
          onRegenerate={onPrepare}
          onCancel={onCancel}
        />
      )}

      {error && <div className="confirm-resolved-error detail-error">{error}</div>}
    </div>
  );
}

function SendToDepartment({
  departments,
  sends,
  deptId,
  onChangeDeptId,
  busy,
  error,
  onSend,
  workOrder,
  genBusy,
  genError,
  onPrepare,
  onCancel,
}: {
  departments: Department[];
  sends: DepartmentSend[];
  deptId: string;
  onChangeDeptId: (id: string) => void;
  busy: boolean;
  error: string | null;
  onSend: (subject: string, body: string) => void;
  workOrder: WorkOrderPreview | null;
  genBusy: boolean;
  genError: string | null;
  onPrepare: (adminNote: string) => void;
  onCancel: () => void;
}) {
  const selectedDept = departments.find((d) => d.id === deptId) ?? null;
  const lastSend = sends.find((s) => s.department_id === deptId) ?? null;

  const [adminNote, setAdminNote] = useState("");

  return (
    <div className="field detail-send-dept">
      <label>Dërgo te departamenti</label>
      <select
        className="admin-select"
        value={deptId}
        onChange={(e) => {
          // A preview names its department, so it cannot survive a change of one.
          onCancel();
          onChangeDeptId(e.target.value);
        }}
      >
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>

      {selectedDept && !selectedDept.contact_email && (
        <div className="auto-cat-note">
          <span>
            Ky departament nuk ka email kontakti. <Link href="/admin/departments">Shtoje këtu</Link>.
          </span>
        </div>
      )}

      {!workOrder ? (
        <>
          <label className="wo-sublabel" htmlFor="wo-note">
            Shënim për departamentin <span className="hint">opsional</span>
          </label>
          <textarea
            id="wo-note"
            rows={2}
            value={adminNote}
            placeholder="Udhëzim shtesë për ekipin…"
            onChange={(e) => setAdminNote(e.target.value)}
          />
          <div className="loc-row">
            <button
              type="button"
              className="btn-geo btn-geo-full"
              disabled={genBusy || !selectedDept?.contact_email}
              onClick={() => onPrepare(adminNote)}
            >
              {genBusy ? "Duke përgatitur…" : "Përgatit email-in"}
            </button>
          </div>
        </>
      ) : (
        <EmailPreview
          idPrefix="wo"
          heading={`Shqyrto përpara dërgimit te ${selectedDept?.name ?? ""}`}
          draft={workOrder}
          sendDisabled={!selectedDept?.contact_email}
          sendBusy={busy}
          regenBusy={genBusy}
          onSend={onSend}
          onRegenerate={() => onPrepare(adminNote)}
          onCancel={onCancel}
        />
      )}

      {lastSend && !workOrder && (
        <div className="geo-status">
          Dërguar te {selectedDept?.name} më {formatDate(lastSend.sent_at, true)}
        </div>
      )}

      {genError && <div className="confirm-resolved-error detail-error">{genError}</div>}
      {error && <div className="confirm-resolved-error detail-error">{error}</div>}
    </div>
  );
}
