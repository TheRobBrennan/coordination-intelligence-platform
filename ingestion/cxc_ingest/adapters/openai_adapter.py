"""Swappable OpenAI / Azure OpenAI adapter (PRD §10.1 names this as an option).

Selected via LLM_PROVIDER=openai or LLM_PROVIDER=azure_openai. Requires the
optional `openai` dependency: `uv sync --extra openai`.
"""

from __future__ import annotations

import os

from ..prompts import EXTRACTION_SYSTEM, build_user_prompt
from .base import LLMAdapter


class OpenAIAdapter(LLMAdapter):
    def __init__(self, *, azure: bool = False) -> None:
        if azure:
            from openai import AsyncAzureOpenAI

            self._client = AsyncAzureOpenAI(
                azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
                api_key=os.environ["AZURE_OPENAI_API_KEY"],
                api_version="2024-08-01-preview",
            )
            self._model = os.environ["AZURE_OPENAI_DEPLOYMENT"]
        else:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
            self._model = os.getenv("LLM_MODEL", "gpt-4o")

    async def extract_topics(self, *, org_name: str, page_text: str) -> str:
        resp = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM},
                {"role": "user", "content": build_user_prompt(org_name, page_text)},
            ],
            response_format={"type": "json_object"},
        )
        return resp.choices[0].message.content or "[]"
