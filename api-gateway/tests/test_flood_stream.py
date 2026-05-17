"""Tests for the SSE ``/v1/flood-stream`` endpoint (M11)."""

from __future__ import annotations

import json

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


def test_flood_stream_emits_event_payload(client: TestClient) -> None:
    # Use a tight interval and bounded event count so the test runs in <1s.
    with client.stream(
        "GET",
        "/v1/flood-stream",
        params={"interval_s": 0.5, "max_events": 1},
    ) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        body = b"".join(resp.iter_bytes())
    text = body.decode("utf-8")
    assert text.startswith("data:")
    payload = json.loads(text.removeprefix("data:").strip())
    assert "ts" in payload
    assert "top" in payload
    assert payload["top"], "expected at least one hex in the top list"
    assert len(payload["top"]) <= 3
    for entry in payload["top"]:
        assert "hex_id" in entry
        assert 0.0 <= entry["score"] <= 1.0
