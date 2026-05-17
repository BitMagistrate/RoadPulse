/**
 * Trip state — last queried OD pair, selected variant, in-trip telemetry, and
 * a lightweight history list. Persisted to AsyncStorage so the app re-opens
 * to the user's last route and can replay recent trips.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import type { LatLon, RouteResponse, RouteVariantName } from "@/lib/api";

type Telemetry = {
  startedAtMs: number | null;
  bumpsDetected: number;
  helmetOk: boolean;
};

export type TripHistoryEntry = {
  id: string;
  origin: LatLon;
  destination: LatLon;
  selected: RouteVariantName;
  distance_m: number;
  duration_s: number;
  flood_score: number;
  saved_at_ms: number;
};

type TripState = {
  origin: LatLon | null;
  destination: LatLon | null;
  routes: RouteResponse | null;
  selected: RouteVariantName;
  telemetry: Telemetry;
  history: TripHistoryEntry[];
  setOd(origin: LatLon, destination: LatLon): void;
  setRoutes(routes: RouteResponse): void;
  select(variant: RouteVariantName): void;
  startTrip(): void;
  endTrip(): void;
  recordTrip(): void;
  clearHistory(): void;
};

const TELEMETRY_EMPTY: Telemetry = { startedAtMs: null, bumpsDetected: 0, helmetOk: true };
const HISTORY_KEY = "roadpulse:history";
const OD_KEY = "roadpulse:od";
const MAX_HISTORY = 20;

async function persistHistory(history: TripHistoryEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* ignore */
  }
}

export const useTripStore = create<TripState>((set, get) => ({
  origin: null,
  destination: null,
  routes: null,
  selected: "safe",
  telemetry: TELEMETRY_EMPTY,
  history: [],
  setOd(origin, destination) {
    set({ origin, destination });
    void AsyncStorage.setItem(OD_KEY, JSON.stringify({ origin, destination }));
  },
  setRoutes(routes) {
    set({ routes });
  },
  select(variant) {
    set({ selected: variant });
  },
  startTrip() {
    set({ telemetry: { ...TELEMETRY_EMPTY, startedAtMs: Date.now() } });
  },
  endTrip() {
    get().recordTrip();
    set({ telemetry: TELEMETRY_EMPTY });
  },
  recordTrip() {
    const { origin, destination, selected, routes, history } = get();
    if (!origin || !destination || !routes) return;
    const variant = routes.variants.find((v) => v.name === selected) ?? routes.variants[0];
    if (!variant) return;
    const entry: TripHistoryEntry = {
      id: `trip-${Date.now()}`,
      origin,
      destination,
      selected,
      distance_m: variant.distance_m,
      duration_s: variant.duration_s,
      flood_score: variant.flood_score,
      saved_at_ms: Date.now(),
    };
    const next = [entry, ...history].slice(0, MAX_HISTORY);
    set({ history: next });
    void persistHistory(next);
  },
  clearHistory() {
    set({ history: [] });
    void persistHistory([]);
  },
}));

export async function rehydrate(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(OD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { origin: LatLon; destination: LatLon };
      useTripStore.getState().setOd(parsed.origin, parsed.destination);
    }
  } catch {
    /* corrupted storage — ignore */
  }
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TripHistoryEntry[];
      if (Array.isArray(parsed)) useTripStore.setState({ history: parsed });
    }
  } catch {
    /* ignore */
  }
}
