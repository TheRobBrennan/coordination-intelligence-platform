"""Tests for the no-API-key adapters: mock + Claude CLI parsing."""

from __future__ import annotations

import json

from cip_ingest.adapters.claude_cli_adapter import ClaudeCliAdapter, _strip_fences
from cip_ingest.adapters.mock_adapter import MockAdapter


async def test_mock_adapter_extracts_topics() -> None:
    text = "We work on cybersecurity threat intelligence and supply chain resilience for the energy grid."
    raw = await MockAdapter().extract_topics(org_name="Acme", page_text=text)
    data = json.loads(raw)
    topics = {d["topic"] for d in data}
    assert "Cybersecurity / threat intelligence sharing" in topics
    assert "Supply chain resilience" in topics
    assert "Energy grid security" in topics
    assert all(0.0 <= d["confidence"] <= 1.0 for d in data)
    assert all(d["source_evidence"] for d in data)


async def test_mock_adapter_no_match_is_empty_list() -> None:
    raw = await MockAdapter().extract_topics(org_name="Acme", page_text="We sell artisanal cheese.")
    assert json.loads(raw) == []


def test_cli_extract_text_unwraps_json_envelope() -> None:
    inner = '[{"topic": "X", "confidence": 0.5, "source_evidence": "y"}]'
    envelope = json.dumps({"type": "result", "subtype": "success", "result": inner})
    assert ClaudeCliAdapter._extract_text(envelope) == inner


def test_cli_extract_text_strips_code_fence() -> None:
    fenced = '{"type": "result", "result": "```json\\n[]\\n```"}'
    assert ClaudeCliAdapter._extract_text(fenced) == "[]"


def test_strip_fences_plain() -> None:
    assert _strip_fences("```json\n[1,2]\n```") == "[1,2]"
    assert _strip_fences("[1,2]") == "[1,2]"
