"""Public request/response models for the ``/v1`` API surface.

These models are also the canonical source for ``schemas/openapi/public_v1.yaml`` —
the spec is regenerated from the ``app.main:app`` instance by ``tools/gen_openapi.py``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from roadpulse_core.types import EtaConfidence, LatLon, RouteMode, TimeOfDay


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "down"]
    version: str
    build_sha: str | None = None
    uptime_s: float
    services: dict[str, str]
    data_origin: Literal["synthetic", "real"] = "synthetic"
    real_feeds: list[str] = Field(default_factory=list)
    pending_real_feeds: list[str] = Field(
        default_factory=lambda: [
            "vetc.hex.5min",
            "sentinel1.sar.water_mask",
            "vnms.weather.hourly",
            "fleet_sdk.probes",
        ]
    )


class RouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    origin: LatLon
    destination: LatLon
    mode: RouteMode = RouteMode.MOTORBIKE
    depart_at: datetime | None = None
    time_of_day: TimeOfDay = TimeOfDay.NOW
    avoid_tolls: bool = False
    avoid_flood: bool = True
    locale: str = "vi"
    ride_id: str | None = None


class RouteStep(BaseModel):
    instruction: str
    distance_m: float
    duration_s: float
    bearing_deg: float
    geometry: list[LatLon]


class RouteVariant(BaseModel):
    name: Literal["fast", "safe", "eco"]
    distance_m: float
    duration_s: float
    free_flow_s: float
    flood_score: float
    eco_score: float
    toll_vnd: int
    co2_g: float
    eta_p10_s: float
    eta_p90_s: float
    eta_confidence: EtaConfidence
    geometry: list[LatLon]
    steps: list[RouteStep]
    hex_path: list[str]
    notes: list[str] = Field(default_factory=list)


class RouteResponse(BaseModel):
    request_id: str
    generated_at: datetime
    variants: list[RouteVariant]
    flood_overlay: list[FloodOverlayPoint]
    weather_note: str | None = None


class FloodOverlayPoint(BaseModel):
    hex_id: str
    centroid: LatLon
    score: float = Field(ge=0.0, le=1.0)
    horizon: Literal["now", "1h", "3h", "6h"] = "now"


class BatchEtaItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order_id: str
    origin: LatLon
    destination: LatLon
    mode: RouteMode = RouteMode.MOTORBIKE
    pickup_window_min: int = Field(default=15, ge=0, le=240)


class BatchEtaRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    batch_id: str
    items: list[BatchEtaItem] = Field(min_length=1, max_length=50_000)
    depart_at: datetime | None = None


class BatchEtaPrediction(BaseModel):
    order_id: str
    distance_m: float
    eta_s: float
    eta_p10_s: float
    eta_p90_s: float
    flood_score: float
    confidence: EtaConfidence


class BatchEtaResponse(BaseModel):
    batch_id: str
    generated_at: datetime
    predictions: list[BatchEtaPrediction]
    summary: dict[str, float]


class IsochroneRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    origin: LatLon
    minutes: list[int] = Field(default_factory=lambda: [5, 10, 15], min_length=1, max_length=6)
    mode: RouteMode = RouteMode.MOTORBIKE
    depart_at: datetime | None = None


class IsochroneRing(BaseModel):
    minutes: int
    area_km2: float
    population_reached: int
    polygon: list[LatLon]


class IsochroneResponse(BaseModel):
    origin: LatLon
    generated_at: datetime
    rings: list[IsochroneRing]


class FloodRiskQuery(BaseModel):
    hex_ids: list[str] | None = None
    bbox: tuple[float, float, float, float] | None = None
    horizon: Literal["now", "1h", "3h", "6h"] = "now"


class FloodRiskResponse(BaseModel):
    horizon: Literal["now", "1h", "3h", "6h"]
    generated_at: datetime
    hexes: list[FloodOverlayPoint]


class SiteSelectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bbox: tuple[float, float, float, float]
    audience: Literal["retail", "logistics", "hospitality"] = "retail"
    weekday: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])
    hour_start: int = Field(default=7, ge=0, le=23)
    hour_end: int = Field(default=22, ge=1, le=23)


class SiteSelectionCell(BaseModel):
    hex_id: str
    centroid: LatLon
    score: float
    flow_share: float
    flood_penalty: float
    median_visit_min: float


class SiteSelectionResponse(BaseModel):
    bbox: tuple[float, float, float, float]
    generated_at: datetime
    top_cells: list[SiteSelectionCell]


class FleetMatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pickup: LatLon
    dropoff: LatLon
    weight_kg: float = Field(ge=1.0)
    volume_m3: float = Field(ge=0.01)
    mode: RouteMode = RouteMode.TRUCK
    departure_window_min: int = Field(default=60, ge=10, le=720)


class FleetMatchCandidate(BaseModel):
    fleet_id: str
    fleet_name: str
    vehicle_class: str
    capacity_kg: float
    capacity_m3: float
    pickup_eta_min: float
    quote_vnd: int
    flood_risk: float
    rating: float


class FleetMatchResponse(BaseModel):
    request_id: str
    generated_at: datetime
    candidates: list[FleetMatchCandidate]


class TriggerEvent(BaseModel):
    event_id: str
    policy_id: str
    hex_id: str
    flood_score: float
    confidence: float
    captured_at: datetime
    payload_signature: str
    payload_alg: str = "Ed25519"


class TriggerFeedResponse(BaseModel):
    policy_id: str
    generated_at: datetime
    events: list[TriggerEvent]


# --- Crowdsourced flood reports (M3) --------------------------------------------------


class FloodReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    location: LatLon
    severity: Literal["puddle", "knee", "waist"]
    note: str | None = Field(default=None, max_length=240)
    device_hash: str = Field(min_length=12, max_length=64)


class FloodReportAck(BaseModel):
    report_id: str
    accepted: bool
    hex_id: str
    severity_weight: float
    received_at: datetime
    crowd_boost: float


# --- Geocode (M4) ---------------------------------------------------------------------


class GeocodePlace(BaseModel):
    id: str
    name: str
    name_vi: str
    name_en: str
    lat: float
    lng: float
    district: str
    distance_m: float | None = None


class GeocodeResponse(BaseModel):
    query: str
    locale: str
    generated_at: datetime
    results: list[GeocodePlace]


class ReverseGeocodeResponse(BaseModel):
    lat: float
    lng: float
    locale: str
    generated_at: datetime
    nearest: GeocodePlace | None
    district: str | None


# --- WhatIf (M5) ----------------------------------------------------------------------


class WhatIfRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hex_ids: list[str] = Field(min_length=1, max_length=200)
    rainfall_mm_h: float = Field(ge=0, le=200)
    horizon_h: Literal[1, 3, 6] = 3


class WhatIfCell(BaseModel):
    hex_id: str
    baseline_score: float
    counterfactual_score: float
    delta: float
    trigger_likely: bool


class WhatIfResponse(BaseModel):
    generated_at: datetime
    rainfall_mm_h: float
    horizon_h: int
    cells: list[WhatIfCell]


# --- Replan (M6) ----------------------------------------------------------------------


class ReplanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ride_id: str
    origin: LatLon
    current_position: LatLon
    destination: LatLon
    current_variant: Literal["fast", "safe", "eco"]
    current_flood_score: float = Field(ge=0.0, le=1.0)
    mode: RouteMode = RouteMode.MOTORBIKE
    locale: str = "vi"


class ReplanResponse(BaseModel):
    ride_id: str
    generated_at: datetime
    should_reroute: bool
    reason: str | None
    variants: list[RouteVariant]


# --- Explain (M7) ---------------------------------------------------------------------


class ExplainRouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    origin: LatLon
    destination: LatLon
    variant: Literal["fast", "safe", "eco"] = "safe"
    mode: RouteMode = RouteMode.MOTORBIKE
    locale: str = "vi"


class ExplainFactor(BaseModel):
    name: Literal["flood", "congestion", "distance", "eco", "tolls"]
    value: float
    weight: float
    description_vi: str
    description_en: str


class ExplainRouteResponse(BaseModel):
    variant: Literal["fast", "safe", "eco"]
    distance_m: float
    duration_s: float
    summary_vi: str
    summary_en: str
    factors: list[ExplainFactor]


# --- K-anon violations admin (M10) ----------------------------------------------------


class KAnonViolationDTO(BaseModel):
    source: str
    bucket: str
    attempted_k: int
    min_k: int
    dropped_at: datetime


class KAnonViolationsResponse(BaseModel):
    min_k: int
    window_s: int
    generated_at: datetime
    violations: list[KAnonViolationDTO]


RouteResponse.model_rebuild()
