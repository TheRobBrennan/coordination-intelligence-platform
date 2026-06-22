"""Default LLM adapter — Anthropic Claude."""

from __future__ import annotations

import os

from ..prompts import EXTRACTION_SYSTEM, build_user_prompt
from .base import LLMAdapter


class AnthropicAdapter(LLMAdapter):
    def __init__(self) -> None:
        # Imported lazily so the package installs without an API key present.
        from anthropic import AsyncAnthropic

        self._client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self._model = os.getenv("LLM_MODEL", "claude-opus-4-8")

    async def extract_topics(self, *, org_name: str, page_text: str) -> str:
        msg = await self._client.messages.create(
            model=self._model,
            max_tokens=2048,
            system=EXTRACTION_SYSTEM,
            messages=[{"role": "user", "content": build_user_prompt(org_name, page_text)}],
        )
        return "".join(block.text for block in msg.content if block.type == "text")
