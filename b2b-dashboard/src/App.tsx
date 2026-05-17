import { NavLink, Route, Routes } from "react-router-dom";

import { useCity } from "@/lib/city";
import { DispatchPage } from "@/pages/dispatch";
import { FloodWatchPage } from "@/pages/flood-watch";
import { TollYieldPage } from "@/pages/toll-yield";
import { SiteSelectionPage } from "@/pages/site-selection";
import { FleetMatchPage } from "@/pages/fleet-match";
import { InsurerPage } from "@/pages/insurer";
import { IsochronePage } from "@/pages/isochrone";
import { TimeLapsePage } from "@/pages/time-lapse";
import { KAnonAdminPage } from "@/pages/admin/kanon";

const LINK = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");

export function App() {
  const { id, setCity } = useCity();
  return (
    <div className="app">
      <aside className="sidebar">
        <h1>
          Road<span>Pulse</span>
        </h1>
        <div className="data-banner" role="status">
          synthetic-fixtures · no real VETC feed yet
        </div>
        <label
          htmlFor="sidebar-city"
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#94a3b8",
          }}
        >
          City
        </label>
        <select
          id="sidebar-city"
          value={id}
          onChange={(e) => setCity(e.target.value as "hcmc" | "hanoi")}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
          }}
        >
          <option value="hcmc">Hồ Chí Minh</option>
          <option value="hanoi">Hà Nội</option>
        </select>
        <nav>
          <NavLink to="/" end className={LINK}>Dispatch</NavLink>
          <NavLink to="/flood-watch" className={LINK}>Flood watch</NavLink>
          <NavLink to="/toll-yield" className={LINK}>Toll yield</NavLink>
          <NavLink to="/site-selection" className={LINK}>Site selection</NavLink>
          <NavLink to="/fleet-match" className={LINK}>Fleet match</NavLink>
          <NavLink to="/isochrone" className={LINK}>Isochrones</NavLink>
          <NavLink to="/time-lapse" className={LINK}>24h time-lapse</NavLink>
          <NavLink to="/insurer" className={LINK}>Insurer feed</NavLink>
          <NavLink to="/admin/kanon" className={LINK}>Admin · k-anon</NavLink>
        </nav>
        <div className="footer">
          v0.1.0 · {id === "hcmc" ? "HCMC" : "Hà Nội"} · k-anon ≥ 50
          <br />© RoadPulse JSC · Vietnam
        </div>
      </aside>
      <main>
        <Routes>
          <Route index element={<DispatchPage />} />
          <Route path="flood-watch" element={<FloodWatchPage />} />
          <Route path="toll-yield" element={<TollYieldPage />} />
          <Route path="site-selection" element={<SiteSelectionPage />} />
          <Route path="fleet-match" element={<FleetMatchPage />} />
          <Route path="isochrone" element={<IsochronePage />} />
          <Route path="time-lapse" element={<TimeLapsePage />} />
          <Route path="insurer" element={<InsurerPage />} />
          <Route path="admin/kanon" element={<KAnonAdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
