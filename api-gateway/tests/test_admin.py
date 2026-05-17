"""Tests for the ``/v1/admin/kanon-violations`` endpoint (M10)."""

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
        if org and org.tier == "internal":
            return key
    raise RuntimeError("no internal-tier API key in seed data")


def test_kanon_violations_visible_to_internal_tier(client: TestClient) -> None:
    api_key = _internal_key()
    resp = client.get("/v1/admin/kanon-violations", headers={"X-API-Key": api_key})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["min_k"] == 50
    assert body["window_s"] > 0
    assert body["violations"], "expected seeded violations to be visible"
    sample = body["violations"][0]
    assert sample["source"]
    assert sample["bucket"]
    assert sample["attempted_k"] < sample["min_k"]


def test_kanon_violations_forbidden_to_non_internal_tier(client: TestClient) -> None:
    state = get_app_state()
    blocked_key = next(
        (
            k
            for k, org_id in state.seed.api_keys.items()
            if state.seed.orgs[org_id].tier != "internal"
        ),
        None,
    )
    assert blocked_key is not None
    resp = client.get("/v1/admin/kanon-violations", headers={"X-API-Key": blocked_key})
    assert resp.status_code == 403
