"""``POST /v1/flood-reports`` — crowdsourced wet-spot reports from drivers.

Reports are deduplicated per ``device_hash`` over a 60-second window so we don't
let a single phone spam the feed. Each accepted report bumps the ``crowd_boost``
weight applied to the nearest H3 hex; the boost is read back into ``/v1/route``
and ``/v1/flood-risk`` so safe-route picks adapt within seconds of a real
observation.
"""

from __future__ import annotations

import hashlib
import math
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from roadpulse_core.types import Org

from app.dependencies import org_from_api_key, state_dep
from app.models import FloodReportAck, FloodReportRequest
from app.state import AppState

router = APIRouter(prefix="/v1", tags=["flood-reports"])

_SEVERITY_WEIGHT: dict[str, float] = {"puddle": 0.10, "knee": 0.40, "waist": 0.80}
_DEDUPE_WINDOW = timedelta(seconds=60)


@router.post(
    "/flood-reports",
    response_model=FloodReportAck,
    summary="Submit a crowdsourced flood observation",
)
def post_flood_report(
    body: FloodReportRequest,
    state: Annotated[AppState, Depends(state_dep)],
    _org: Annotated[Org, Depends(org_from_api_key)],
) -> FloodReportAck:
    now = datetime.now(UTC)
    device_id = hashlib.sha256(body.device_hash.encode("utf-8")).hexdigest()[:32]

    last_seen = state.flood_report_last_seen.get(device_id)
    if last_seen is not None and now - last_seen < _DEDUPE_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="duplicate report within 60s window",
        )

    nearest_hex = _nearest_hex(state, body.location.lat, body.location.lng)
    if nearest_hex is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="no hex overlay available for the given location",
        )

    weight = _SEVERITY_WEIGHT[body.severity]
    prior = state.crowd_boost.get(nearest_hex, 0.0)
    boost = min(1.0, prior + weight)
    state.crowd_boost[nearest_hex] = boost
    state.flood_report_last_seen[device_id] = now
    state.flood_reports.append(
        {
            "id": str(uuid.uuid4()),
            "device_id": device_id,
            "hex_id": nearest_hex,
            "severity": body.severity,
            "severity_weight": weight,
            "received_at": now,
            "note": body.note,
        }
    )
    return FloodReportAck(
        report_id=state.flood_reports[-1]["id"],
        accepted=True,
        hex_id=nearest_hex,
        severity_weight=weight,
        received_at=now,
        crowd_boost=round(boost, 3),
    )


def _nearest_hex(state: AppState, lat: float, lng: float) -> str | None:
    """Return the hex_id with the centroid nearest to (lat, lng)."""
    best_id: str | None = None
    best_d = float("inf")
    for entry in state.flood_overlay:
        centroid = entry["centroid"]  # type: ignore[index]
        d = math.hypot(centroid.lat - lat, centroid.lng - lng)
        if d < best_d:
            best_d = d
            best_id = str(entry["hex_id"])  # type: ignore[index]
    return best_id
