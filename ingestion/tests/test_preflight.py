"""Offline tests for the LLM key preflight — no network, no real key."""

from __future__ import annotations

from pathlib import Path

from cip_ingest import preflight


def test_missing_key_writes_help(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("DIAGNOSTICS_DIR", str(tmp_path))

    assert preflight.check(validate=False) is False
    helps = list(tmp_path.glob("llm-key-setup-*.md"))
    assert len(helps) == 1
    body = helps[0].read_text()
    assert "ANTHROPIC_API_KEY" in body
    assert "console.anthropic.com" in body


def test_wrong_prefix_writes_help(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "not-a-real-key")
    monkeypatch.setenv("DIAGNOSTICS_DIR", str(tmp_path))

    assert preflight.check(validate=False) is False
    assert list(tmp_path.glob("llm-key-setup-*.md"))


def test_valid_looking_key_passes(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-xxxxxxxxxxxxxxxx")
    monkeypatch.setenv("DIAGNOSTICS_DIR", str(tmp_path))

    # validate=False → no network; presence + prefix only
    assert preflight.check(validate=False) is True
    assert not list(tmp_path.glob("llm-key-setup-*.md"))  # no help file written
