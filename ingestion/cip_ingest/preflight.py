"""Preflight check for the LLM API key.

Run before any ingest. If the key for the configured LLM_PROVIDER is missing
(or, with --validate, rejected by the provider), this writes a timestamped,
copy-pasteable Markdown help file (local time, e.g. llm-key-setup-20260622-1413.md)
into the diagnostics folder and exits non-zero — so you get actionable guidance
in a file you can open, not just a stack trace.

    python -m cip_ingest.preflight              # presence + format check (offline)
    python -m cip_ingest.preflight --validate   # also pings the provider (cheap)
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

# provider -> (env var holding the key, expected prefix or None, console URL)
_PROVIDERS = {
    "anthropic": ("ANTHROPIC_API_KEY", "sk-ant-", "https://console.anthropic.com/settings/keys"),
    "openai": ("OPENAI_API_KEY", "sk-", "https://platform.openai.com/api-keys"),
    "azure_openai": ("AZURE_OPENAI_API_KEY", None, "your Azure OpenAI resource → Keys and Endpoint"),
}


def _diagnostics_dir() -> Path:
    d = Path(os.getenv("DIAGNOSTICS_DIR", "diagnostics"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def _write_help(provider: str, env_var: str, console_url: str, problem: str) -> Path:
    now = datetime.now()  # local time
    stamp = now.strftime("%Y%m%d-%H%M")
    path = _diagnostics_dir() / f"llm-key-setup-{stamp}.md"
    model = os.getenv("LLM_MODEL", "claude-sonnet-4-6")
    effort = os.getenv("LLM_EFFORT", "medium")
    path.write_text(
        f"""# LLM API key — action needed

_Generated {now.strftime("%A, %B %d, %Y %-I:%M %p")} (local time)_

**Problem:** {problem}

The ingestion pipeline needs a working **{provider}** key in the `{env_var}`
environment variable. Here's how to fix it, then re-run.

## 1. Get a key
Open **{console_url}** and create an API key. Copy it.

## 2. Put it in `.env` (repo root)
Open `.env` and set the line (create the file from `.env.example` if it's missing):

```dotenv
LLM_PROVIDER={provider}
{env_var}=PASTE_YOUR_KEY_HERE
```

> The default model is **`{model}`** at **{effort}** effort — a cost-conscious
> choice. Change `LLM_MODEL` / `LLM_EFFORT` in `.env` any time.

## 3. Re-run the check
```bash
make check          # or: docker compose --profile ingest run --rm ingest \\
                    #       uv run python -m cip_ingest.preflight --validate
```

When the key is valid you'll see `✅ LLM key OK`. This file is safe to delete.
""",
        encoding="utf-8",
    )
    return path


def check(*, validate: bool = False) -> bool:
    """Return True if the configured provider's key looks usable. On failure,
    write a help file and return False."""
    provider = os.getenv("LLM_PROVIDER", "anthropic").lower()
    if provider not in _PROVIDERS:
        print(f"⚠️  Unknown LLM_PROVIDER={provider!r}; expected one of {list(_PROVIDERS)}")
        return False
    env_var, prefix, console_url = _PROVIDERS[provider]
    key = os.getenv(env_var, "").strip()

    if not key:
        path = _write_help(provider, env_var, console_url, f"`{env_var}` is not set or empty.")
        print(f"❌ No {provider} key found in {env_var}.\n   → Setup guide written to: {path}")
        return False

    if prefix and not key.startswith(prefix):
        path = _write_help(
            provider, env_var, console_url,
            f"`{env_var}` is set but doesn't look like a {provider} key "
            f"(expected it to start with `{prefix}`).",
        )
        print(f"❌ {env_var} doesn't look valid.\n   → Setup guide written to: {path}")
        return False

    if validate and provider == "anthropic":
        try:
            from anthropic import Anthropic

            Anthropic(api_key=key).models.list(limit=1)  # cheap auth probe, no tokens
        except Exception as exc:  # AuthenticationError and friends
            path = _write_help(
                provider, env_var, console_url,
                f"`{env_var}` was rejected by Anthropic: {type(exc).__name__}: {exc}",
            )
            print(f"❌ {provider} key rejected.\n   → Setup guide written to: {path}")
            return False

    print(f"✅ LLM key OK ({provider}, {env_var}).")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Check the LLM API key before ingest.")
    parser.add_argument("--validate", action="store_true", help="also ping the provider")
    args = parser.parse_args()
    sys.exit(0 if check(validate=args.validate) else 1)


if __name__ == "__main__":
    main()
