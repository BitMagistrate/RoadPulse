"""Admin endpoints — k-anon violations log, RoadPulse internal use only."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from roadpulse_core.types import Org

from app.dependencies import org_from_api_key, state_dep
from app.models import KAnonViolationDTO, KAnonViolationsResponse
from app.state import AppState

router = APIRouter(prefix="/v1", tags=["admin"])


@router.get(
    "/admin/kanon-violations",
    response_model=KAnonViolationsResponse,
    summary="Recent k-anonymity guard violations (internal tier only)",
)
def list_kanon_violations(
    state: Annotated[AppState, Depends(state_dep)],
    org: Annotated[Org, Depends(org_from_api_key)],
) -> KAnonViolationsResponse:
    if org.tier != "internal":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="admin endpoints require an internal-tier API key",
        )
    guard = state.kanon_guard
    items = [
        KAnonViolationDTO(
            source=v.source,
            bucket=v.bucket,
            attempted_k=v.attempted_k,
            min_k=v.min_k,
            dropped_at=v.dropped_at,
        )
        for v in guard.violations
    ]
    return KAnonViolationsResponse(
        min_k=guard.min_k,
        window_s=int(guard.window.total_seconds()),
        generated_at=datetime.now(UTC),
        violations=items,
    )
