/**
 * Dispatch — operator console for last-mile fleets. Renders a live batch ETA
 * table plus a flood-aware re-route suggestion column. Inspired by the
 * COO-level "tower" view in the pitch (section 4.2.A).
 */
import { useMutation } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, type EtaBatchItem } from "@/lib/api";
import { useCity } from "@/lib/city";

const OFFSETS: { dlat: number; dlng: number }[] = [
  { dlat:  0.000, dlng:  0.000 },
  { dlat: -0.014, dlng: -0.040 },
  { dlat: -0.025, dlng:  0.018 },
  { dlat: -0.006, dlng: -0.022 },
  { dlat: -0.031, dlng: -0.019 },
  { dlat: -0.004, dlng:  0.020 },
];

function makeBatch(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): EtaBatchItem[] {
  return OFFSETS.map((o, idx) => ({
    order_id: `ORD-${(22001 + idx).toString()}`,
    origin: { lat: origin.lat + o.dlat, lng: origin.lng + o.dlng },
    destination: { lat: destination.lat - o.dlat / 2, lng: destination.lng - o.dlng / 2 },
  }));
}

export function DispatchPage() {
  const { def } = useCity();
  const batch = useMemo(() => makeBatch(def.origin, def.destination), [def]);
  const eta = useMutation({ mutationFn: () => api.etaBatch(batch) });
  const summary = useMemo(() => {
    if (!eta.data) return null;
    const preds = eta.data.predictions;
    const onTime = preds.filter((p) => p.flood_score < 0.4).length;
    const flooded = preds.filter((p) => p.flood_score >= 0.4).length;
    const avgEta = preds.reduce((acc, p) => acc + p.eta_s, 0) / Math.max(preds.length, 1);
    return { onTime, flooded, avgEta };
  }, [eta.data]);

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Dispatch tower</h2>
          <div className="muted">Last-mile fleets · batch ETA · flood-aware re-route</div>
        </div>
        <button
          type="button"
          className="button"
          disabled={eta.isPending}
          onClick={() => eta.mutate()}
        >
          {eta.isPending ? "Predicting…" : "Run batch ETA"}
        </button>
      </header>

      {summary && (
        <div className="kpi-grid">
          <Kpi label="Orders in batch" value={batch.length.toString()} />
          <Kpi label="On-time forecast" value={summary.onTime.toString()} />
          <Kpi label="Flood-risk orders" value={summary.flooded.toString()} tone="hazard" />
          <Kpi label="Avg ETA" value={`${Math.round(summary.avgEta / 60)} min`} />
        </div>
      )}

      {eta.isError && <p style={{ color: "var(--rp-bad)" }}>{(eta.error as Error).message}</p>}

      {eta.data && (
        <div className="chart-grid">
          <div className="chart-card">
            <h3>ETA per order (min)</h3>
            <div className="muted">Bars coloured by flood-risk band</div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart
                  data={eta.data.predictions.map((p) => ({
                    order_id: p.order_id.replace("ORD-", ""),
                    eta_min: Math.round(p.eta_s / 60),
                    fill:
                      p.flood_score >= 0.7
                        ? "#DC2626"
                        : p.flood_score >= 0.4
                        ? "#F59E0B"
                        : "#16A34A",
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="order_id" stroke="#475569" />
                  <YAxis stroke="#475569" allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="eta_min">
                    {eta.data.predictions.map((p) => (
                      <Cell
                        key={p.order_id}
                        fill={
                          p.flood_score >= 0.7
                            ? "#DC2626"
                            : p.flood_score >= 0.4
                            ? "#F59E0B"
                            : "#16A34A"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {eta.data && (
        <div className="card section">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Distance</th>
                <th>ETA</th>
                <th>P10–P90</th>
                <th>Flood</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {eta.data.predictions.map((p) => (
                <tr key={p.order_id}>
                  <td>{p.order_id}</td>
                  <td>{(p.distance_m / 1000).toFixed(2)} km</td>
                  <td>{Math.round(p.eta_s / 60)} min</td>
                  <td>
                    {Math.round(p.eta_p10_s / 60)} – {Math.round(p.eta_p90_s / 60)} min
                  </td>
                  <td>
                    <span className={`pill ${p.flood_score >= 0.7 ? "bad" : p.flood_score >= 0.4 ? "hazard" : "good"}`}>
                      {(p.flood_score * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td>{p.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "hazard" }) {
  return (
    <div className="kpi-card" style={tone === "hazard" ? { borderColor: "var(--rp-hazard)" } : undefined}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={tone === "hazard" ? { color: "var(--rp-hazard)" } : undefined}>
        {value}
      </div>
    </div>
  );
}
