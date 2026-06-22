"""LLM provider seam.

The extractor depends only on `LLMAdapter`. Swapping providers (Claude →
OpenAI/Azure) is an env-var change (LLM_PROVIDER), never a code change in the
pipeline. This is the boundary that keeps the PoC portable to whatever CXC
mandates in production.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod


class LLMAdapter(ABC):
    @abstractmethod
    async def extract_topics(self, *, org_name: str, page_text: str) -> str:
        """Return raw JSON text: a list of {topic, confidence, source_evidence}."""


def get_adapter() -> LLMAdapter:
    """Factory selected by LLM_PROVIDER. Default: anthropic (Claude)."""
    provider = os.getenv("LLM_PROVIDER", "anthropic").lower()
    if provider == "anthropic":
        from .anthropic_adapter import AnthropicAdapter

        return AnthropicAdapter()
    if provider in ("openai", "azure_openai"):
        from .openai_adapter import OpenAIAdapter

        return OpenAIAdapter(azure=provider == "azure_openai")
    raise ValueError(f"Unknown LLM_PROVIDER: {provider!r}")
