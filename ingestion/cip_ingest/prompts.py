"""Extraction prompt — shared across all LLM adapters so provider swaps don't
drift behavior. Captures what orgs *say about themselves* (PRD §9.3)."""

EXTRACTION_SYSTEM = """You extract critical-infrastructure coordination topics from an \
organization's own web copy. Capture only what the organization explicitly says it works on — \
never infer or embellish. Return STRICT JSON: a list of objects with keys \
"topic" (short normalized label), "confidence" (0.0-1.0), and "source_evidence" \
(a verbatim snippet, <=200 chars, from the supplied text). If nothing relevant, return []."""


def build_user_prompt(org_name: str, page_text: str) -> str:
    return (
        f"Organization: {org_name}\n\n"
        f"Page text:\n\"\"\"\n{page_text[:12000]}\n\"\"\"\n\n"
        "Extract the coordination topics as JSON."
    )
