"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { AREA_WEIGHTS } from "@/lib/silence-map";
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
  const [sort, setSort] = useState<SortKey>("newest");
  const [view, setView] = useState<View>("table");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // notify_email is PII, excluded from the anon-key list fetch above — loaded
  // separately per report (via the admin-gated API route) only when its
  // detail panel is open.
  const [detailEmail, setDetailEmail] = useState<{ reportId: string; notifyEmail: string | null } | null>(
    null
  );
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [notifySent, setNotifySent] = useState<string | null>(null);

  // Departments for the "Send to Department" control — loaded once, reused
  // across every report detail panel.
  const [departments, setDepartments] = useState<Department[]>([]);
  const [detailSends, setDetailSends] = useState<{ reportId: string; sends: DepartmentSend[] } | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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
    const names = new Set(Object.keys(AREA_WEIGHTS));
    for (const r of reports) if (r.area) names.add(r.area);
    return Array.from(names).sort((a, b) => a.localeCompare(b, "sq"));
  }, [reports]);

  const filtered = useMemo(() => {
    const rows = reports.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (areaFilter === NO_AREA && r.area) return false;
      if (areaFilter && areaFilter !== NO_AREA && r.area !== areaFilter) return false;
      return true;
    });
    // `reports` is already newest-first from the query; urgency sort keeps that as the tiebreak.
    if (sort === "urgency") {
      rows.sort((a, b) => urgencyRank(b.urgency) - urgencyRank(a.urgency));
    }
    return rows;
  }, [reports, statusFilter, categoryFilter, areaFilter, sort]);

  const hasFilters = Boolean(statusFilter || categoryFilter || areaFilter);

  function clearFilters() {
    setStatusFilter("");
    setCategoryFilter("");
    setAreaFilter("");
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
    setDetailEmail(null);
    setSendError(null);
    setDetailSends(null);
    fetch(`/api/admin/reports/${id}`)
      .then((res) => res.json())
      .then((body) => {
        if (body?.report) {
          setDetailEmail({ reportId: id, notifyEmail: body.report.notify_email ?? null });
        }
        setDetailSends({ reportId: id, sends: (body?.sends ?? []) as DepartmentSend[] });
      })
      .catch(() => {
        // Detail panel still works without it — the notify button just stays hidden.
      });
  }

  async function sendToDepartment(report: Report, departmentId: string) {
    setSendBusy(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}/send-department`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId }),
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
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={`admin-row${selectedId === r.id ? " selected" : ""}`}
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
                      {r.ticket_code}
                      {r.duplicate_of && <span className="dup-tag">dublikatë</span>}
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
                ))}
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
          notifyEmail={detailEmail?.reportId === selected.id ? detailEmail.notifyEmail : null}
          notifyBusy={notifyBusy}
          notifyError={notifyError}
          notifySent={notifySent}
          onSendNotify={(message) => sendManualNotify(selected, message)}
          departments={departments}
          sends={detailSends?.reportId === selected.id ? detailSends.sends : []}
          sendBusy={sendBusy}
          sendError={sendError}
          onSendDepartment={(departmentId) => sendToDepartment(selected, departmentId)}
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
}: {
  report: Report;
  duplicateOf: Report | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onOpen: (id: string) => void;
  onChangeStatus: (status: ReportStatus) => void;
  notifyEmail: string | null;
  notifyBusy: boolean;
  notifyError: string | null;
  notifySent: string | null;
  onSendNotify: (message?: string) => void;
  departments: Department[];
  sends: DepartmentSend[];
  sendBusy: boolean;
  sendError: string | null;
  onSendDepartment: (departmentId: string) => void;
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

        <p className="detail-desc">{report.description}</p>

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
            onSend={() => onSendDepartment(deptId)}
          />
        )}
      </div>
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
}: {
  departments: Department[];
  sends: DepartmentSend[];
  deptId: string;
  onChangeDeptId: (id: string) => void;
  busy: boolean;
  error: string | null;
  onSend: () => void;
}) {
  const selectedDept = departments.find((d) => d.id === deptId) ?? null;
  const lastSend = sends.find((s) => s.department_id === deptId) ?? null;

  return (
    <div className="field detail-send-dept">
      <label>Dërgo te departamenti</label>
      <select className="admin-select" value={deptId} onChange={(e) => onChangeDeptId(e.target.value)}>
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

      <div className="loc-row">
        <button
          type="button"
          className="btn-geo btn-geo-full"
          disabled={busy || !selectedDept?.contact_email}
          onClick={onSend}
        >
          {busy ? "Duke dërguar…" : "Dërgo email"}
        </button>
      </div>

      {lastSend && (
        <div className="geo-status">
          Dërguar te {selectedDept?.name} më {formatDate(lastSend.sent_at, true)} ·{" "}
          <button type="button" className="link-button" onClick={onSend}>
            dërgo përsëri
          </button>
        </div>
      )}

      {error && <div className="confirm-resolved-error detail-error">{error}</div>}
    </div>
  );
}
