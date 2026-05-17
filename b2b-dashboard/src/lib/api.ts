/**
 * Typed client for the RoadPulse public API.
 *
 * The shape mirrors `schemas/openapi/public_v1.yaml`. Only the endpoints the
 * operator dashboard actually consumes are wrapped.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

// Demo API keys — the dashboard ships pre-wired so the user can flip between
// tabs without touching `.env`. Production turns ``require_api_key`` on and
// these defaults stop working.
const INSURER_API_KEY = import.meta.env.VITE_INSURER_API_KEY ?? "rp_pti_oracle_kQ77";
const INTERNAL_API_KEY = import.meta.env.VITE_INTERNAL_API_KEY ?? "rp_demo_key_2024";

export type LatLon = { lat: number; lng: number };

export type EtaPrediction = {
  order_id: string;
  eta_s: number;
  eta_p10_s: number;
  eta_p90_s: number;
  flood_score: number;
  distance_m: number;
  confidence: "low" | "medium" | "high";
};

export type BatchEtaResponse = {
  batch_id: string;
  predictions: EtaPrediction[];
};

export type EtaBatchItem = {
  order_id: string;
  origin: LatLon;
  destination: LatLon;
  mode?: "motorbike" | "car" | "truck";
  depart_at?: string;
};

export type SiteCell = {
  hex_id: string;
  origin_flows: number;
  destination_flows: number;
  rank: number;
};

export type FleetMatchCandidate = {
  fleet_id: string;
  fleet_name: string;
  vehicle_class: string;
  eta_s: number;
  bid_vnd: number;
  flood_safe: boolean;
};

export type TriggerEvent = {
  event_id: string;
  policy_id: string;
  hex_id: string;
  flood_score: number;
  confidence: number;
  captured_at: string;
  payload_signature: string;
  payload_alg: string;
};

export type TriggerFeedResponse = {
  policy_id: string;
  generated_at: string;
  events: TriggerEvent[];
};

export type KAnonViolation = {
  source: string;
  bucket: string;
  attempted_k: number;
  min_k: number;
  dropped_at: string;
};

export type KAnonViolationsResponse = {
  min_k: number;
  window_s: number;
  generated_at: string;
  violations: KAnonViolation[];
};

export type IsochroneRing = {
  minutes: number;
  area_km2: number;
  population_reached: number;
  polygon: LatLon[];
};

export type IsochroneResponse = {
  origin: LatLon;
  generated_at: string;
  rings: IsochroneRing[];
};

export type FloodHex = {
  hex_id: string;
  lat: number;
  lng: number;
  score: number;
};

export type HealthResponse = {
  status: "ok";
  version: string;
  data_origin: "synthetic" | "real";
  real_feeds: string[];
  pending_real_feeds: string[];
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`RoadPulse ${path} → ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function callText(path: string, init?: RequestInit): Promise<string> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`RoadPulse ${path} → ${res.status} ${await res.text()}`);
  }
  return await res.text();
}

export const api = {
  baseUrl: BASE_URL,
  insurerKey: INSURER_API_KEY,
  internalKey: INTERNAL_API_KEY,
  floodStreamUrl(maxEvents = 0, intervalS = 5) {
    const params = new URLSearchParams({ interval_s: String(intervalS) });
    if (maxEvents > 0) {
      params.set("max_events", String(maxEvents));
    }
    return `${BASE_URL}/v1/flood-stream?${params.toString()}`;
  },
  etaBatch(items: EtaBatchItem[]) {
    return call<BatchEtaResponse>("/v1/eta-batch", {
      method: "POST",
      body: JSON.stringify({ batch_id: crypto.randomUUID(), items }),
    });
  },
  siteSelection(bbox: { north: number; south: number; east: number; west: number }, hour: number) {
    return call<{ ranked: SiteCell[] }>("/v1/site-selection", {
      method: "POST",
      body: JSON.stringify({ bbox, hour_of_week: hour, top_n: 10 }),
    });
  },
  fleetMatch(origin: LatLon, destination: LatLon) {
    return call<{ candidates: FleetMatchCandidate[] }>("/v1/fleet-match", {
      method: "POST",
      body: JSON.stringify({ origin, destination, vehicle_class: "MOTORBIKE", max_candidates: 5 }),
    });
  },
  triggerFeed(policyId: string) {
    return call<TriggerFeedResponse>(`/v1/trigger-feed/${encodeURIComponent(policyId)}`, {
      headers: { "X-API-Key": INSURER_API_KEY },
    });
  },
  triggerFeedPubkey(policyId: string) {
    return callText(`/v1/trigger-feed/${encodeURIComponent(policyId)}/pubkey`, {
      headers: { "X-API-Key": INSURER_API_KEY },
    });
  },
  kanonViolations() {
    return call<KAnonViolationsResponse>("/v1/admin/kanon-violations", {
      headers: { "X-API-Key": INTERNAL_API_KEY },
    });
  },
  isochrone(origin: LatLon, minutes: number[] = [5, 10, 15], mode: "motorbike" | "car" = "motorbike") {
    return call<IsochroneResponse>("/v1/isochrone", {
      method: "POST",
      body: JSON.stringify({ origin, minutes, mode }),
    });
  },
  floodRisk(horizon: "now" | "1h" | "3h" | "6h" = "now") {
    return call<{ hexes: FloodHex[] }>(`/v1/flood-risk?horizon=${horizon}`);
  },
  health() {
    return call<HealthResponse>("/v1/healthz");
  },
};
