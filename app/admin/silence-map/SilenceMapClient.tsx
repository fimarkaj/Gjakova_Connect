"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SILENT_RATIO, HIGH_VOLUME_RATIO, HIGH_VOLUME_MIN_REPORTS, computeSilenceMap } from "@/lib/silence-map";
import type { SilenceFlag } from "@/lib/silence-map";
import AdminNav from "../AdminNav";
import { InlineError, TableSkeleton } from "../AdminStates";

const FLAG_LABELS: Record<SilenceFlag, { label: string; cls: string }> = {
  silent: { label: "Possibly silent area", cls: "silence-badge silent" },
  normal: { label: "Within expected range", cls: "silence-badge normal" },
  high: { label: "High volume", cls: "silence-badge high" },
};

export default function SilenceMapClient() {
  const [areas, setAreas] = useState<(string | null)[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    // Quality-flagged and rejected reports are left out entirely — they must
    // not count toward an area, nor toward the total every area's expected
    // share is derived from. Otherwise a single troll filing repeatedly in one
    // area would inflate the denominator and drag every other area's ratio down.
    // `not is true` (rather than eq false) also covers rows predating the column.
    const { data, error } = await supabase
      .from("reports")
      .select("area")
      .not("quality_flagged", "is", true)
      .neq("status", "rejected");
    if (error || !data) {
      setLoadError("The data failed to load.");
    } else {
      setAreas(data.map((r) => r.area as string | null));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => (areas ? computeSilenceMap(areas) : null), [areas]);
  // Bars are scaled against the largest ratio so the table reads at a glance.
  const maxRatio = summary ? Math.max(1, ...summary.rows.map((r) => r.ratio)) : 1;

  return (
    <section>
      <div className="wrap">
        <div className="section-head">
          <h2>Silence map</h2>
          <p>
            Compares the number of reports in each area with the number that would be expected
            based on population size. Areas reporting far fewer than expected may have problems
            that aren&apos;t being heard.
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

        {loading && !summary ? (
          <TableSkeleton rows={8} cols={5} />
        ) : !summary ? null : summary.totalCounted === 0 ? (
          <div className="empty-state">
            <p>No reports with an area to compare yet.</p>
          </div>
        ) : (
          <>
            <div className="admin-meta">
              {summary.totalCounted} reports compared
              {summary.uncounted > 0 && ` · ${summary.uncounted} without a known area not counted`}
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table silence-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th className="num">Reports</th>
                    <th className="num">Expected</th>
                    <th>Ratio to expected</th>
                    <th>Assessment</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => {
                    const flag = FLAG_LABELS[row.flag];
                    return (
                      <tr key={row.area} className={row.flag === "silent" ? "row-silent" : undefined}>
                        <td className="admin-ticket">{row.area}</td>
                        <td className="num" data-label="Reports">
                          {row.actual}
                        </td>
                        <td className="num" data-label="Expected">
                          {row.expected.toFixed(1)}
                        </td>
                        <td>
                          <div className="ratio-cell">
                            <div className="ratio-track">
                              <div
                                className={`ratio-fill ${row.flag}`}
                                style={{ width: `${Math.min(100, (row.ratio / maxRatio) * 100)}%` }}
                              />
                              <div className="ratio-mark" style={{ left: `${(1 / maxRatio) * 100}%` }} />
                            </div>
                            <span className="ratio-value">{Math.round(row.ratio * 100)}%</span>
                          </div>
                        </td>
                        <td>
                          <span className={flag.cls}>{flag.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="form-note">
              &ldquo;Expected&rdquo; = total reports × the area&apos;s population weight. An area is marked as
              possibly silent when it has less than {Math.round(SILENT_RATIO * 100)}% of the expected
              amount, and high volume when it has over {Math.round(HIGH_VOLUME_RATIO * 100)}% and at
              least {HIGH_VOLUME_MIN_REPORTS} reports. The vertical line marks 100%.
              With few reports overall, small differences aren&apos;t meaningful.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
