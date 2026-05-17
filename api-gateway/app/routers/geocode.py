"""``GET /v1/geocode`` and ``GET /v1/reverse-geocode``.

A tiny, fully-offline place index for HCMC. No external Google/Mapbox calls —
the seed file at ``data/seed/places.json`` contains ~50 well-known POIs (Bến
Thành Market, Tân Sơn Nhất, RMIT, etc.) and we substring-match the user's
query against both Vietnamese and English names.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from roadpulse_core.types import Org

from app.dependencies import org_from_api_key, state_dep
from app.models import GeocodePlace, GeocodeResponse, ReverseGeocodeResponse
from app.state import AppState

router = APIRouter(prefix="/v1", tags=["geocode"])


def _to_place(raw: dict[str, object], locale: str) -> GeocodePlace:
    name = str(raw.get("name_vi") if locale == "vi" else raw.get("name_en") or raw.get("name_vi"))
    return GeocodePlace(
        id=str(raw["id"]),
        name=name,
        name_vi=str(raw["name_vi"]),
        name_en=str(raw["name_en"]),
        lat=float(raw["lat"]),  # type: ignore[arg-type]
        lng=float(raw["lng"]),  # type: ignore[arg-type]
        district=str(raw["district"]),
    )


@router.get(
    "/geocode",
    response_model=GeocodeResponse,
    summary="Substring-match POI lookup (HCMC)",
)
def geocode(
    state: Annotated[AppState, Depends(state_dep)],
    _org: Annotated[Org, Depends(org_from_api_key)],
    q: Annotated[str, Query(min_length=1, max_length=120)] = "",
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
    locale: Annotated[str, Query()] = "vi",
) -> GeocodeResponse:
    needle = q.strip().lower()
    matches: list[GeocodePlace] = []
    for raw in state.places:
        name_vi = str(raw.get("name_vi", "")).lower()
        name_en = str(raw.get("name_en", "")).lower()
        district = str(raw.get("district", "")).lower()
        if not needle or needle in name_vi or needle in name_en or needle in district:
            matches.append(_to_place(raw, locale))
        if len(matches) >= limit:
            break
    return GeocodeResponse(
        query=q,
        locale=locale,
        generated_at=datetime.now(UTC),
        results=matches,
    )


@router.get(
    "/reverse-geocode",
    response_model=ReverseGeocodeResponse,
    summary="Reverse-geocode a coordinate to the nearest POI + district",
)
def reverse_geocode(
    state: Annotated[AppState, Depends(state_dep)],
    _org: Annotated[Org, Depends(org_from_api_key)],
    lat: Annotated[float, Query(ge=-90.0, le=90.0)],
    lng: Annotated[float, Query(ge=-180.0, le=180.0)],
    locale: Annotated[str, Query()] = "vi",
) -> ReverseGeocodeResponse:
    best: tuple[float, dict[str, object]] | None = None
    for raw in state.places:
        d = _haversine_m(lat, lng, float(raw["lat"]), float(raw["lng"]))  # type: ignore[arg-type]
        if best is None or d < best[0]:
            best = (d, raw)
    nearest: GeocodePlace | None = None
    district: str | None = None
    if best is not None:
        nearest = _to_place(best[1], locale)
        nearest = nearest.model_copy(update={"distance_m": round(best[0], 1)})
        district = nearest.district
    return ReverseGeocodeResponse(
        lat=lat,
        lng=lng,
        locale=locale,
        generated_at=datetime.now(UTC),
        nearest=nearest,
        district=district,
    )


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
