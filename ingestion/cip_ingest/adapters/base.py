"""LLM provider seam.

The extractor depends only on `LLMAdapter`. Swapping providers (Claude →
OpenAI/Azure) is an env-var change (LLM_PROVIDER), never a code change in the
pipeline. This is the boundary that keeps the PoC portable to whatever the client
mandates in production.
"""

from __future__ import annotations

import os
import shutil
from abc import ABC, abstractmethod


class LLMAdapter(ABC):
    @abstractmethod
    async def extract_topics(self, *, org_name: str, page_text: str) -> str:
        """Return raw JSON text: a list of {topic, confidence, source_evidence}."""


def get_adapter() -> LLMAdapter:
    """Factory selected by LLM_PROVIDER. Default: anthropic (Claude).

    No-API-key modes:
      - claude_cli → drives the Claude Code CLI using your Claude *subscription*
                     (no key). Auto-used when provider=anthropic but no key is set
                     and `claude` is on PATH. Host-only (needs your CLI login).
      - mock       → deterministic canned extraction, fully offline, zero cost.
      - manual     → writes each prompt to a timestamped file to paste into Claude
                     Desktop, and reads your pasted-back JSON. Human-in-the-loop.
    """
    provider = os.getenv("LLM_PROVIDER", "anthropic").lower()
    if provider == "anthropic":
        if os.getenv("ANTHROPIC_API_KEY", "").strip():
            from .anthropic_adapter import AnthropicAdapter

            return AnthropicAdapter()
        # No key → fall back to the Claude Code CLI (subscription) if available.
        if shutil.which("claude"):
            print("ℹ️  No ANTHROPIC_API_KEY — using the Claude Code CLI (your Claude subscription).")
            from .claude_cli_adapter import ClaudeCliAdapter

            return ClaudeCliAdapter()
        raise ValueError(
            "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set and the `claude` "
            "CLI isn't on PATH. Set the key, install Claude Code (subscription), or "
            "use LLM_PROVIDER=mock | manual."
        )
    if provider in ("claude_cli", "claude-cli", "claude_code"):
        from .claude_cli_adapter import ClaudeCliAdapter

        return ClaudeCliAdapter()
    if provider in ("openai", "azure_openai"):
        from .openai_adapter import OpenAIAdapter

        return OpenAIAdapter(azure=provider == "azure_openai")
    if provider == "mock":
        from .mock_adapter import MockAdapter

        return MockAdapter()
    if provider in ("manual", "claude_desktop"):
        from .manual_adapter import ManualAdapter

        return ManualAdapter()
    raise ValueError(
        f"Unknown LLM_PROVIDER: {provider!r} "
        "(expected: anthropic | claude_cli | openai | azure_openai | mock | manual)"
    )
