"""Manual / Claude Desktop adapter — human-in-the-loop, no API key.

Selected with LLM_PROVIDER=manual (alias: claude_desktop). Claude Desktop has no
automation API, so this is a paste-driven flow:

  1. First pass: for each org, this writes a timestamped Markdown prompt file
     under MANUAL_DIR/<run-stamp>/<org>.prompt.md and raises ManualResponsePending.
     A driver (run.py) catches that, keeps going so ALL prompts get written, then
     stops and tells you the run folder.
  2. You open each .prompt.md, paste it into Claude Desktop (uses your Claude
     subscription — no API key, no token spend), and save the JSON reply next to
     it as <org>.response.json.
  3. Re-run with the same MANUAL_RUN stamp: this finds the response files and
     returns them, so the pipeline loads the graph.

Set MANUAL_RUN to reuse a run folder across passes; otherwise a new timestamp is
created per process and printed.
"""

from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path

from ..prompts import EXTRACTION_SYSTEM, build_user_prompt


class ManualResponsePending(Exception):
    """Raised when an org's prompt has been written but no response exists yet."""

    def __init__(self, org_name: str, prompt_path: Path, response_path: Path) -> None:
        self.org_name = org_name
        self.prompt_path = prompt_path
        self.response_path = response_path
        super().__init__(
            f"Awaiting manual response for {org_name!r}. "
            f"Paste {prompt_path} into Claude Desktop, save the JSON to {response_path}."
        )


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "org"


class ManualAdapter:
    def __init__(self) -> None:
        base = Path(os.getenv("MANUAL_DIR", "manual-runs"))
        # Reuse a run folder across passes via MANUAL_RUN; else stamp one now
        # (local time + tz abbrev, e.g. 20260622-1438-PDT).
        stamp = os.getenv("MANUAL_RUN") or datetime.now().astimezone().strftime("%Y%m%d-%H%M-%Z")
        self.run_dir = base / stamp
        self.run_dir.mkdir(parents=True, exist_ok=True)

    async def extract_topics(self, *, org_name: str, page_text: str) -> str:
        slug = _slug(org_name)
        prompt_path = self.run_dir / f"{slug}.prompt.md"
        response_path = self.run_dir / f"{slug}.response.json"

        # If you've already pasted a reply, use it.
        if response_path.exists() and response_path.read_text(encoding="utf-8").strip():
            return response_path.read_text(encoding="utf-8")

        # Otherwise write the prompt to paste into Claude Desktop, and signal pending.
        prompt_path.write_text(self._render(org_name, page_text, response_path), encoding="utf-8")
        raise ManualResponsePending(org_name, prompt_path, response_path)

    def _render(self, org_name: str, page_text: str, response_path: Path) -> str:
        now = datetime.now().astimezone().strftime("%A, %B %d, %Y %-I:%M %p %Z")
        return f"""# Manual extraction — {org_name}

_Generated {now} (local time). Paste everything in the **Prompt** block below into
Claude Desktop. Then save Claude's JSON reply to:_

`{response_path}`

_…and re-run the ingest with `MANUAL_RUN={self.run_dir.name}` to load it._

---

## Prompt

> System instructions:

{EXTRACTION_SYSTEM}

> Message:

{build_user_prompt(org_name, page_text)}

---

## Expected reply

Strict JSON only — a list of objects like:

```json
[
  {{"topic": "Supply chain resilience", "confidence": 0.8, "source_evidence": "…verbatim snippet…"}}
]
```

Paste exactly that JSON into `{response_path.name}` (no prose, no code fences).
"""
