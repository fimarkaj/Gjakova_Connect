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
      setLoadError("The data failed to load.");
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
          <h2>Chronic issues</h2>
          <p>
            Locations and categories with at least {CHRONIC_MIN_REPORTS} reports within ~100m of each
            other — a sign the problem keeps recurring and may need capital investment, not just a
            one-off repair.
          </p>
        </div>

        <AdminNav />

        <div className="admin-toolbar admin-toolbar-end">
          <button type="button" className="btn-geo admin-refresh" onClick={load} disabled={loading}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 11a8 8 0 10-2.3 5.7" />
              <path d="M20 4v7h-7" />
            </svg>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {loadError && <InlineError message={loadError} onRetry={load} />}

        {loading && !groups ? (
          <TableSkeleton rows={4} cols={5} />
        ) : !groups ? null : groups.length === 0 ? (
          <div className="empty-state">
            <p>No chronic issues yet — no location/category has reached {CHRONIC_MIN_REPORTS} reports within ~100m.</p>
          </div>
        ) : (
          <>
            <div className="admin-meta">{groups.length} chronic issues found</div>
            <div className="admin-table-wrap">
              <table className="admin-table chronic-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Category</th>
                    <th className="num">Reports</th>
                    <th>First reported</th>
                    <th>Reports</th>
                    <th>Assessment</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.key} className="row-chronic">
                      <td className="admin-ticket">{g.area}</td>
                      <td data-label="Category">{categoryLabel(g.category)}</td>
                      <td className="num" data-label="Reports">
                        {g.reports.length}
                      </td>
                      <td className="admin-date" data-label="First reported" title={formatDate(g.firstReportedAt, true)}>
                        {formatDate(g.firstReportedAt)}
                      </td>
                      <td data-label="Reports">
                        <div className="chronic-ticket-list">
                          {g.reports.map((r) => (
                            <Link key={r.id} href={`/admin?report=${r.id}`} className="chronic-ticket-link">
                              {r.ticket_code}
                            </Link>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className="chronic-badge">Chronic issue — capital investment</span>
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
