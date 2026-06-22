"""Graph access behind a Protocol so routes are testable without a live Neo4j.

`Neo4jGraph` is the real impl; tests inject an in-memory fake via FastAPI's
dependency override.
"""

from __future__ import annotations

from typing import Protocol

from neo4j import AsyncGraphDatabase


class Graph(Protocol):
    async def orgs_for_topic(self, topic: str) -> list[dict]: ...
    async def topics_for_org(self, org: str) -> list[dict]: ...
    async def topics(self) -> list[str]: ...


class Neo4jGraph:
    def __init__(self, uri: str, user: str, password: str, database: str) -> None:
        self._driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
        self._db = database

    async def close(self) -> None:
        await self._driver.close()

    async def _run(self, cypher: str, **params) -> list[dict]:
        async with self._driver.session(database=self._db) as s:
            res = await s.run(cypher, **params)
            return [r.data() async for r in res]

    async def orgs_for_topic(self, topic: str) -> list[dict]:
        return await self._run(
            """
            MATCH (o:Organization)-[r:WORKS_ON]->(t:Topic)
            WHERE toLower(t.name) CONTAINS toLower($topic)
            RETURN o.name AS org, o.sector AS sector, t.name AS topic,
                   r.confidence AS confidence, r.source_url AS source_url,
                   r.source_evidence AS evidence
            ORDER BY r.confidence DESC
            """,
            topic=topic,
        )

    async def topics_for_org(self, org: str) -> list[dict]:
        return await self._run(
            """
            MATCH (o:Organization)-[r:WORKS_ON]->(t:Topic)
            WHERE toLower(o.name) CONTAINS toLower($org)
            RETURN t.name AS topic, r.confidence AS confidence,
                   r.source_url AS source_url, r.source_evidence AS evidence
            ORDER BY r.confidence DESC
            """,
            org=org,
        )

    async def topics(self) -> list[str]:
        rows = await self._run("MATCH (t:Topic) RETURN t.name AS topic ORDER BY t.name")
        return [r["topic"] for r in rows]
