"""Route tests with an in-memory fake graph — no Neo4j needed."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.graph import Graph
from app.main import app, get_graph


class FakeGraph(Graph):
    async def orgs_for_topic(self, topic: str) -> list[dict]:
        return [{"org": "Health-ISAC", "sector": "Coordination Layer", "topic": "AI",
                 "confidence": 0.9, "source_url": "https://health-isac.org", "evidence": "..."}]

    async def topics_for_org(self, org: str) -> list[dict]:
        return [{"topic": "AI", "confidence": 0.9, "source_url": "x", "evidence": "..."}]

    async def topics(self) -> list[str]:
        return ["AI", "Supply chain resilience"]


app.dependency_overrides[get_graph] = lambda: FakeGraph()
client = TestClient(app)


def test_health() -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_topics() -> None:
    assert client.get("/topics").json()["topics"] == ["AI", "Supply chain resilience"]


def test_orgs_for_topic() -> None:
    body = client.get("/topics/AI/orgs").json()
    assert body["topic"] == "AI"
    assert body["results"][0]["org"] == "Health-ISAC"


def test_topics_for_org() -> None:
    body = client.get("/orgs/Health-ISAC/topics").json()
    assert body["results"][0]["topic"] == "AI"
