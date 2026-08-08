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
    async def admin_stats(self) -> dict: ...
    async def full_graph(self) -> list[dict]: ...
    async def loaded_org_names(self) -> list[str]: ...
    async def wipe_coordination_graph(self) -> None: ...
    async def load_org(self, org: dict, topics: list[dict]) -> None: ...


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

    async def admin_stats(self) -> dict:
        orgs = await self._run("MATCH (o:Organization) RETURN count(o) AS n")
        topics = await self._run("MATCH (t:Topic) RETURN count(t) AS n")
        rels = await self._run(
            "MATCH ()-[r:WORKS_ON]->() RETURN count(r) AS n, max(r.scraped_at) AS last_ingested"
        )
        return {
            "orgs": orgs[0]["n"],
            "topics": topics[0]["n"],
            "relationships": rels[0]["n"],
            "last_ingested": rels[0]["last_ingested"],
        }

    async def full_graph(self) -> list[dict]:
        return await self._run(
            """
            MATCH (o:Organization)-[r:WORKS_ON]->(t:Topic)
            RETURN o.name AS org, o.sector AS sector, t.name AS topic,
                   r.confidence AS confidence
            ORDER BY t.name, r.confidence DESC
            """
        )

    async def loaded_org_names(self) -> list[str]:
        rows = await self._run("MATCH (o:Organization) RETURN o.name AS name")
        return [r["name"] for r in rows]

    async def wipe_coordination_graph(self) -> None:
        async with self._driver.session(database=self._db) as s:
            await s.run("MATCH (n) WHERE n:Organization OR n:Topic DETACH DELETE n")

    async def load_org(self, org: dict, topics: list[dict]) -> None:
        from datetime import datetime, timezone

        async with self._driver.session(database=self._db) as s:
            await s.run(
                """
                MERGE (o:Organization {name: $org})
                  SET o.sector = $sector, o.type = $type, o.url = $url
                WITH o
                UNWIND $topics AS t
                  MERGE (topic:Topic {name: t.topic})
                  MERGE (o)-[r:WORKS_ON]->(topic)
                    SET r.confidence = t.confidence,
                        r.source_url = t.source_url,
                        r.source_evidence = t.source_evidence,
                        r.scraped_at = $scraped_at
                """,
                org=org["name"],
                sector=org["sector"],
                type=org.get("type"),
                url=org.get("url"),
                topics=topics,
                scraped_at=datetime.now(timezone.utc).isoformat(),
            )
