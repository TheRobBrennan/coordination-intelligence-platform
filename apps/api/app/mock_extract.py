"""Deterministic keyword-based topic extraction — the API's own copy of the
ingestion pipeline's mock adapter, for the demo "reset & reload" admin action.

Duplicated rather than imported: apps/api and ingestion/ are separate images
with separate dependency sets (no BeautifulSoup here, just a regex tag strip —
good enough for keyword matching), and this endpoint only ever runs against a
handful of pre-cached HTML snapshots, never live scraped pages. Keep the topic
keyword map in sync with ingestion/cip_ingest/adapters/mock_adapter.py if that
one changes.
"""

from __future__ import annotations

import html
import re

_TOPIC_KEYWORDS: dict[str, tuple[str, ...]] = {
    "AI in critical infrastructure": ("ai", "artificial intelligence", "machine learning"),
    "Supply chain resilience": ("supply chain", "logistics", "procurement"),
    "Cybersecurity / threat intelligence sharing": ("cyber", "threat", "security", "ransomware"),
    "Emergency response & continuity": ("emergency", "continuity", "disaster", "resilience"),
    "Drones / counter-UAS security": ("drone", "uas", "counter-uas", "unmanned"),
    "Chemical sector safety & security": ("chemical", "chlorine", "petrochemical", "hazmat"),
    "Telecommunications resilience": ("telecom", "communications", "network", "broadband"),
    "Energy grid security": ("energy", "grid", "power", "utility"),
    "Biosecurity": ("biosecurity", "biological", "pathogen"),
    "Information sharing (ISAC/SCC coordination)": ("isac", "information sharing", "coordinating council"),
}

_TAG_RE = re.compile(r"<script.*?</script>|<style.*?</style>|<[^>]+>", re.DOTALL)


def html_to_text(raw_html: str) -> str:
    return " ".join(html.unescape(_TAG_RE.sub(" ", raw_html)).split())


def _snippet(text: str, hit_start: int, hit_end: int, radius: int = 40) -> str:
    """Word-boundary-safe excerpt — mirrors ingestion/.../mock_adapter.py's _snippet."""
    start = max(0, hit_start - radius)
    end = min(len(text), hit_end + radius)
    if start > 0:
        next_space = text.find(" ", start)
        if 0 <= next_space < hit_start:
            start = next_space + 1
    if end < len(text):
        last_space = text.rfind(" ", hit_end, end)
        if last_space > hit_end:
            end = last_space
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return f"{prefix}{text[start:end].strip()}{suffix}"


def extract_topics(page_text: str) -> list[dict]:
    text = page_text.lower()
    mentions = []
    for topic, keywords in _TOPIC_KEYWORDS.items():
        hit = next((k for k in keywords if k in text), None)
        if hit:
            idx = text.find(hit)
            snippet = _snippet(page_text, idx, idx + len(hit))
            mentions.append(
                {
                    "topic": topic,
                    "confidence": round(min(0.95, 0.6 + 0.03 * len(hit)), 2),
                    "source_evidence": snippet or hit,
                }
            )
    return mentions
