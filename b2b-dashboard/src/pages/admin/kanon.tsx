/**
 * K-anonymity admin — observability surface for the on-server privacy guard.
 *
 * Internal-tier operators see (a) the current threshold (`min_k`) and the
 * rolling window the guard is enforcing, and (b) the most recent violations
 * the guard had to drop — each entry tells which source / bucket triggered the
 * cull and at what size. The list is naturally short because the guard kicks
 * before any data is returned to a caller.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

const SOURCE_FILTERS = ["all", "site-selection", "fleet-match", "eta-batch"] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number];

export function KAnonAdminPage() {
  const [source, setSource] = useState<SourceFilter>("all");
  const violations = useQuery({
    queryKey: ["admin", "kanon-violations"],
    queryFn: () => api.kanonViolations(),
    refetchInterval: 15_000,
  });

  const rows = useMemo(() => {
    const items = violations.data?.violations ?? [];
    const filtered = source === "all" ? items : items.filter((v) => v.source === source);
    return filtered.slice(-50).reverse();
  }, [violations.data, source]);

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>K-anonymity admin</h2>
          <div className="muted">
            Internal-tier · the guard suppresses any aggregation bucket below{" "}
            <code>min_k</code> across the rolling window.
          </div>
        </div>
      </header>

      <div className="kpi-grid">
        <Kpi label="Current min_k" value={violations.data?.min_k?.toString() ?? "—"} />
        <Kpi
          label="Window"
          value={violations.data ? `${violations.data.window_s}s` : "—"}
        />
        <Kpi
          label="Violations recorded"
          value={(violations.data?.violations.length ?? 0).toString()}
          tone={
            violations.data && violations.data.violations.length > 0 ? "hazard" : undefined
          }
        />
        <Kpi
          label="Last refresh"
          value={
            violations.data
              ? new Date(violations.data.generated_at).toLocaleTimeString("vi-VN")
              : "—"
          }
        />
      </div>

      <div className="toolbar">
        <span className="muted">Filter by source:</span>
        {SOURCE_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            className={`button ${source === s ? "" : "secondary"}`}
            onClick={() => setSource(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="card section">
        {violations.isPending && <p>Loading guard log…</p>}
        {violations.isError && (
          <p style={{ color: "var(--rp-bad)" }}>{(violations.error as Error).message}</p>
        )}
        {violations.data && rows.length === 0 && (
          <p className="muted">
            No violations in this window — every aggregation has been served with at least{" "}
            <code>k = {violations.data.min_k}</code> contributors.
          </p>
        )}
        {violations.data && rows.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Dropped at</th>
                <th>Source</th>
                <th>Bucket</th>
                <th>Attempted k</th>
                <th>Min k</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v, idx) => (
                <tr key={`${v.dropped_at}-${idx}`}>
                  <td>{new Date(v.dropped_at).toLocaleTimeString("vi-VN")}</td>
                  <td>
                    <code>{v.source}</code>
                  </td>
                  <td>{v.bucket}</td>
                  <td>
                    <span
                      className={`pill ${v.attempted_k < v.min_k / 2 ? "bad" : "hazard"}`}
                    >
                      {v.attempted_k}
                    </span>
                  </td>
                  <td>{v.min_k}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "hazard";
}) {
  return (
    <div
      className="kpi-card"
      style={tone === "hazard" ? { borderColor: "var(--rp-hazard)" } : undefined}
    >
      <div className="kpi-label">{label}</div>
      <div
        className="kpi-value"
        style={tone === "hazard" ? { color: "var(--rp-hazard)" } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
