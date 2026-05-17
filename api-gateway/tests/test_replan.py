"""Tests for the ``/v1/replan`` endpoint (M6)."""

from __future__ import annotations

import pytest
from app.main import app
from app.state import reset_app_state
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client() -> TestClient:
    reset_app_state()
    with TestClient(app) as tc:
        yield tc
    reset_app_state()


def test_replan_returns_three_updated_variants(client: TestClient) -> None:
    payload = {
        "ride_id": "ride_demo_001",
        "origin": {"lat": 10.820, "lng": 106.645},
        "current_position": {"lat": 10.785, "lng": 106.690},
        "destination": {"lat": 10.754, "lng": 106.733},
        "current_variant": "fast",
        "current_flood_score": 0.55,
        "mode": "motorbike",
        "locale": "vi",
    }
    resp = client.post("/v1/replan", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ride_id"] == "ride_demo_001"
    assert {v["name"] for v in body["variants"]} == {"fast", "safe", "eco"}
    for variant in body["variants"]:
        assert variant["distance_m"] > 0
        assert variant["duration_s"] > 0
        assert variant["geometry"]
    assert isinstance(body["should_reroute"], bool)


def test_replan_rejects_same_position_as_destination(client: TestClient) -> None:
    payload = {
        "ride_id": "ride_invalid",
        "origin": {"lat": 10.820, "lng": 106.645},
        "current_position": {"lat": 10.754, "lng": 106.733},
        "destination": {"lat": 10.754, "lng": 106.733},
        "current_variant": "safe",
        "current_flood_score": 0.1,
    }
    resp = client.post("/v1/replan", json=payload)
    assert resp.status_code == 400
