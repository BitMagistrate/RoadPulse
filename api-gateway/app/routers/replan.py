"""``POST /v1/replan`` — mid-trip re-routing.

Given the driver's current position, destination and the score of the variant
they were on, run the three-candidate planner from the current position and
return updated variants plus a boolean ``should_reroute`` flag the mobile app
uses to nudge the driver onto a safer corridor.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from roadpulse_core.types import LatLon, Org, RouteMode
from roadpulse_ml.eco import EcoModel
from roadpulse_ml.eta import EtaModel, ETARecord
from roadpulse_routing.engine import RoutingEngine

from app.dependencies import (
    eco_model_dep,
    eta_model_dep,
    org_from_api_key,
    routing_engine_dep,
    state_dep,
)
from app.models import ReplanRequest, ReplanResponse, RouteStep, RouteVariant
from app.state import AppState

router = APIRouter(prefix="/v1", tags=["replan"])

_REROUTE_THRESHOLD = 0.15


@router.post(
    "/replan",
    response_model=ReplanResponse,
    summary="Mid-trip replanning from the driver's current position",
)
def post_replan(
    body: ReplanRequest,
    engine: Annotated[RoutingEngine, Depends(routing_engine_dep)],
    eta_model: Annotated[EtaModel, Depends(eta_model_dep)],
    eco_model: Annotated[EcoModel, Depends(eco_model_dep)],
    state: Annotated[AppState, Depends(state_dep)],
    _org: Annotated[Org, Depends(org_from_api_key)],
) -> ReplanResponse:
    here_node = state.nearest_node(body.current_position)
    destination_node = state.nearest_node(body.destination)
    if here_node.id == destination_node.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="current_position and destination map to the same graph node",
        )
    try:
        candidates = engine.three_candidates(
            here_node.id,
            destination_node.id,
            mode=body.mode,
            locale=body.locale,
        )
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    now = datetime.now(UTC)
    hour_of_week = (now.weekday() * 24 + now.hour) % 168
    is_weekend = 1 if now.weekday() >= 5 else 0
    is_rush = 1 if now.hour in {7, 8, 9, 17, 18, 19} else 0

    variants: list[RouteVariant] = []
    safe_score: float | None = None
    for variant in candidates:
        avg_speed = (
            (variant.distance_m / variant.duration_s) * 3.6 if variant.duration_s > 0 else 0
        )
        eta_record = ETARecord(
            distance_m=variant.distance_m,
            free_flow_seconds=variant.free_flow_seconds,
            hour_of_week=hour_of_week,
            is_weekend=is_weekend,
            precipitation_mm_h=4.0 if variant.flood_score > 0.2 else 0.0,
            wind_kmh=12.0,
            is_rush_hour=is_rush,
            lag_speed_5min=avg_speed,
            lag_speed_15min=avg_speed,
            lag_speed_1h=avg_speed,
            vehicle_count_5min=320,
            flood_score=variant.flood_score,
            road_class_index=_road_class_to_index(body.mode),
        )
        prediction = eta_model.predict(eta_record)
        emissions = eco_model.estimate(
            mode=body.mode,
            distance_m=variant.distance_m,
            avg_speed_kmh=max(avg_speed, 5.0),
        )
        if variant.name == "safe":
            safe_score = variant.flood_score
        variants.append(
            RouteVariant(
                name=variant.name,  # type: ignore[arg-type]
                distance_m=variant.distance_m,
                duration_s=prediction.eta_s,
                free_flow_s=variant.free_flow_seconds,
                flood_score=variant.flood_score,
                eco_score=max(variant.eco_score, emissions.eco_score),
                toll_vnd=0,
                co2_g=emissions.g_co2,
                eta_p10_s=prediction.eta_p10_s,
                eta_p90_s=prediction.eta_p90_s,
                eta_confidence=prediction.confidence,
                geometry=[LatLon(lat=lat, lng=lng) for lng, lat in variant.geometry],
                steps=_flatten_steps(variant),
                hex_path=variant.hex_path,
                notes=[],
            )
        )

    should_reroute = (
        safe_score is not None and body.current_flood_score - safe_score > _REROUTE_THRESHOLD
    )
    reason: str | None = None
    if should_reroute and safe_score is not None:
        reason = (
            f"flood score on the current variant ({body.current_flood_score:.2f}) is "
            f"≥{_REROUTE_THRESHOLD:.2f} above the safer alternative ({safe_score:.2f})"
        )
    return ReplanResponse(
        ride_id=body.ride_id,
        generated_at=now,
        should_reroute=should_reroute,
        reason=reason,
        variants=variants,
    )


def _flatten_steps(variant) -> list[RouteStep]:
    return [
        RouteStep(
            instruction=step.instruction,
            distance_m=step.distance_m,
            duration_s=step.duration_s,
            bearing_deg=step.bearing_deg,
            geometry=[LatLon(lat=lat, lng=lng) for lng, lat in step.geometry],
        )
        for step in variant.steps
    ]


def _road_class_to_index(mode: RouteMode) -> int:
    return {
        RouteMode.MOTORBIKE: 1,
        RouteMode.CAR: 2,
        RouteMode.TRUCK: 4,
        RouteMode.BICYCLE: 0,
    }.get(mode, 1)
