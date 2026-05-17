/**
 * Multi-city dataset switcher (N5).
 *
 * Today the gateway serves HCMC seed fixtures, but the dashboard is wired so
 * we can flip between cities in a single place. Add a new entry here and every
 * page that imports `useCity()` will pick up the new bbox / centre.
 */
import { useSyncExternalStore } from "react";

export type CityId = "hcmc" | "hanoi";

export type CityDef = {
  id: CityId;
  label: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  bbox: { north: number; south: number; east: number; west: number };
};

export const CITIES: Record<CityId, CityDef> = {
  hcmc: {
    id: "hcmc",
    label: "Hồ Chí Minh",
    origin: { lat: 10.806, lng: 106.7 },
    destination: { lat: 10.737, lng: 106.722 },
    bbox: { north: 10.82, south: 10.72, east: 106.76, west: 106.65 },
  },
  hanoi: {
    id: "hanoi",
    label: "Hà Nội",
    origin: { lat: 21.0285, lng: 105.8542 },
    destination: { lat: 21.0049, lng: 105.8431 },
    bbox: { north: 21.06, south: 20.99, east: 105.9, west: 105.79 },
  },
};

const STORAGE_KEY = "roadpulse.b2b.city";
const listeners = new Set<() => void>();
let current: CityId = readInitial();

function readInitial(): CityId {
  if (typeof window === "undefined") {
    return "hcmc";
  }
  const stored = window.localStorage?.getItem(STORAGE_KEY);
  return stored === "hanoi" ? "hanoi" : "hcmc";
}

function emit() {
  for (const fn of listeners) {
    fn();
  }
}

export function setCity(next: CityId) {
  current = next;
  if (typeof window !== "undefined") {
    window.localStorage?.setItem(STORAGE_KEY, next);
  }
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot() {
  return current;
}

export function useCity(): { id: CityId; def: CityDef; setCity: (id: CityId) => void } {
  const id = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { id, def: CITIES[id], setCity };
}
