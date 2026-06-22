"""Offline tests for the LLM preflight — no network, no real key, no `claude`."""

from __future__ import annotations

from cip_ingest import preflight


def _no_claude(monkeypatch):
    monkeypatch.setattr(preflight.shutil, "which", lambda _: None)


def _has_claude(monkeypatch):
    monkeypatch.setattr(preflight.shutil, "which", lambda _: "/usr/local/bin/claude")


def test_mock_mode_ok(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    assert preflight.check() is True


def test_manual_mode_ok(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "manual")
    assert preflight.check() is True


def test_claude_cli_ok_when_installed(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "claude_cli")
    _has_claude(monkeypatch)
    assert preflight.check() is True


def test_claude_cli_fails_when_missing(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "claude_cli")
    _no_claude(monkeypatch)
    assert preflight.check() is False


def test_anthropic_valid_key(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-xxxxxxxx")
    assert preflight.check(validate=False) is True


def test_anthropic_no_key_no_cli_fails(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    _no_claude(monkeypatch)
    assert preflight.check() is False


def test_anthropic_no_key_falls_back_to_cli(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    _has_claude(monkeypatch)
    assert preflight.check() is True  # subscription path
