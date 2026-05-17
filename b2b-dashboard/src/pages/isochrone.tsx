/**
 * Isochrone — reachability rings drawn as a 2D scatter polygon.
 *
 * The page calls `/v1/isochrone` for three minute thresholds and renders the
 * convex hulls returned by the gateway. We avoid the heavyweight MapLibre
 * dependency by projecting lat/lng to pixels inside an inline SVG — good
 * enough for a planning surface and dependency-free.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { api, type IsochroneRing, type LatLon } from "@/lib/api";
import { useCity } from "@/lib/city";

const RING_COLORS = ["#2563EB", "#16A34A", "#F59E0B"];
const DEFAULT_MINUTES = [5, 10, 15];

export function IsochronePage() {
  const { def, id: cityId, setCity } = useCity();
  const [minutes, setMinutes] = useState<number[]>(DEFAULT_MINUTES);
  const [mode, setMode] = useState<"motorbike" | "car">("motorbike");

  const job = useMutation({
    mutationFn: () => api.isochrone(def.origin, minutes, mode),
  });

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Isochrones</h2>
          <div className="muted">
            Reachability rings · convex hull of nodes reachable within N minutes from a
            seed.
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
          <select value={mode} onChange={(e) => setMode(e.target.value as "motorbike" | "car")}>
            <option value="motorbike">motorbike</option>
            <option value="car">car</option>
          </select>
          <button
            type="button"
            className="button"
            disabled={job.isPending}
            onClick={() => job.mutate()}
          >
            {job.isPending ? "Computing…" : "Compute"}
          </button>
        </div>
      </header>

      <div className="toolbar">
        <span className="muted">Minutes:</span>
        {[3, 5, 10, 15, 20, 30].map((m) => {
          const active = minutes.includes(m);
          return (
            <button
              key={m}
              type="button"
              className={`button ${active ? "" : "secondary"}`}
              onClick={() => {
                setMinutes((prev) =>
                  prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b),
                );
              }}
            >
              {m} min
            </button>
          );
        })}
      </div>

      {job.isError && (
        <div className="card section" style={{ color: "var(--rp-bad)" }}>
          {(job.error as Error).message}
        </div>
      )}

      {job.data && <RingTable rings={job.data.rings} />}
      {job.data && <RingMap rings={job.data.rings} origin={job.data.origin} />}
    </section>
  );
}

function RingTable({ rings }: { rings: IsochroneRing[] }) {
  return (
    <div className="kpi-grid" style={{ marginBottom: 18 }}>
      {rings.map((r, idx) => (
        <div
          key={r.minutes}
          className="kpi-card"
          style={{ borderColor: RING_COLORS[idx % RING_COLORS.length] }}
        >
          <div className="kpi-label">≤ {r.minutes} min</div>
          <div className="kpi-value">{r.area_km2.toFixed(2)} km²</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {r.population_reached.toLocaleString("vi-VN")} people reachable
          </div>
        </div>
      ))}
    </div>
  );
}

function RingMap({ rings, origin }: { rings: IsochroneRing[]; origin: LatLon }) {
  const padding = 30;
  const width = 720;
  const height = 360;

  const projection = useMemo(() => {
    const all: LatLon[] = [origin, ...rings.flatMap((r) => r.polygon)];
    if (all.length === 0) {
      return null;
    }
    const minLat = Math.min(...all.map((p) => p.lat));
    const maxLat = Math.max(...all.map((p) => p.lat));
    const minLng = Math.min(...all.map((p) => p.lng));
    const maxLng = Math.max(...all.map((p) => p.lng));
    const dLat = Math.max(maxLat - minLat, 0.0001);
    const dLng = Math.max(maxLng - minLng, 0.0001);
    const scale = Math.min((width - 2 * padding) / dLng, (height - 2 * padding) / dLat);
    return {
      project: (p: LatLon) => ({
        x: padding + (p.lng - minLng) * scale,
        y: height - padding - (p.lat - minLat) * scale,
      }),
    };
  }, [rings, origin]);

  if (!projection || rings.length === 0) {
    return null;
  }

  return (
    <div className="card section">
      <h3 style={{ marginTop: 0 }}>Reachability hulls</h3>
      <div className="muted" style={{ marginBottom: 12 }}>
        Bounding box auto-fitted to the largest ring · graph-distance based, not haversine.
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", background: "var(--rp-surface-muted)" }}
      >
        {rings
          .slice()
          .reverse()
          .map((ring, idx) => {
            const points = ring.polygon
              .map((p) => {
                const xy = projection.project(p);
                return `${xy.x.toFixed(1)},${xy.y.toFixed(1)}`;
              })
              .join(" ");
            return (
              <polygon
                key={ring.minutes}
                points={points}
                fill={RING_COLORS[(rings.length - 1 - idx) % RING_COLORS.length]}
                fillOpacity={0.18}
                stroke={RING_COLORS[(rings.length - 1 - idx) % RING_COLORS.length]}
                strokeWidth={1.5}
              />
            );
          })}
        {(() => {
          const o = projection.project(origin);
          return <circle cx={o.x} cy={o.y} r={5} fill="#0b1426" />;
        })()}
      </svg>
    </div>
  );
}
