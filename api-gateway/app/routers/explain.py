"""``POST /v1/explain-route`` — XAI breakdown for a variant.

Decomposes the cost of a chosen ``fast``/``safe``/``eco`` variant into a small
fixed set of factors (flood, congestion, distance, eco, tolls) with the weights
the planner applies under that variant. Each factor includes a human-readable
description in both Vietnamese and English so the B2C app and the B2B insurer
view can render the same explanation.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from roadpulse_core.types import Org, RouteMode
from roadpulse_routing.engine import RoutingEngine

from app.dependencies import org_from_api_key, routing_engine_dep, state_dep
from app.models import ExplainFactor, ExplainRouteRequest, ExplainRouteResponse
from app.state import AppState

router = APIRouter(prefix="/v1", tags=["explain"])


_WEIGHTS: dict[str, dict[str, float]] = {
    "fast": {"distance": 0.5, "congestion": 0.5, "flood": 0.0, "eco": 0.0, "tolls": 0.0},
    "safe": {"flood": 0.5, "congestion": 0.2, "distance": 0.2, "eco": 0.0, "tolls": 0.1},
    "eco": {"eco": 0.5, "distance": 0.3, "flood": 0.2, "congestion": 0.0, "tolls": 0.0},
}


def _toll_for_variant(state: AppState, hex_path: list[str], mode: RouteMode) -> int:
    if mode in {RouteMode.MOTORBIKE, RouteMode.BICYCLE}:
        return 0
    multiplier = 3 if mode == RouteMode.TRUCK else 1
    toll_by_hex: dict[str, int] = {}
    for edge in state.seed.edges:
        hid = edge.tags.get("hex_id", "")
        if not hid:
            continue
        try:
            toll = int(edge.tags.get("toll_vnd", 0) or 0)
        except ValueError:
            toll = 0
        if toll:
            toll_by_hex[hid] = max(toll_by_hex.get(hid, 0), toll)
    return sum(toll_by_hex.get(hid, 0) for hid in hex_path) * multiplier


def _normalise_distance(distance_m: float) -> float:
    # Map [0, 30 km] → [0, 1]; values above 30 km clip to 1.
    return min(1.0, max(0.0, distance_m / 30_000.0))


def _factor_description(name: str, value: float) -> tuple[str, str]:
    pct = int(round(value * 100))
    pieces: dict[str, tuple[str, str]] = {
        "flood": (
            f"Nguy cơ ngập trung bình trên tuyến: {pct}%",
            f"Average flood risk along the route: {pct}%",
        ),
        "congestion": (
            f"Mức độ tắc nghẽn trung bình: {pct}%",
            f"Average congestion along the route: {pct}%",
        ),
        "distance": (
            f"Khoảng cách so với ngưỡng 30 km: {pct}%",
            f"Distance relative to the 30 km benchmark: {pct}%",
        ),
        "eco": (
            f"Điểm sinh thái (đường thấp tốc, hẻm): {pct}%",
            f"Eco score (low-speed roads, alleys): {pct}%",
        ),
        "tolls": (
            f"Mức phí cầu đường tương đối: {pct}%",
            f"Toll exposure (relative): {pct}%",
        ),
    }
    return pieces[name]


@router.post(
    "/explain-route",
    response_model=ExplainRouteResponse,
    summary="Decompose a route variant into weighted factors (XAI)",
)
def post_explain_route(
    body: ExplainRouteRequest,
    engine: Annotated[RoutingEngine, Depends(routing_engine_dep)],
    state: Annotated[AppState, Depends(state_dep)],
    _org: Annotated[Org, Depends(org_from_api_key)],
) -> ExplainRouteResponse:
    origin_node = state.nearest_node(body.origin)
    destination_node = state.nearest_node(body.destination)
    if origin_node.id == destination_node.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="origin and destination map to the same graph node",
        )
    try:
        candidates = engine.three_candidates(
            origin_node.id,
            destination_node.id,
            mode=body.mode,
            locale=body.locale,
        )
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    chosen = next((c for c in candidates if c.name == body.variant), candidates[1])
    weights = _WEIGHTS[body.variant]
    toll_vnd = _toll_for_variant(state, chosen.hex_path, body.mode)
    toll_norm = min(1.0, toll_vnd / 100_000.0)
    factor_values: dict[str, float] = {
        "flood": float(chosen.flood_score),
        "congestion": float(chosen.congestion_score),
        "distance": _normalise_distance(chosen.distance_m),
        "eco": min(1.0, float(chosen.eco_score) / 20.0),
        "tolls": toll_norm,
    }
    factors: list[ExplainFactor] = []
    for name in ("flood", "congestion", "distance", "eco", "tolls"):
        d_vi, d_en = _factor_description(name, factor_values[name])
        factors.append(
            ExplainFactor(
                name=name,  # type: ignore[arg-type]
                value=round(factor_values[name], 4),
                weight=weights.get(name, 0.0),
                description_vi=d_vi,
                description_en=d_en,
            )
        )
    summary_vi = (
        f"Tuyến {body.variant} dài {chosen.distance_m / 1000:.1f} km, "
        f"thời gian khoảng {chosen.duration_s / 60:.0f} phút. "
        f"Yếu tố ngập chiếm trọng số {weights['flood']:.0%}."
    )
    summary_en = (
        f"The {body.variant} variant is {chosen.distance_m / 1000:.1f} km long, "
        f"≈ {chosen.duration_s / 60:.0f} min. "
        f"Flood factor weight: {weights['flood']:.0%}."
    )
    return ExplainRouteResponse(
        variant=body.variant,
        distance_m=round(chosen.distance_m, 2),
        duration_s=round(chosen.duration_s, 2),
        summary_vi=summary_vi,
        summary_en=summary_en,
        factors=factors,
    )
