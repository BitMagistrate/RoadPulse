/**
 * 24h time-lapse simulator (N3).
 *
 * A scrubber that walks the hour-of-week dimension through 0–23 (single day)
 * and re-queries `/v1/site-selection` for the same bbox so the operator can
 * watch flow shift as commute / lunch / dinner peaks roll in. Auto-play steps
 * one hour every 700ms; clicking the scrubber pauses.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/lib/api";
import { useCity } from "@/lib/city";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function dayOfWeekToOffset(dayIdx: number): number {
  // gateway encodes hour_of_week as Monday=0..168; expose a friendly weekday
  return dayIdx * 24;
}

export function TimeLapsePage() {
  const { def, id: cityId, setCity } = useCity();
  const [dayIdx, setDayIdx] = useState(2); // Wed
  const [hour, setHour] = useState(8);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = window.setInterval(() => {
      setHour((h) => (h + 1) % 24);
    }, 700);
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playing]);

  const hourOfWeek = dayOfWeekToOffset(dayIdx) + hour;
  const live = useQuery({
    queryKey: ["time-lapse", cityId, hourOfWeek],
    queryFn: () => api.siteSelection(def.bbox, hourOfWeek),
    staleTime: 30_000,
  });

  // Pre-aggregate a thumbnail trace so the user sees the whole day at once.
  const dayTrace = useQuery({
    queryKey: ["time-lapse", "trace", cityId, dayIdx],
    queryFn: async () => {
      const results = await Promise.all(
        HOURS.map(async (h) => {
          const r = await api.siteSelection(def.bbox, dayOfWeekToOffset(dayIdx) + h);
          const total = r.ranked.reduce(
            (acc, c) => acc + c.origin_flows + c.destination_flows,
            0,
          );
          return { hour: h, total };
        }),
      );
      return results;
    },
  });

  const ranked = live.data?.ranked ?? [];
  const totalFlow = useMemo(
    () => ranked.reduce((acc, c) => acc + c.origin_flows + c.destination_flows, 0),
    [ranked],
  );

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>24h time-lapse simulator</h2>
          <div className="muted">
            Scrub through a single day of synthetic VETC flows · {def.label} ·{" "}
            hour-of-week {hourOfWeek}
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
          <select value={dayIdx} onChange={(e) => setDayIdx(Number(e.target.value))}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? "Pause" : "Play"}
          </button>
        </div>
      </header>

      <div className="kpi-grid">
        <Kpi label="Hour" value={`${hour.toString().padStart(2, "0")}:00`} />
        <Kpi label="Top hexes" value={ranked.length.toString()} />
        <Kpi label="Total flow" value={totalFlow.toLocaleString("vi-VN")} />
        <Kpi
          label="Status"
          value={playing ? "▶︎ playing" : live.isFetching ? "loading…" : "paused"}
        />
      </div>

      <div className="toolbar">
        <span className="muted">Hour scrubber</span>
        <input
          type="range"
          min={0}
          max={23}
          value={hour}
          onChange={(e) => {
            setPlaying(false);
            setHour(Number(e.target.value));
          }}
          style={{ flex: 1 }}
        />
        <span style={{ width: 64, textAlign: "right" }}>
          {hour.toString().padStart(2, "0")}:00
        </span>
      </div>

      <div className="card section">
        <h3 style={{ marginTop: 0 }}>Day trace · sum of flows</h3>
        {dayTrace.isPending && <p>Pre-aggregating 24 hours…</p>}
        {dayTrace.data && (
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={dayTrace.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" stroke="#475569" />
                <YAxis stroke="#475569" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card section">
        <h3 style={{ marginTop: 0 }}>Top hexes for {hour.toString().padStart(2, "0")}:00</h3>
        {live.isPending && <p>Loading…</p>}
        {live.data && ranked.length === 0 && <p className="muted">No flow recorded.</p>}
        {live.data && ranked.length > 0 && (
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
              {ranked.slice(0, 8).map((c) => (
                <tr key={c.hex_id}>
                  <td>#{c.rank}</td>
                  <td>{c.hex_id}</td>
                  <td>{c.origin_flows.toLocaleString("vi-VN")}</td>
                  <td>{c.destination_flows.toLocaleString("vi-VN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}
