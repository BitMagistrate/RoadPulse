"""Tests for the route-instruction i18n helpers."""

from __future__ import annotations

from roadpulse_core.types import RouteMode
from roadpulse_routing.engine import (
    RoutingEngine,
    _build_instruction,
    _class_label,
)
from roadpulse_routing.graph import Edge, Graph, Node


def test_build_instruction_vi_uses_vietnamese_template() -> None:
    instr = _build_instruction("Nguyễn Huệ", 850, "primary", locale="vi")
    assert instr.startswith("Đi tiếp")
    assert "Nguyễn Huệ" in instr
    assert "850 m" in instr


def test_build_instruction_en_uses_english_template() -> None:
    instr = _build_instruction("Bến Thành", 1250, "primary", locale="en")
    assert instr.startswith("Continue on ")
    assert "Bến Thành" in instr
    assert "1.2 km" in instr


def test_class_label_falls_back_to_english_for_unknown_locale() -> None:
    assert _class_label("primary", locale="vi") == "đại lộ"
    assert _class_label("primary", locale="en") == "avenue"
    # Unknown locale falls back to English defaults.
    assert _class_label("primary", locale="ru") == "avenue"


def _toy_graph() -> Graph:
    g = Graph()
    g.add_node(Node(id=1, lng=106.70, lat=10.78))
    g.add_node(Node(id=2, lng=106.71, lat=10.78))
    g.add_edge(
        Edge(
            src=1,
            dst=2,
            distance_m=600,
            free_flow_speed_kmh=40,
            road_class="primary",
            tags={"hex_id": "hex_demo", "name": "Lê Lợi"},
        )
    )
    return g


def test_three_candidates_threads_locale_through_to_steps() -> None:
    engine = RoutingEngine(_toy_graph())
    routes_vi = engine.three_candidates(1, 2, mode=RouteMode.MOTORBIKE, locale="vi")
    routes_en = engine.three_candidates(1, 2, mode=RouteMode.MOTORBIKE, locale="en")
    assert routes_vi[0].steps[0].instruction.startswith("Đi tiếp")
    assert routes_en[0].steps[0].instruction.startswith("Continue on ")
