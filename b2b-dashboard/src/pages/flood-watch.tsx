/**
 * Flood watch — live H3-hex flood-risk overlay aggregated from the SAR + SDK
 * fusion. Mirrors the B2C `/floods` screen so the operator and the driver see
 * the same numbers. Synthetic-fixtures today; `data_origin` exposed in-header.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, type FloodHex } from "@/lib/api";

const HORIZONS = ["now", "1h", "3h", "6h"] as const;
type Horizon = (typeof HORIZONS)[number];

const BUCKETS: { label: string; min: number; max: number; fill: string }[] = [
  { label: "calm (< 20%)", min: 0,    max: 0.2, fill: "#16A34A" },
  { label: "watch 20–40%", min: 0.2,  max: 0.4, fill: "#65A30D" },
  { label: "warn 40–70%", min: 0.4,   max: 0.7, fill: "#F59E0B" },
  { label: "alert ≥ 70%", min: 0.7,   max: 1.01, fill: "#DC2626" },
];

function bucketise(hexes: FloodHex[]) {
  return BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: hexes.filter((h) => h.score >= bucket.min && h.score < bucket.max).length,
    fill: bucket.fill,
  }));
}

function fakeTrend(seedHexCount: number) {
  // Deterministic mock trend — replace with /v1/flood-risk?horizon=… stream once available.
  return [-15, -10, -5, 0, 5, 10, 15].map((offset_min) => ({
    offset_min,
    expected_alerts: Math.max(
      0,
      Math.round(seedHexCount * (0.22 + Math.sin(offset_min / 6) * 0.05)),
    ),
  }));
}

export function FloodWatchPage() {
  const [horizon, setHorizon] = useState<Horizon>("now");
  const flood = useQuery({
    queryKey: ["flood-risk", horizon],
    queryFn: () => api.floodRisk(horizon),
  });
  const health = useQuery({ queryKey: ["healthz"], queryFn: () => api.health() });

  const hexes = useMemo(() => flood.data?.hexes ?? [], [flood.data]);
  const buckets = useMemo(() => bucketise(hexes), [hexes]);
  const trend = useMemo(() => fakeTrend(hexes.length || 64), [hexes.length]);
  const top = useMemo(
    () =>
      [...hexes]
        .sort((a, b) => b.score - a.score)
        .slice(0, 8),
    [hexes],
  );

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Flood watch</h2>
          <div className="muted">
            SAR + SDK + weather fusion ·{" "}
            {health.data ? `data_origin: ${health.data.data_origin}` : "loading…"}
          </div>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              className={`button ${horizon === h ? "" : "secondary"}`}
              onClick={() => setHorizon(h)}
            >
              {h}
            </button>
          ))}
        </div>
      </header>

      <div className="kpi-grid">
        <Kpi label="Hexes monitored" value={hexes.length.toString()} />
        <Kpi label="Alert (≥ 70%)" value={buckets[3]?.count.toString() ?? "0"} tone="hazard" />
        <Kpi
          label="Mean score"
          value={
            hexes.length
              ? `${((hexes.reduce((acc, h) => acc + h.score, 0) / hexes.length) * 100).toFixed(0)}%`
              : "—"
          }
        />
        <Kpi label="Horizon" value={horizon} />
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>Hex score distribution</h3>
          <div className="muted">Buckets across the active horizon</div>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#475569" interval={0} fontSize={11} />
                <YAxis stroke="#475569" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count">
                  {buckets.map((b) => (
                    <Cell key={b.label} fill={b.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="chart-card">
          <h3>Alert pipeline · next ±15 min</h3>
          <div className="muted">Forecasted alert count rolling forward in 5-min steps</div>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="offset_min" stroke="#475569" />
                <YAxis stroke="#475569" allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="expected_alerts"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <AlertsPanel />

      <div className="card section">
        <h3 style={{ marginTop: 0 }}>Top hexes by score</h3>
        <table>
          <thead>
            <tr>
              <th>Hex</th>
              <th>Lat / Lng</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {top.map((h) => (
              <tr key={h.hex_id}>
                <td>{h.hex_id}</td>
                <td>
                  {h.lat.toFixed(4)}, {h.lng.toFixed(4)}
                </td>
                <td>
                  <span
                    className={`pill ${
                      h.score >= 0.7 ? "bad" : h.score >= 0.4 ? "hazard" : "good"
                    }`}
                  >
                    {(h.score * 100).toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type StreamTick = {
  ts: string;
  top: { hex_id: string; score: number; lat: number; lng: number }[];
};

function AlertsPanel() {
  const [ticks, setTicks] = useState<StreamTick[]>([]);
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">(
    "connecting",
  );
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = api.floodStreamUrl();
    const source = new EventSource(url);
    sourceRef.current = source;
    source.onopen = () => setStatus("open");
    source.onerror = () => setStatus("error");
    source.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as StreamTick;
        setTicks((prev) => [parsed, ...prev].slice(0, 10));
      } catch {
        // ignore malformed ticks
      }
    };
    return () => {
      source.close();
      setStatus("closed");
    };
  }, []);

  const statusTone: Record<typeof status, "good" | "hazard" | "bad"> = {
    connecting: "hazard",
    open: "good",
    closed: "hazard",
    error: "bad",
  };

  return (
    <div className="card section">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ marginTop: 0 }}>Live alerts · /v1/flood-stream</h3>
        <span className={`pill ${statusTone[status]}`}>{status.toUpperCase()}</span>
      </header>
      <div className="muted" style={{ marginBottom: 10 }}>
        Server-Sent Events stream · pushes the top-3 flood hexes every 5s · last 10 ticks shown.
      </div>
      {ticks.length === 0 ? (
        <p className="muted">Waiting for the first tick…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Hex</th>
              <th>Score</th>
              <th>Lat / Lng</th>
            </tr>
          </thead>
          <tbody>
            {ticks.flatMap((tick) =>
              tick.top.map((entry, idx) => (
                <tr key={`${tick.ts}-${entry.hex_id}-${idx}`}>
                  <td>{new Date(tick.ts).toLocaleTimeString("vi-VN")}</td>
                  <td>
                    <code>{entry.hex_id}</code>
                  </td>
                  <td>
                    <span
                      className={`pill ${
                        entry.score >= 0.7 ? "bad" : entry.score >= 0.4 ? "hazard" : "good"
                      }`}
                    >
                      {(entry.score * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td>
                    {entry.lat.toFixed(4)}, {entry.lng.toFixed(4)}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "hazard" }) {
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
