"""``POST /v1/whatif`` — counterfactual flood scoring for insurers.

Given a set of hexes and a hypothetical rainfall intensity in mm/h, return the
expected flood score per hex if the rainfall actually materialised. The lift is
a smooth sigmoid-style boost on top of the current baseline so the response is
deterministic, monotonic in ``rainfall_mm_h`` and easy to plot in the B2B
"what-if" planner.

Authz: this endpoint is gated to the ``b2b2c`` / ``research`` / ``internal``
tiers because the output is sensitive enough that we don't want it leaking onto
a public mobile demo.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from roadpulse_core.types import Org

from app.dependencies import org_from_api_key, state_dep
from app.models import WhatIfCell, WhatIfRequest, WhatIfResponse
from app.state import AppState

router = APIRouter(prefix="/v1", tags=["whatif"])

_INSURER_TIERS = {"b2b2c", "research", "internal"}


@router.post(
    "/whatif",
    response_model=WhatIfResponse,
    summary="Counterfactual flood scoring under a hypothetical rainfall scenario",
)
def post_whatif(
    body: WhatIfRequest,
    state: Annotated[AppState, Depends(state_dep)],
    org: Annotated[Org, Depends(org_from_api_key)],
) -> WhatIfResponse:
    if org.tier not in _INSURER_TIERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="whatif scenarios are restricted to b2b2c/research/internal tiers",
        )
    baselines: dict[str, float] = {
        str(entry["hex_id"]): float(entry["score"])  # type: ignore[index]
        for entry in state.flood_overlay
    }
    horizon_factor = {1: 0.95, 3: 1.00, 6: 0.85}[body.horizon_h]
    cells: list[WhatIfCell] = []
    for hex_id in body.hex_ids:
        baseline = baselines.get(hex_id, 0.05)
        cf = _counterfactual_score(baseline, body.rainfall_mm_h) * horizon_factor
        cf = max(0.0, min(1.0, cf))
        cells.append(
            WhatIfCell(
                hex_id=hex_id,
                baseline_score=round(baseline, 4),
                counterfactual_score=round(cf, 4),
                delta=round(cf - baseline, 4),
                trigger_likely=cf >= 0.65,
            )
        )
    return WhatIfResponse(
        generated_at=datetime.now(UTC),
        rainfall_mm_h=body.rainfall_mm_h,
        horizon_h=body.horizon_h,
        cells=cells,
    )


def _counterfactual_score(baseline: float, rainfall_mm_h: float) -> float:
    # Smooth boost: 0 mm/h ⇒ baseline; 30 mm/h ⇒ +0.30; 60 mm/h ⇒ +0.55;
    # 100 mm/h ⇒ +0.70. Multiplied by the head-room above the baseline so we
    # never exceed 1.0.
    if rainfall_mm_h <= 0:
        return baseline
    boost = 0.7 * (rainfall_mm_h / (rainfall_mm_h + 30.0))
    return baseline + boost * (1.0 - baseline)
