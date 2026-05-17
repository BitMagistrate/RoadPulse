"""Tests for the insurer-only ``/v1/whatif`` endpoint (M5)."""

from __future__ import annotations

import pytest
from app.main import app
from app.state import get_app_state, reset_app_state
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client() -> TestClient:
    reset_app_state()
    with TestClient(app) as tc:
        yield tc
    reset_app_state()


def _internal_key() -> str:
    state = get_app_state()
    for key, org_id in state.seed.api_keys.items():
        org = state.seed.orgs.get(org_id)
        if org and org.tier in {"b2b2c", "research", "internal"}:
            return key
    raise RuntimeError("no insurer-tier API key in seed data")


def test_whatif_returns_counterfactual_cells(client: TestClient) -> None:
    api_key = _internal_key()
    overlay = client.get("/v1/flood-risk").json()
    hex_ids = [h["hex_id"] for h in overlay["hexes"][:3]]
    resp = client.post(
        "/v1/whatif",
        headers={"X-API-Key": api_key},
        json={"hex_ids": hex_ids, "rainfall_mm_h": 45.0, "horizon_h": 3},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["rainfall_mm_h"] == pytest.approx(45.0)
    assert body["horizon_h"] == 3
    assert len(body["cells"]) == len(hex_ids)
    for cell in body["cells"]:
        assert cell["hex_id"] in hex_ids
        assert 0.0 <= cell["baseline_score"] <= 1.0
        assert 0.0 <= cell["counterfactual_score"] <= 1.0
        assert cell["counterfactual_score"] >= cell["baseline_score"]


def test_whatif_rejects_non_insurer_tier(client: TestClient) -> None:
    state = get_app_state()
    # Any tier outside {b2b2c, research, internal} must be rejected. The seed
    # ships with b2b fleets (Grab, Lazada, Winmart) which is the canonical
    # example of a non-insurer tenant.
    blocked_key = next(
        (
            k
            for k, org_id in state.seed.api_keys.items()
            if state.seed.orgs[org_id].tier not in {"b2b2c", "research", "internal"}
        ),
        None,
    )
    assert blocked_key is not None, "fixture must include a non-insurer API key"
    resp = client.post(
        "/v1/whatif",
        headers={"X-API-Key": blocked_key},
        json={"hex_ids": ["hex_unknown"], "rainfall_mm_h": 30.0, "horizon_h": 3},
    )
    assert resp.status_code == 403
