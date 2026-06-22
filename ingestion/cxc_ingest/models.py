"""Core data shapes for the ingestion pipeline.

Every extracted object carries a confidence score and source evidence so the
graph is explainable (PRD §8 — "explainability / source attribution").
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class Organization(BaseModel):
    name: str
    url: str | None = None
    sector: str
    type: str | None = None
    needs_validation: bool = False
    validation_note: str | None = None


class TopicMention(BaseModel):
    """A topic an organization says it works on, with traceable evidence."""

    topic: str = Field(..., description="Normalized topic label, e.g. 'AI in critical infrastructure'")
    confidence: float = Field(..., ge=0.0, le=1.0)
    source_url: str
    source_evidence: str = Field(..., description="Verbatim text snippet the topic was extracted from")


class ExtractionResult(BaseModel):
    organization: Organization
    topics: list[TopicMention]
    scraped_at: str  # ISO 8601; set by the caller, never guessed in pipeline code
