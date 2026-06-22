"""Turn page text into validated TopicMentions via an LLMAdapter.

Pure and deterministic given an adapter — so tests inject a fake adapter and run
fully offline against recorded HTML fixtures (no network, no API key).
"""

from __future__ import annotations

import json

from bs4 import BeautifulSoup

from .adapters.base import LLMAdapter
from .models import TopicMention


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer"]):
        tag.decompose()
    return " ".join(soup.get_text(" ").split())


async def extract_topics(
    adapter: LLMAdapter, *, org_name: str, source_url: str, html: str
) -> list[TopicMention]:
    raw = await adapter.extract_topics(org_name=org_name, page_text=html_to_text(html))
    payload = json.loads(raw)
    # Adapters may return a bare list or {"topics": [...]} — normalize.
    rows = payload.get("topics", payload) if isinstance(payload, dict) else payload
    mentions: list[TopicMention] = []
    for row in rows:
        mentions.append(
            TopicMention(
                topic=row["topic"].strip(),
                confidence=float(row["confidence"]),
                source_url=source_url,
                source_evidence=row["source_evidence"].strip(),
            )
        )
    return mentions
