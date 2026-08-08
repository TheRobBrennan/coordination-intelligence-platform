"""CLI orchestrator for the ingestion pipeline.

Wires seed/organizations.json -> scraper -> extractor -> loader end to end.
One org failing must not abort the run — needs_validation orgs are expected
to fail (missing/unconfirmed URL) until validated; log, count, continue.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from neo4j import AsyncGraphDatabase

from . import preflight
from .adapters import get_adapter
from .extractor import extract_topics
from .loader import load
from .models import ExtractionResult, Organization
from .scraper import fetch_html

_DEFAULT_SEED = Path(__file__).resolve().parent.parent / "seed" / "organizations.json"


def _load_seed(path: Path) -> list[Organization]:
    data = json.loads(path.read_text())
    return [Organization(**row) for row in data["organizations"]]


async def _ingest_one(adapter, org: Organization, *, dry_run: bool) -> ExtractionResult | None:
    if not org.url:
        print(f"  ⏭️  {org.name} — no URL, skipping (needs_validation={org.needs_validation})")
        return None
    html = await fetch_html(org.url)
    topics = await extract_topics(adapter, org_name=org.name, source_url=org.url, html=html)
    result = ExtractionResult(
        organization=org,
        topics=topics,
        scraped_at=datetime.now(timezone.utc).isoformat(),
    )
    if dry_run:
        print(f"  🧪 {org.name} — {len(topics)} topic(s) (dry run, nothing written)")
        for t in topics:
            print(f"      • {t.topic} ({t.confidence:.2f}) — {t.source_evidence[:80]!r}")
    return result


async def run(*, seed_path: Path, limit: int | None, only: str | None, dry_run: bool) -> int:
    if not preflight.check():
        return 1

    orgs = _load_seed(seed_path)
    if only:
        orgs = [o for o in orgs if o.name.lower() == only.lower()]
        if not orgs:
            print(f"❌ No org named {only!r} in {seed_path}")
            return 1
    if limit is not None:
        orgs = orgs[:limit]

    adapter = get_adapter()
    driver = None
    if not dry_run:
        driver = AsyncGraphDatabase.driver(
            os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "devpassword")),
        )

    processed = loaded = failed = 0
    try:
        for org in orgs:
            print(f"→ {org.name} ({org.sector})")
            try:
                result = await _ingest_one(adapter, org, dry_run=dry_run)
            except Exception as exc:
                failed += 1
                flag = " [needs_validation]" if org.needs_validation else ""
                print(f"  ❌ {org.name}{flag} — {type(exc).__name__}: {exc}")
                continue
            processed += 1
            if result is None:
                continue
            if not dry_run:
                await load(driver, result, database=os.getenv("NEO4J_DATABASE", "neo4j"))
                loaded += 1
                print(f"  ✅ {org.name} — {len(result.topics)} topic(s) loaded")
    finally:
        if driver is not None:
            await driver.close()

    print(f"\nDone. processed={processed} loaded={loaded} failed={failed} of {len(orgs)} org(s)")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest orgs from the seed list into Neo4j.")
    parser.add_argument("--seed", type=Path, default=_DEFAULT_SEED, help="Seed file path.")
    parser.add_argument("--limit", type=int, default=None, help="Process at most N orgs.")
    parser.add_argument("--only", type=str, default=None, help="Process a single named org.")
    parser.add_argument("--dry-run", action="store_true", help="Scrape+extract, write nothing to Neo4j.")
    args = parser.parse_args()
    exit_code = asyncio.run(
        run(seed_path=args.seed, limit=args.limit, only=args.only, dry_run=args.dry_run)
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
