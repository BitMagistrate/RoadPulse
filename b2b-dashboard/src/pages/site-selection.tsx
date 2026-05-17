/**
 * Site selection — ranks hex cells by hourly O-D flow for retail / dark-store
 * planners. The bounding box defaults to inner HCMC.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/lib/api";
import { useCity } from "@/lib/city";

export function SiteSelectionPage() {
  const { def, id: cityId, setCity } = useCity();
  const [hour, setHour] = useState(96);
  const sites = useQuery({
    queryKey: ["site-selection", cityId, hour],
    queryFn: () => api.siteSelection(def.bbox, hour),
  });

  const chartData = useMemo(
    () =>
      (sites.data?.ranked ?? []).slice(0, 8).map((c) => ({
        hex: c.hex_id.slice(-6),
        origin: c.origin_flows,
        destination: c.destination_flows,
      })),
    [sites.data],
  );

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Site selection</h2>
          <div className="muted">
            Hex-level O-D flow ranking for retail / dark-store rollouts · {def.label}
          </div>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <select
            value={cityId}
            onChange={(e) => setCity(e.target.value as "hcmc" | "hanoi")}
          >
            <option value="hcmc">HCMC</option>
            <option value="hanoi">Hà Nội</option>
          </select>
        </div>
      </header>

      <div className="toolbar">
        <label htmlFor="hour-input">Hour of week</label>
        <input
          id="hour-input"
          type="number"
          min={0}
          max={167}
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
        />
        <span className="muted">0 = Monday 00:00 · 96 = Friday 00:00</span>
      </div>

      {sites.data && chartData.length > 0 && (
        <div className="chart-grid">
          <div className="chart-card">
            <h3>Top-8 hex flows</h3>
            <div className="muted">Origin vs destination flows, aggregated for hour {hour}</div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hex" stroke="#475569" />
                  <YAxis stroke="#475569" />
                  <Tooltip />
                  <Bar dataKey="origin" fill="#2563EB" />
                  <Bar dataKey="destination" fill="#16A34A" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="card section">
        {sites.isPending && <p>Crunching aggregated VETC flows…</p>}
        {sites.isError && <p style={{ color: "var(--rp-bad)" }}>{(sites.error as Error).message}</p>}
        {sites.data && (
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Hex</th>
                <th>Origin flows</th>
                <th>Destination flows</th>
              </tr>
            </thead>
            <tbody>
              {sites.data.ranked.map((cell) => (
                <tr key={cell.hex_id}>
                  <td>#{cell.rank}</td>
                  <td>{cell.hex_id}</td>
                  <td>{cell.origin_flows.toLocaleString("vi-VN")}</td>
                  <td>{cell.destination_flows.toLocaleString("vi-VN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
