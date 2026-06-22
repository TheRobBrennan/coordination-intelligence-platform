"""Preflight check for the LLM provider/mode — run before any ingest.

Reports the active LLM_PROVIDER and whether it's usable:

  - mock / manual  → no API key needed; always good to go.
  - anthropic / openai / azure_openai → needs the provider's key. If it's
    missing, this prints how to fix it (set the key, OR switch to a no-key mode)
    and exits non-zero. It does NOT call the network unless --validate is passed.

    python -m cip_ingest.preflight              # offline check
    python -m cip_ingest.preflight --validate   # also pings the provider (cheap)
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys

# provider -> (env var holding the key, expected prefix or None)
_KEYED = {
    "anthropic": ("ANTHROPIC_API_KEY", "sk-ant-"),
    "openai": ("OPENAI_API_KEY", "sk-"),
    "azure_openai": ("AZURE_OPENAI_API_KEY", None),
}
_NO_KEY = {"mock", "manual", "claude_desktop"}
_CLI = {"claude_cli", "claude-cli", "claude_code"}


def check(*, validate: bool = False) -> bool:
    provider = os.getenv("LLM_PROVIDER", "anthropic").lower()

    if provider in _NO_KEY:
        how = "deterministic offline extraction" if provider == "mock" else "paste-into-Claude-Desktop flow"
        print(f"✅ LLM mode '{provider}' — no API key needed ({how}).")
        return True

    if provider in _CLI:
        if shutil.which("claude"):
            print("✅ LLM mode 'claude_cli' — using the Claude Code CLI (subscription, no API key).")
            return True
        print("❌ LLM_PROVIDER=claude_cli but the `claude` CLI isn't on PATH.\n"
              "   Install Claude Code and run `claude` once to log in (runs on the host,"
              " not in the Docker container).")
        return False

    if provider not in _KEYED:
        print(f"❌ Unknown LLM_PROVIDER={provider!r} (use: anthropic|claude_cli|openai|azure_openai|mock|manual)")
        return False

    env_var, prefix = _KEYED[provider]
    key = os.getenv(env_var, "").strip()
    if not key or (prefix and not key.startswith(prefix)):
        # For anthropic specifically, a Claude Code login is a valid no-key path.
        if provider == "anthropic" and not key and shutil.which("claude"):
            print("✅ No ANTHROPIC_API_KEY, but the Claude Code CLI is available — "
                  "ingest will use your Claude subscription.")
            return True
        problem = "is not set" if not key else f"doesn't look like a {provider} key (want prefix {prefix!r})"
        print(
            f"❌ {env_var} {problem}.\n"
            f"   Fix it one of these ways:\n"
            f"     • set {env_var} in .env,\n"
            f"     • LLM_PROVIDER=claude_cli to use the Claude Code CLI (subscription, host only), or\n"
            f"     • LLM_PROVIDER=mock (offline) / LLM_PROVIDER=manual (paste into Claude Desktop)."
        )
        return False

    if validate and provider == "anthropic":
        try:
            from anthropic import Anthropic

            Anthropic(api_key=key).models.list(limit=1)  # cheap auth probe, no tokens
        except Exception as exc:
            print(
                f"❌ {provider} key rejected: {type(exc).__name__}: {exc}\n"
                f"   Re-check {env_var}, or use LLM_PROVIDER=mock | manual to run without a key."
            )
            return False

    print(f"✅ LLM key OK ({provider}, {env_var}).")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Check the LLM provider/mode before ingest.")
    parser.add_argument("--validate", action="store_true", help="also ping the provider")
    args = parser.parse_args()
    sys.exit(0 if check(validate=args.validate) else 1)


if __name__ == "__main__":
    main()
