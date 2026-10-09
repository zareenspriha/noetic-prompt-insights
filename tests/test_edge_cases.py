"""Unit tests for the error and limit paths of the gateway, provider and report code.

Each test pins down a refusal that protects privacy, cost or the shared contract.
"""

import json
import httpx
import pytest
from prompt_insights import providers
from prompt_insights.gateway import fetch_gateway, parse_ndjson, synthetic_events
from prompt_insights.report import GroupTooSmall, parse_week, weekly_report
from prompt_insights.transport import request_structured, require_live

PAYLOAD = json.dumps({"untrusted_prompt": "hello"})


def ndjson(rows):
    return "\n".join(json.dumps(r) for r in rows).encode()


# ---------- gateway import limits ----------


def test_one_oversized_record_is_rejected():
    event = synthetic_events(weeks=1, per_week=1)[0]
    huge = {**event, "prompt_redacted": "x" * 16000, "model": "m" * 128}
    line = json.dumps(huge).encode() + b" " * 60000  # valid JSON, but one line over 64 KB
    with pytest.raises(ValueError, match="record exceeds size limit"):
        parse_ndjson(line)


def test_more_than_1000_distinct_events_are_rejected():
    base = synthetic_events(weeks=1, per_week=1)[0]
    rows = [{**base, "event_id": f"e{i}", "request_id": f"r{i}"} for i in range(1001)]
    with pytest.raises(ValueError, match="record limit exceeded"):
        parse_ndjson(ndjson(rows))


def test_blank_lines_are_skipped():
    events = synthetic_events(weeks=1, per_week=2)
    data = b"\n\n" + ndjson(events) + b"\n   \n"
    assert len(parse_ndjson(data)) == 2


def gateway(handler):
    return httpx.MockTransport(handler)


def test_fetch_stops_reading_an_oversized_response():
    class Huge(httpx.SyncByteStream):
        def __iter__(self):
            yield b"[" + b" " * 2_000_001
            raise AssertionError("kept reading past the size limit")

    with pytest.raises(ValueError, match="Gateway fetch failed"):
        fetch_gateway(
            "http://127.0.0.1:8000",
            token="test-token",
            transport=gateway(lambda r: httpx.Response(200, stream=Huge())),
        )


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, json={"events": []}),  # not an array
        httpx.Response(200, json=[{}] * 1001),  # too many
        httpx.Response(401, json=[]),  # bad token
        httpx.Response(200, content=b"not json"),
    ],
)
def test_fetch_rejects_bad_gateway_responses_without_details(response):
    with pytest.raises(
        ValueError, match="Gateway fetch failed; verify authentication and contract"
    ):
        fetch_gateway(
            "http://127.0.0.1:8000", token="test-token", transport=gateway(lambda r: response)
        )


def test_fetch_requires_a_token(monkeypatch):
    monkeypatch.delenv("GATEWAY_TOKEN", raising=False)
    with pytest.raises(ValueError, match="bearer token"):
        fetch_gateway("http://127.0.0.1:8000")


def test_cli_imports_from_the_gateway_url(tmp_path, monkeypatch):
    import prompt_insights.gateway as gateway_module
    from prompt_insights.__main__ import main

    events = synthetic_events(weeks=1, per_week=3)
    monkeypatch.setattr(gateway_module, "fetch_gateway", lambda url: events)
    out = tmp_path / "summary.json"
    assert main(["import-gateway", "--url", "http://127.0.0.1:8000", "--out", str(out)]) == 0
    summary = json.loads(out.read_text())
    assert summary["events"] == 3 and "prompt_redacted" not in out.read_text()


# ---------- provider transport ----------


def test_unknown_provider_mode_is_refused():
    with pytest.raises(ValueError, match="Unsupported provider mode"):
        require_live("gemini", True)


