# ADR-0001 — PoC architecture

Status: accepted (2026-06-22) · Context: 2-week CXC PoC

## Decision
A monorepo with three deployables and a clean read/write split:
- **ingestion/** (Python) — Playwright scrape → LLM extract → Neo4j load. Runs
  **offline/batch**, never in the request path.
- **apps/api** (FastAPI) — read-only API over the graph.
- **apps/web** (Next.js) — search UI + graph viz.

## Rationale / constraints honored
- **Testable** — pytest (api, ingestion, with HTML fixtures), vitest + Playwright (web).
- **Modular & swappable** — LLM provider behind `LLMAdapter` (default Claude,
  OpenAI/Azure swappable by env); auth behind a single seam (Keycloak for the
  PoC, replaceable for prod).
- **Env-driven** — all endpoints/keys/providers in `.env`; nothing hardcoded.
- **Portable** — Neo4j local↔AuraDB is a connection string; web→Vercel; the
  read API has no browser dependency so it deploys to any serverless host.

## Key choices
| Area | Choice | Why |
|---|---|---|
| Hosting | Hybrid: local Docker + deploy to Vercel/AuraDB | Shareable URL for stakeholders; heavy work stays local |
| Auth | Keycloak (Docker), behind a seam | Rob wants real per-user accounts (rob/kathy/+); swappable later |
| LLM | Pluggable, default Claude | Quality default; hedges if CXC mandates Azure OpenAI |
| Graph | Neo4j | Adjacency/overlap queries are the core use case |

## Out of scope (PoC)
PRD Phases 2–4, People/Initiative/Event population, full 6-agent pipeline,
50–150 orgs. We do ~25 seed orgs, Org+Topic, 2–3 sectors.
