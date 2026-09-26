"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SILENT_RATIO, HIGH_VOLUME_RATIO, HIGH_VOLUME_MIN_REPORTS, computeSilenceMap } from "@/lib/silence-map";
import type { SilenceFlag } from "@/lib/silence-map";
import AdminNav from "../AdminNav";
import { InlineError, TableSkeleton } from "../AdminStates";

const FLAG_LABELS: Record<SilenceFlag, { label: string; cls: string }> = {
  silent: { label: "Zonë e mundshme e heshtur", cls: "silence-badge silent" },
  normal: { label: "Brenda pritjes", cls: "silence-badge normal" },
  high: { label: "Vëllim i lartë", cls: "silence-badge high" },
};

export default function SilenceMapClient() {
  const [areas, setAreas] = useState<(string | null)[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.from("reports").select("area");
    if (error || !data) {
      setLoadError("Të dhënat nuk u ngarkuan.");
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
          <h2>Harta e heshtjes</h2>
          <p>
            Krahason numrin e raportimeve në çdo zonë me numrin që do të pritej sipas madhësisë së
            popullsisë. Zonat që raportojnë shumë më pak se sa pritet mund të kenë probleme që nuk po
            dëgjohen.
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

        {loading && !summary ? (
          <TableSkeleton rows={8} cols={5} />
        ) : !summary ? null : summary.totalCounted === 0 ? (
          <div className="empty-state">
            <p>Ende nuk ka raportime me zonë për t&apos;i krahasuar.</p>
          </div>
        ) : (
          <>
            <div className="admin-meta">
              {summary.totalCounted} raportime të krahasuara
              {summary.uncounted > 0 && ` · ${summary.uncounted} pa zonë të njohur nuk llogariten`}
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table silence-table">
                <thead>
                  <tr>
                    <th>Zona</th>
                    <th className="num">Raportime</th>
                    <th className="num">Pritet</th>
                    <th>Raporti ndaj pritjes</th>
                    <th>Vlerësimi</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => {
                    const flag = FLAG_LABELS[row.flag];
                    return (
                      <tr key={row.area} className={row.flag === "silent" ? "row-silent" : undefined}>
                        <td className="admin-ticket">{row.area}</td>
                        <td className="num" data-label="Raportime">
                          {row.actual}
                        </td>
                        <td className="num" data-label="Pritet">
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
              &ldquo;Pritet&rdquo; = raportimet gjithsej × pesha e popullsisë së zonës. Një zonë shënohet si e
              mundshme e heshtur kur ka më pak se {Math.round(SILENT_RATIO * 100)}% të pritjes, dhe me
              vëllim të lartë kur ka mbi {Math.round(HIGH_VOLUME_RATIO * 100)}% dhe të paktën{" "}
              {HIGH_VOLUME_MIN_REPORTS} raportime. Vija vertikale shënon 100%.
              Me pak raportime gjithsej, dallimet e vogla nuk janë domethënëse.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
