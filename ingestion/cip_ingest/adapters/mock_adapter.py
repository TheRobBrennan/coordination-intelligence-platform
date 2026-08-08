"""Mock LLM adapter — deterministic, offline, zero cost.

Selected with LLM_PROVIDER=mock. Instead of calling an LLM, it matches the page
text against a small keyword map and emits well-formed TopicMention JSON. Lets
the whole scrape → extract → load pipeline run end-to-end with no API key — for
development, tests, CI, and demos where you don't want to spend tokens.

The output shape is identical to the real adapters, so swapping back to
`anthropic` later changes nothing downstream.
"""

from __future__ import annotations

import json

# topic label -> keywords that imply it (lowercase substring match)
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


def _snippet(text: str, hit_start: int, hit_end: int, radius: int = 40) -> str:
    """A word-boundary-safe excerpt around a match, so evidence reads as a real
    quote instead of a mid-word fragment ("nd the world…" -> "…around the world…")."""
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


class MockAdapter:
    async def extract_topics(self, *, org_name: str, page_text: str) -> str:
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
                        # Deterministic, bounded — longer/more-specific match = higher.
                        "confidence": round(min(0.95, 0.6 + 0.03 * len(hit)), 2),
                        "source_evidence": snippet or hit,
                    }
                )
        return json.dumps(mentions)
