import json
import httpx
import pytest
from prompt_insights.gateway import parse_ndjson, summarize_gateway, fetch_gateway


def event(**overrides):
    return dict(
        schema_version=1,
        event_type="llm.request",
        event_id="evt-001",
        request_id="req-001",
        timestamp="2026-10-01T09:00:00Z",
        user_id="user-01",
        team_id="team-01",
        provider="mock",
        model="mock-v1",
        status="succeeded",
        latency_ms=1.0,
        input_tokens=None,
        output_tokens=None,
        cost_usd=None,
        usage_source="unavailable",
        policy_actions=[],
        synthetic=True,
        **overrides,
    )


def test_ndjson_schema_privacy_dedup_and_missing_text():
    row = event(prompt_redacted="Debug python")
    data = "\n".join(json.dumps(r) for r in [row, row, {**event(), "event_id": "evt-002"}]).encode()
    rows = parse_ndjson(data)
    assert len(rows) == 2
    summary = summarize_gateway(rows)
    assert summary["classified"] == 1 and summary["missing_text"] == 1
    assert summary["topics"] == {"coding": 1}
    assert "Debug python" not in json.dumps(summary)
    for invalid in [
        {**row, "raw_prompt": "secret"},
        {**row, "synthetic": False},
        {**row, "latency_ms": -1},
        {**row, "timestamp": "nope"},
    ]:
        with pytest.raises(ValueError):
            parse_ndjson(json.dumps(invalid).encode())
    with pytest.raises(ValueError):
        parse_ndjson(b"bad json")


def test_authenticated_fetch_and_failed_event_not_classified():
    def handler(request):
        assert request.headers["Authorization"] == "Bearer test-token"
        assert request.url.path == "/events"
        return httpx.Response(200, json=[{**event(prompt_redacted="python"), "status": "failed"}])

    rows = fetch_gateway(
        "http://127.0.0.1:8000", token="test-token", transport=httpx.MockTransport(handler)
    )
    assert summarize_gateway(rows)["excluded_status"] == 1
    with pytest.raises(ValueError):
        fetch_gateway("http://untrusted.example", token="test-token")
    with pytest.raises(ValueError):
        fetch_gateway("https://user:password@example.test", token="test-token")


def test_conflicting_event_id_and_limits_rejected():
    first = event(prompt_redacted="python")
    second = {**first, "prompt_redacted": "invoice"}
    with pytest.raises(ValueError):
        parse_ndjson(("\n".join(json.dumps(r) for r in [first, second])).encode())
    with pytest.raises(ValueError):
        parse_ndjson(b"x" * 2000001)


def test_canonical_fixture_and_packaged_schema_match():
    from pathlib import Path
    from prompt_insights._gateway_schema import SCHEMA

    root = Path(__file__).parents[1]
    assert json.loads((root / "schemas/gateway-event.schema.json").read_text()) == SCHEMA
    result = summarize_gateway(parse_ndjson((root / "data/gateway-events.ndjson").read_bytes()))
    assert result["events"] > 0 and result["classified"] > 0


def test_nonfinite_json_numbers_rejected():
    with pytest.raises(ValueError):
        parse_ndjson(json.dumps({**event(), "latency_ms": float("nan")}).encode())


def test_cli_bounds_file_read_before_allocation(tmp_path, monkeypatch):
    from pathlib import Path
    from prompt_insights.__main__ import main

    source = tmp_path / "huge.ndjson"
    source.write_bytes(b"x" * 2000001)

    def forbidden(self):
        raise AssertionError("Unbounded read_bytes is forbidden")

    monkeypatch.setattr(Path, "read_bytes", forbidden)
    with pytest.raises(SystemExit) as exc:
        main(["import-gateway", "--input", str(source), "--out", str(tmp_path / "summary")])
    assert exc.value.code == 2