@pytest.mark.parametrize(
    "content",
    [
        [],  # no answer at all
        [{"type": "text", "text": "{}"}, {"type": "text", "text": "{}"}],  # two answers
    ],
)
def test_anthropic_answer_must_be_exactly_one_text_block(monkeypatch, content):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-only-key")
    monkeypatch.setenv("ANTHROPIC_MODEL", "configured-test-model")
    transport = httpx.MockTransport(
        lambda r: httpx.Response(200, json=dict(stop_reason="end_turn", content=content))
    )
    with pytest.raises(ValueError, match="Provider request failed"):
        request_structured("s", PAYLOAD, {}, "anthropic", True, transport)


def test_provider_errors_never_echo_the_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-very-secret-test-key")
    monkeypatch.setenv("OPENAI_MODEL", "configured-test-model")
    transport = httpx.MockTransport(lambda r: httpx.Response(500, text="sk-very-secret-test-key"))
    with pytest.raises(ValueError) as error:
        request_structured("s", PAYLOAD, {}, "openai", True, transport)
    assert "sk-very-secret" not in str(error.value)


# ---------- batch labelling for the report ----------


def test_label_events_stops_after_repeated_failures_without_retrying(monkeypatch):
    calls = []

    def failing(text, mode, allow_live, transport=None):
        calls.append(text)
        raise ValueError("Provider request failed")

    monkeypatch.setenv("OPENAI_API_KEY", "test-only-key")
    monkeypatch.setenv("OPENAI_MODEL", "configured-test-model")
    monkeypatch.setattr(providers, "llm_prediction", failing)
    events = synthetic_events(weeks=1, per_week=40)
    with pytest.raises(ValueError, match="3 consecutive"):
        providers.label_events(events, "openai", True, max_failures=3)
    assert len(calls) == 3


def test_label_events_cli_writes_labels_and_no_text(tmp_path, monkeypatch):
    from prompt_insights.__main__ import main

    events = synthetic_events(weeks=1, per_week=6)
    source = tmp_path / "events.ndjson"
    source.write_bytes(ndjson(events))

    def answer(text, mode, allow_live, transport=None):
        return dict(topic="coding", sensitivity="public", costUsd=None, modelVersion="test:model")

    monkeypatch.setenv("OPENAI_API_KEY", "test-only-key")
    monkeypatch.setenv("OPENAI_MODEL", "configured-test-model")
    monkeypatch.setattr(providers, "llm_prediction", answer)
    out = tmp_path / "labels.json"
    args = ["label-events", "--input", str(source), "--mode", "openai", "--yes", "--out", str(out)]
    assert main(args) == 0
    saved = json.loads(out.read_text())
    succeeded = [e for e in events if e["status"] == "succeeded"]
    assert set(saved["labels"]) == {e["event_id"] for e in succeeded}
    assert not any(e["prompt_redacted"] in out.read_text() for e in events)


def test_eval_provider_cli_refuses_an_empty_selection(tmp_path, monkeypatch):
    from prompt_insights.__main__ import main

    monkeypatch.setenv("OPENAI_API_KEY", "test-only-key")
    monkeypatch.setenv("OPENAI_MODEL", "configured-test-model")
    source = tmp_path / "set.ndjson"
    source.write_text(json.dumps(dict(id="a", text="hi", topic="coding", split="train")) + "\n")
    with pytest.raises(SystemExit) as refused:
        main(
            ["eval-provider", "--input", str(source), "--split", "test", "--mode", "openai"]
            + ["--yes", "--out", str(tmp_path / "out.json")]
        )
    assert refused.value.code == 2


# ---------- weekly report ----------


@pytest.mark.parametrize("week", ["", "2026-41", "W41", "2026-W00", "2026-W54", "junk"])
def test_bad_week_strings_are_rejected(week):
    with pytest.raises(ValueError):
        parse_week(week)


def test_no_events_at_all_is_not_found_but_a_filtered_empty_group_is_too_small():
    def label(e):
        return dict(
            topic="coding", sensitivity="public", severity="low", reason="", textRedacted=""
        )

    with pytest.raises(LookupError) as unfiltered:
        weekly_report([], label)
    assert not isinstance(unfiltered.value, GroupTooSmall)
    with pytest.raises(GroupTooSmall):
        weekly_report([], label, team="engineering")
