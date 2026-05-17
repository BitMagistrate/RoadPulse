"""Tests for ``/v1/geocode`` and ``/v1/reverse-geocode`` (M4)."""

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


def test_geocode_matches_vietnamese_substring(client: TestClient) -> None:
    resp = client.get("/v1/geocode", params={"q": "bến thành", "locale": "vi"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["locale"] == "vi"
    assert body["results"]
    names = {item["name"] for item in body["results"]}
    assert any("Bến Thành" in n for n in names)


def test_geocode_matches_english_substring(client: TestClient) -> None:
    resp = client.get("/v1/geocode", params={"q": "airport", "locale": "en"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["results"]
    assert any("Airport" in item["name"] for item in body["results"])


def test_reverse_geocode_returns_nearest_poi(client: TestClient) -> None:
    resp = client.get(
        "/v1/reverse-geocode",
        params={"lat": 10.772, "lng": 106.698, "locale": "vi"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["nearest"] is not None
    assert body["nearest"]["distance_m"] is not None
    assert body["district"]
