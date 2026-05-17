"""``GET /v1/flood-stream`` — SSE stream of top hexes by flood score.

A lightweight Server-Sent Events endpoint that pushes the current top-3 flood
hexes every 5 seconds. The B2B dashboard subscribes via ``EventSource`` to drive
the live alerts panel; the cadence is deliberately slow so the demo doesn't
spam the network.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from roadpulse_core.types import Org

from app.dependencies import org_from_api_key, state_dep
from app.state import AppState

router = APIRouter(prefix="/v1", tags=["flood-stream"])


@router.get(
    "/flood-stream",
    summary="Server-Sent Events stream of the top flood hexes",
)
async def flood_stream(
    request: Request,
    state: Annotated[AppState, Depends(state_dep)],
    _org: Annotated[Org, Depends(org_from_api_key)],
    interval_s: Annotated[float, Query(ge=0.5, le=60.0)] = 5.0,
    max_events: Annotated[int, Query(ge=1, le=100)] = 0,
) -> StreamingResponse:
    async def event_stream():
        sent = 0
        while True:
            if await request.is_disconnected():
                break
            overlay = list(state.flood_overlay)
            top = sorted(
                overlay,
                key=lambda x: -float(x["score"]),  # type: ignore[index]
            )[:3]
            payload = {
                "ts": datetime.now(UTC).isoformat(),
                "top": [
                    {
                        "hex_id": str(entry["hex_id"]),  # type: ignore[index]
                        "score": round(float(entry["score"]), 4),  # type: ignore[index]
                        "lat": float(entry["centroid"].lat),  # type: ignore[union-attr,index]
                        "lng": float(entry["centroid"].lng),  # type: ignore[union-attr,index]
                    }
                    for entry in top
                ],
            }
            yield f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"
            sent += 1
            if max_events and sent >= max_events:
                break
            await asyncio.sleep(interval_s)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
