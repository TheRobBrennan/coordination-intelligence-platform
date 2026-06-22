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
        # Cost-conscious default: Sonnet 4.6 at medium effort. Override via env.
        self._model = os.getenv("LLM_MODEL", "claude-sonnet-4-6")
        self._effort = os.getenv("LLM_EFFORT", "medium")

    async def extract_topics(self, *, org_name: str, page_text: str) -> str:
        # effort (GA, no beta header) controls thinking depth + token spend:
        # low | medium | high | max. Thinking off keeps extraction cheap.
        msg = await self._client.messages.create(
            model=self._model,
            max_tokens=2048,
            output_config={"effort": self._effort},
            thinking={"type": "disabled"},
            system=EXTRACTION_SYSTEM,
            messages=[{"role": "user", "content": build_user_prompt(org_name, page_text)}],
        )
        return "".join(block.text for block in msg.content if block.type == "text")
