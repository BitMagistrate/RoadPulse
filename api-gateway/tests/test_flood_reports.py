"""Tests for the crowdsourced ``/v1/flood-reports`` endpoint (M3)."""

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


def test_flood_report_accepted_and_boosts_hex(client: TestClient) -> None:
    payload = {
        "location": {"lat": 10.774, "lng": 106.700},
        "severity": "knee",
        "note": "deep puddle near intersection",
        "device_hash": "device-abc-001-xyz",
    }
    resp = client.post("/v1/flood-reports", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["accepted"] is True
    assert body["hex_id"]
    assert body["severity_weight"] == pytest.approx(0.4)
    assert 0.0 < body["crowd_boost"] <= 1.0
    assert resp.headers["x-data-origin"] == "synthetic"


def test_flood_report_dedupes_same_device(client: TestClient) -> None:
    payload = {
        "location": {"lat": 10.770, "lng": 106.700},
        "severity": "puddle",
        "device_hash": "device-rate-limit-zzz",
    }
    first = client.post("/v1/flood-reports", json=payload)
    assert first.status_code == 200
    second = client.post("/v1/flood-reports", json=payload)
    assert second.status_code == 429
