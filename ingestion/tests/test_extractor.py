"""Offline extractor tests — no network, no API key. A fake adapter stands in
for the LLM so the parse/validate logic is tested deterministically."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from cip_ingest.adapters.base import LLMAdapter
from cip_ingest.extractor import extract_topics, html_to_text

FIXTURE = Path(__file__).parent / "fixtures" / "sample_org.html"


class FakeAdapter(LLMAdapter):
    def __init__(self, payload: object) -> None:
        self._payload = payload
        self.last_page_text: str | None = None

    async def extract_topics(self, *, org_name: str, page_text: str) -> str:
        self.last_page_text = page_text
        return json.dumps(self._payload)


def test_html_to_text_strips_chrome() -> None:
    text = html_to_text(FIXTURE.read_text())
    assert "supply chain resilience" in text
    assert "ignore me" not in text  # script removed
    assert "Home About Contact" not in text  # nav removed


async def test_extract_parses_and_validates() -> None:
    adapter = FakeAdapter(
        [
            {"topic": " AI ", "confidence": 0.9, "source_evidence": "AI-driven anomaly detection"},
            {"topic": "Supply chain resilience", "confidence": 0.8, "source_evidence": "supply chain resilience"},
        ]
    )
    mentions = await extract_topics(
        adapter, org_name="Example Organization", source_url="https://example.org", html=FIXTURE.read_text()
    )
    assert [m.topic for m in mentions] == ["AI", "Supply chain resilience"]
    assert all(0.0 <= m.confidence <= 1.0 for m in mentions)
    assert all(m.source_url == "https://example.org" for m in mentions)


async def test_extract_accepts_topics_envelope() -> None:
    adapter = FakeAdapter({"topics": [{"topic": "Drones", "confidence": 0.5, "source_evidence": "x"}]})
    mentions = await extract_topics(
        adapter, org_name="Example Organization", source_url="https://example.org", html="<p>hi</p>"
    )
    assert mentions[0].topic == "Drones"


async def test_invalid_confidence_rejected() -> None:
    adapter = FakeAdapter([{"topic": "X", "confidence": 1.5, "source_evidence": "x"}])
    with pytest.raises(Exception):
        await extract_topics(adapter, org_name="A", source_url="https://a.example", html="<p>x</p>")
