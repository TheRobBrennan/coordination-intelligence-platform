"""Demo-only admin endpoints: live stats, seed-list load status, and a fast
local reset-and-reload action.

"Reset" re-ingests a small starter set from HTML snapshots cached on disk
(ingestion/seed/fixtures/), not a live internet scrape — this is the UI's
"pipeline visibility" trigger, and it has to be fast and reliable at a table
with unpredictable wifi. It performs a real Neo4j write against real graph
data; only the page-fetch step is replayed from a cached snapshot instead of
hitting the internet fresh. See mock_extract.py for why extraction is a
duplicated keyword matcher rather than importing the ingestion package.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from .graph import Graph
from .mock_extract import extract_topics, html_to_text

router = APIRouter(prefix="/admin", tags=["admin"])

_SEED_DIR = Path(os.getenv("SEED_DIR", "/app-seed"))


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _fixture_path(name: str) -> Path:
    return _SEED_DIR / "fixtures" / f"{_slug(name)}.html"

# Cached-HTML starter set for the "reset & reload" demo action — deliberately
# small and internet-independent. Keep in sync with the fixture files.
_STARTER_SET = [
    {"slug": "lumen-technologies", "name": "Lumen Technologies", "url": "https://www.lumen.com", "sector": "Communications", "type": "operator"},
    {"slug": "verizon", "name": "Verizon", "url": "https://www.verizon.com", "sector": "Communications", "type": "operator"},
    {"slug": "nextera-energy", "name": "NextEra Energy", "url": "https://www.nexteraenergy.com", "sector": "Energy", "type": "operator"},
    {"slug": "zscaler", "name": "Zscaler", "url": "https://www.zscaler.com", "sector": "Cybersecurity", "type": "vendor"},
    {"slug": "deloitte", "name": "Deloitte", "url": "https://www.deloitte.com", "sector": "Risk / Consulting", "type": "consultancy"},
    {"slug": "health-isac", "name": "Health-ISAC", "url": "https://health-isac.org", "sector": "Coordination Layer", "type": "isac"},
]


def _graph(request: Request) -> Graph:
    return request.app.state.graph


def _load_seed_orgs() -> list[dict]:
    return json.loads((_SEED_DIR / "organizations.json").read_text())["organizations"]


def _load_fetch_errors() -> dict[str, str]:
    path = _SEED_DIR / "fetch-log.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text()).get("errors", {})


def _issue(org: dict, *, cached: bool, fetch_errors: dict[str, str]) -> str | None:
    """A real, currently-known reason this org isn't ready to demo — sourced
    from an actual ingestion attempt, not a static seed-authored note."""
    if error := fetch_errors.get(org["name"]):
        return error
    if not org.get("url"):
        return "No URL on file — can't be scraped until one is confirmed"
    if not cached:
        return "URL on file, but never fetched yet"
    return None


@router.get("/stats")
async def stats(request: Request) -> dict:
    return await _graph(request).admin_stats()


@router.get("/seed")
async def seed_status(request: Request) -> dict:
    graph = _graph(request)
    seed_orgs = _load_seed_orgs()
    loaded = {n.lower() for n in await graph.loaded_org_names()}
    fetch_errors = _load_fetch_errors()
    orgs = []
    for o in seed_orgs:
        cached = _fixture_path(o["name"]).exists()
        orgs.append(
            {
                **o,
                "loaded": o["name"].lower() in loaded,
                "cached": cached,
                "issue": _issue(o, cached=cached, fetch_errors=fetch_errors),
            }
        )
    return {"organizations": orgs, "loaded_count": len(loaded), "total_count": len(seed_orgs)}


@router.get("/seed.json")
async def seed_raw() -> FileResponse:
    """The actual seed file, unannotated — for the "Seed list" pipeline-stage
    link to open in a new tab, not the /admin/seed status view above."""
    return FileResponse(_SEED_DIR / "organizations.json", media_type="application/json")


@router.post("/reset")
async def reset(request: Request) -> dict:
    graph = _graph(request)
    await graph.wipe_coordination_graph()
    loaded = []
    for org in _STARTER_SET:
        html_path = _SEED_DIR / "fixtures" / f"{org['slug']}.html"
        if not html_path.exists():
            continue
        topics = extract_topics(html_to_text(html_path.read_text()))
        await graph.load_org(org, topics)
        loaded.append({"name": org["name"], "sector": org["sector"], "topics": len(topics)})
    return {"reset": True, "loaded": loaded, "stats": await graph.admin_stats()}


@router.post("/clean")
async def clean(request: Request) -> dict:
    """Wipe the graph to empty — no reload."""
    graph = _graph(request)
    await graph.wipe_coordination_graph()
    return {"cleaned": True, "stats": await graph.admin_stats()}


@router.post("/ingest")
async def ingest(request: Request) -> dict:
    """Run the pipeline (cached snapshot -> extract -> load) for specific orgs,
    or every org with a cached snapshot if none are named. Additive — does not
    wipe first; pair with /admin/clean for a from-scratch run."""
    body = await request.json() if await request.body() else {}
    names = body.get("orgs")

    graph = _graph(request)
    seed_orgs = _load_seed_orgs()
    targets = seed_orgs if not names else [o for o in seed_orgs if o["name"] in names]

    loaded, skipped = [], []
    for org in targets:
        html_path = _fixture_path(org["name"])
        if not html_path.exists():
            skipped.append(org["name"])
            continue
        topics = extract_topics(html_to_text(html_path.read_text()))
        await graph.load_org(org, topics)
        loaded.append({"name": org["name"], "sector": org["sector"], "topics": len(topics)})

    return {"loaded": loaded, "skipped": skipped, "stats": await graph.admin_stats()}
