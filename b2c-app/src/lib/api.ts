/**
 * Typed thin client for the RoadPulse public API.
 *
 * The shape mirrors `schemas/openapi/public_v1.yaml`. Only the endpoints the
 * mobile app actually consumes are wrapped — the dashboard uses its own
 * (richer) client in `apps/b2b-dashboard`.
 */
import Constants from "expo-constants";

// `process.env.EXPO_PUBLIC_*` is injected at bundle time by Expo's Metro plugin;
// declare the shape locally so `tsc --noEmit` does not require @types/node.
declare const process: { env: Record<string, string | undefined> };

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  "http://localhost:8080";

export type LatLon = { lat: number; lng: number };

export type RouteVariantName = "fast" | "safe" | "eco";

export type EtaConfidence = "low" | "medium" | "high";

export type RouteVariant = {
  name: RouteVariantName;
  distance_m: number;
  duration_s: number;
  free_flow_s: number;
  flood_score: number;
  eco_score: number;
  toll_vnd: number;
  co2_g: number;
  eta_p10_s: number;
  eta_p90_s: number;
  eta_confidence: EtaConfidence;
  geometry: LatLon[];
  hex_path: string[];
  steps: RouteStep[];
  notes: string[];
};

export type RouteStep = {
  instruction: string;
  distance_m: number;
  duration_s: number;
  bearing_deg: number;
  geometry: LatLon[];
};

export type FloodOverlayPoint = {
  hex_id: string;
  centroid: LatLon;
  score: number;
  horizon: string;
};

export type RouteResponse = {
  request_id: string;
  generated_at: string;
  variants: RouteVariant[];
  flood_overlay: FloodOverlayPoint[];
  weather_note: string | null;
};

export type ReplanResponse = {
  ride_id: string;
  generated_at: string;
  should_reroute: boolean;
  reason: string | null;
  variants: RouteVariant[];
};

export type ExplainFactor = {
  name: "flood" | "congestion" | "distance" | "eco" | "tolls";
  value: number;
  weight: number;
  description_vi: string;
  description_en: string;
};

export type ExplainRouteResponse = {
  variant: RouteVariantName;
  distance_m: number;
  duration_s: number;
  summary_vi: string;
  summary_en: string;
  factors: ExplainFactor[];
};

export type GeocodePlace = {
  id: string;
  name: string;
  name_vi: string;
  name_en: string;
  lat: number;
  lng: number;
  district: string;
  distance_m: number | null;
};

export type GeocodeResponse = {
  query: string;
  locale: string;
  generated_at: string;
  results: GeocodePlace[];
};

export type ReverseGeocodeResponse = {
  lat: number;
  lng: number;
  locale: string;
  generated_at: string;
  nearest: GeocodePlace | null;
  district: string | null;
};

export type FloodReportAck = {
  report_id: string;
  accepted: boolean;
  hex_id: string;
  severity_weight: number;
  received_at: string;
  crowd_boost: number;
};

export type IsochroneResponse = {
  origin: LatLon;
  generated_at: string;
  rings: { minutes: number; area_km2: number; population_reached: number; polygon: LatLon[] }[];
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RoadPulse ${path} → ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export const api = {
  baseUrl: BASE_URL,
  route(
    origin: LatLon,
    destination: LatLon,
    mode: "motorbike" | "car" = "motorbike",
    locale: "vi" | "en" = "vi",
  ) {
    return call<RouteResponse>("/v1/route", {
      method: "POST",
      body: JSON.stringify({ origin, destination, mode, avoid_flood: true, locale }),
    });
  },
  floodOverlay(horizon: "now" | "1h" | "3h" | "6h" = "now") {
    return call<{
      horizon: string;
      generated_at: string;
      hexes: FloodOverlayPoint[];
    }>(`/v1/flood-risk?horizon=${horizon}`);
  },
  geocode(query: string, locale: "vi" | "en" = "vi", limit = 8) {
    const q = encodeURIComponent(query);
    return call<GeocodeResponse>(`/v1/geocode?q=${q}&locale=${locale}&limit=${limit}`);
  },
  reverseGeocode(lat: number, lng: number, locale: "vi" | "en" = "vi") {
    return call<ReverseGeocodeResponse>(
      `/v1/reverse-geocode?lat=${lat}&lng=${lng}&locale=${locale}`,
    );
  },
  reportFlood(body: {
    location: LatLon;
    severity: "puddle" | "knee" | "waist";
    note?: string;
    device_hash: string;
  }) {
    return call<FloodReportAck>("/v1/flood-reports", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  replan(body: {
    ride_id: string;
    origin: LatLon;
    current_position: LatLon;
    destination: LatLon;
    current_variant: RouteVariantName;
    current_flood_score: number;
    locale?: "vi" | "en";
  }) {
    return call<ReplanResponse>("/v1/replan", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  explain(body: {
    origin: LatLon;
    destination: LatLon;
    variant: RouteVariantName;
    locale?: "vi" | "en";
  }) {
    return call<ExplainRouteResponse>("/v1/explain-route", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  isochrone(origin: LatLon, minutes: number[] = [5, 10, 15]) {
    return call<IsochroneResponse>("/v1/isochrone", {
      method: "POST",
      body: JSON.stringify({ origin, minutes }),
    });
  },
};
