"""Load extraction results into Neo4j.

Schema (PoC v1):
    (:Organization {name, sector, type, url, needs_validation})
    (:Topic {name})
    (:Organization)-[:WORKS_ON {confidence, source_url, source_evidence, scraped_at}]->(:Topic)

People/Initiative/Event nodes are intentionally NOT populated in the PoC, but
this MERGE-based loader is idempotent so re-runs (the "refresh agent") are safe.
"""

from __future__ import annotations

from neo4j import AsyncDriver

from .models import ExtractionResult

_MERGE = """
MERGE (o:Organization {name: $org})
  SET o.sector = $sector, o.type = $type, o.url = $url,
      o.needs_validation = $needs_validation
WITH o
UNWIND $topics AS t
  MERGE (topic:Topic {name: t.topic})
  MERGE (o)-[r:WORKS_ON]->(topic)
    SET r.confidence = t.confidence,
        r.source_url = t.source_url,
        r.source_evidence = t.source_evidence,
        r.scraped_at = $scraped_at
"""


async def load(driver: AsyncDriver, result: ExtractionResult, *, database: str = "neo4j") -> None:
    org = result.organization
    async with driver.session(database=database) as session:
        await session.run(
            _MERGE,
            org=org.name,
            sector=org.sector,
            type=org.type,
            url=org.url,
            needs_validation=org.needs_validation,
            scraped_at=result.scraped_at,
            topics=[m.model_dump() for m in result.topics],
        )
