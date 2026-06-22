"""Claude Code CLI adapter — uses your Claude **subscription**, no API key.

Selected with LLM_PROVIDER=claude_cli, and also the automatic fallback when
LLM_PROVIDER=anthropic but no ANTHROPIC_API_KEY is set and the `claude` binary is
on PATH. It shells out to the Claude Code CLI in print mode:

    claude -p "<user prompt>" --append-system-prompt "<system>" \
           --output-format json --model <model>

Because it relies on the host's `claude` login (subscription credentials in the
macOS keychain / ~/.claude), this runs **natively on your machine** — not inside
the Docker ingest container, which has neither the binary nor your credentials.

Every call writes a timestamped reference doc to CLI_LOG_DIR (default ./cli-runs)
named `<org>-YYYYMMDD-HHMM-<TZ>.md` — the time is **local**, and `<TZ>` is the
local timezone abbreviation (e.g. `PDT` in summer, `PST` in winter), so the
filename is unambiguous. Captures the exact command, prompt, and raw response —
so you can see what happened behind the scenes.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
from datetime import datetime
from pathlib import Path

from ..prompts import EXTRACTION_SYSTEM, build_user_prompt
from .manual_adapter import _slug


class ClaudeCliError(RuntimeError):
    pass


def _strip_fences(text: str) -> str:
    """Remove a ```json … ``` (or ``` … ```) wrapper if Claude added one."""
    s = text.strip()
    m = re.match(r"^```(?:json)?\s*(.*?)\s*```$", s, re.DOTALL)
    return m.group(1).strip() if m else s


class ClaudeCliAdapter:
    def __init__(self) -> None:
        self._bin = shutil.which("claude")
        if not self._bin:
            raise ClaudeCliError(
                "`claude` CLI not found on PATH. Install Claude Code and run `claude` "
                "once to log in, set ANTHROPIC_API_KEY, or use LLM_PROVIDER=mock|manual."
            )
        self._model = os.getenv("LLM_MODEL", "claude-sonnet-4-6")
        self._log_dir = Path(os.getenv("CLI_LOG_DIR", "cli-runs"))
        self._log_dir.mkdir(parents=True, exist_ok=True)

    async def extract_topics(self, *, org_name: str, page_text: str) -> str:
        user_prompt = build_user_prompt(org_name, page_text)
        cmd = [
            self._bin, "-p", user_prompt,
            "--append-system-prompt", EXTRACTION_SYSTEM,
            "--output-format", "json",
            "--model", self._model,
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        out, err = await proc.communicate()
        stdout, stderr = out.decode("utf-8", "replace"), err.decode("utf-8", "replace")
        result = self._extract_text(stdout) if proc.returncode == 0 else ""

        self._log(org_name, cmd, user_prompt, stdout, stderr, result)

        if proc.returncode != 0:
            raise ClaudeCliError(f"claude CLI failed (exit {proc.returncode}): {stderr[:500]}")
        return result

    @staticmethod
    def _extract_text(stdout: str) -> str:
        """Pull the model's text out of the CLI's --output-format json envelope,
        then strip any markdown code fence."""
        s = stdout.strip()
        try:
            obj = json.loads(s)
            if isinstance(obj, dict) and isinstance(obj.get("result"), str):
                s = obj["result"]
        except json.JSONDecodeError:
            pass  # not the JSON envelope — treat stdout as the text itself
        return _strip_fences(s)

    def _log(self, org_name, cmd, user_prompt, stdout, stderr, result) -> Path:
        now = datetime.now().astimezone()  # local time, with tz abbrev for %Z
        path = self._log_dir / f"{_slug(org_name)}-{now:%Y%m%d-%H%M-%Z}.md"
        # Redact the prompt arg in the logged command (it's shown in full below).
        shown_cmd = " ".join("<prompt>" if a is user_prompt else a for a in cmd)
        path.write_text(
            f"""# Claude CLI extraction — {org_name}

_Run {now.strftime("%A, %B %d, %Y %-I:%M %p %Z")} (local time) · model `{self._model}` · via Claude subscription_

## Command
```
{shown_cmd}
```

## Prompt sent
{user_prompt}

## Raw CLI output (stdout)
```json
{stdout.strip() or "(empty)"}
```

## Parsed result (handed to the extractor)
```json
{result or "(empty)"}
```
""" + (f"\n## stderr\n```\n{stderr.strip()}\n```\n" if stderr.strip() else ""),
            encoding="utf-8",
        )
        return path
