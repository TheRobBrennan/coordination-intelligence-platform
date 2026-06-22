# Data Model (PoC v1)

Graph-based, per PRD §10. We populate **Organization** and **Topic** only for
the PoC; People / Initiative / Event are modeled here but deferred.

## Nodes
```
(:Organization { name, sector, type, url, needs_validation })
(:Topic        { name })
```
Deferred (schema reserved, not populated in PoC):
```
(:Person { name, role })
(:Initiative { name, kind })
(:Event { name, date })
```

## Relationships (PoC)
```
(:Organization)-[:WORKS_ON { confidence, source_url, source_evidence, scraped_at }]->(:Topic)
```
Every edge is **explainable**: it carries the verbatim evidence snippet, the
source URL, a confidence score, and a timestamp (PRD §8, §9.4).

## Relationships (deferred — PRD §7.2)
```
(:Organization)-[:COLLABORATES_WITH]->(:Organization)
(:Organization)-[:LEADS]->(:Initiative)
(:Initiative)-[:RELATES_TO]->(:Topic)
(:Person)-[:EXPERT_IN]->(:Topic)
(:Event)-[:ABOUT]->(:Topic)
```

## Core queries the PoC supports (PRD §7.4)
- Topic → Organizations  (`/topics/{t}/orgs`)
- Organization → Topics   (`/orgs/{o}/topics`)
- Topic catalog           (`/topics`)

## Why a graph
Cross-sector overlap and "who else works on X" are adjacency queries — the thing
graphs are built for. Same Bolt driver works against local Neo4j and AuraDB, so
local↔prod is a connection-string swap.
