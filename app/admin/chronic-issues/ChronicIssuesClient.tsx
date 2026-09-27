"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { computeChronicIssues, CHRONIC_MIN_REPORTS } from "@/lib/chronic-issues";
import type { ChronicReport } from "@/lib/chronic-issues";
import { categoryLabel } from "@/lib/types";
import { formatDate } from "@/lib/time";
import AdminNav from "../AdminNav";
import { InlineError, TableSkeleton } from "../AdminStates";

export default function ChronicIssuesClient() {
  const [reports, setReports] = useState<ChronicReport[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    // Quality-flagged and rejected reports never form or join a cluster —
    // a rejected report is not evidence of a recurring problem.
    const { data, error } = await supabase
      .from("reports")
      .select("id, ticket_code, area, category, latitude, longitude, created_at")
      .not("quality_flagged", "is", true)
      .neq("status", "rejected");
    if (error || !data) {
      setLoadError("Të dhënat nuk u ngarkuan.");
    } else {
      setReports(data as ChronicReport[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => (reports ? computeChronicIssues(reports) : null), [reports]);

  return (
    <section>
      <div className="wrap">
        <div className="section-head">
          <h2>Çështje kronike</h2>
          <p>
            Vendndodhje e kategori ku janë raportuar të paktën {CHRONIC_MIN_REPORTS} raste brenda ~100m nga
            njëra-tjetra — shenjë se problemi vazhdon të përsëritet dhe mund të kërkojë investim kapital, jo
            vetëm një riparim njëherësh.
          </p>
        </div>

        <AdminNav />

        <div className="admin-toolbar admin-toolbar-end">
          <button type="button" className="btn-geo admin-refresh" onClick={load} disabled={loading}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 11a8 8 0 10-2.3 5.7" />
              <path d="M20 4v7h-7" />
            </svg>
            {loading ? "Duke rifreskuar…" : "Rifresko"}
          </button>
        </div>

        {loadError && <InlineError message={loadError} onRetry={load} />}

        {loading && !groups ? (
          <TableSkeleton rows={4} cols={5} />
        ) : !groups ? null : groups.length === 0 ? (
          <div className="empty-state">
            <p>Ende nuk ka asnjë çështje kronike — asnjë vendndodhje/kategori nuk ka arritur {CHRONIC_MIN_REPORTS} raste brenda ~100m.</p>
          </div>
        ) : (
          <>
            <div className="admin-meta">{groups.length} çështje kronike të gjetura</div>
            <div className="admin-table-wrap">
              <table className="admin-table chronic-table">
                <thead>
                  <tr>
                    <th>Zona</th>
                    <th>Kategoria</th>
                    <th className="num">Raportime</th>
                    <th>Raportuar së pari</th>
                    <th>Raportimet</th>
                    <th>Vlerësimi</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.key} className="row-chronic">
                      <td className="admin-ticket">{g.area}</td>
                      <td data-label="Kategoria">{categoryLabel(g.category)}</td>
                      <td className="num" data-label="Raportime">
                        {g.reports.length}
                      </td>
                      <td className="admin-date" data-label="Raportuar së pari" title={formatDate(g.firstReportedAt, true)}>
                        {formatDate(g.firstReportedAt)}
                      </td>
                      <td data-label="Raportimet">
                        <div className="chronic-ticket-list">
                          {g.reports.map((r) => (
                            <Link key={r.id} href={`/admin?report=${r.id}`} className="chronic-ticket-link">
                              {r.ticket_code}
                            </Link>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className="chronic-badge">Çështje kronike — investim kapital</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
