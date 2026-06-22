"""CXC read API — the only thing the demo UI talks to.

Read-only over the coordination graph. Auth is intentionally NOT enforced here
in the PoC; when Keycloak is wired in, add a verify-JWT dependency at this seam
(see docs/runbook.md) — routes don't change.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .graph import Graph, Neo4jGraph
from .settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.graph = Neo4jGraph(
        settings.neo4j_uri, settings.neo4j_user, settings.neo4j_password, settings.neo4j_database
    )
    yield
    await app.state.graph.close()


app = FastAPI(title="CXC Coordination Intelligence API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def get_graph() -> Graph:  # overridden in tests
    return app.state.graph


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/topics")
async def list_topics(graph: Graph = Depends(get_graph)) -> dict:
    return {"topics": await graph.topics()}


@app.get("/topics/{topic}/orgs")
async def orgs_for_topic(topic: str, graph: Graph = Depends(get_graph)) -> dict:
    return {"topic": topic, "results": await graph.orgs_for_topic(topic)}


@app.get("/orgs/{org}/topics")
async def topics_for_org(org: str, graph: Graph = Depends(get_graph)) -> dict:
    return {"org": org, "results": await graph.topics_for_org(org)}
