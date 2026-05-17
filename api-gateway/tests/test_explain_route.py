"""Tests for the XAI ``/v1/explain-route`` endpoint (M7)."""

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


def test_explain_route_returns_weighted_factors(client: TestClient) -> None:
    payload = {
        "origin": {"lat": 10.820, "lng": 106.645},
        "destination": {"lat": 10.754, "lng": 106.733},
        "variant": "safe",
        "mode": "motorbike",
        "locale": "vi",
    }
    resp = client.post("/v1/explain-route", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["variant"] == "safe"
    factor_names = {f["name"] for f in body["factors"]}
    assert factor_names == {"flood", "congestion", "distance", "eco", "tolls"}
    flood_factor = next(f for f in body["factors"] if f["name"] == "flood")
    assert flood_factor["weight"] == pytest.approx(0.5)
    assert flood_factor["description_vi"]
    assert flood_factor["description_en"]
    assert body["summary_vi"]
    assert body["summary_en"]


def test_explain_route_returns_distinct_weights_per_variant(client: TestClient) -> None:
    base = {
        "origin": {"lat": 10.820, "lng": 106.645},
        "destination": {"lat": 10.754, "lng": 106.733},
        "locale": "en",
    }
    fast = client.post("/v1/explain-route", json={**base, "variant": "fast"}).json()
    eco = client.post("/v1/explain-route", json={**base, "variant": "eco"}).json()
    fast_flood = next(f for f in fast["factors"] if f["name"] == "flood")["weight"]
    eco_flood = next(f for f in eco["factors"] if f["name"] == "flood")["weight"]
    assert fast_flood == 0.0
    assert eco_flood == pytest.approx(0.2)
