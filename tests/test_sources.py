import json
from pathlib import Path
from prompt_insights import api

# Copy of web/mocks/sources.json: the frontend's agreed response shape.
CONTRACT = json.loads((Path(__file__).parent / "fixtures/sources-contract.json").read_text())


def event(event_id, status="succeeded", text="Debug this python function"):
    row = dict(
        schema_version=1,
        event_type="llm.request",
        event_id=event_id,
        request_id=f"req-{event_id}",
        timestamp="2026-10-05T10:00:00Z",
        user_id="user-1",
        team_id="engineering",
        provider="mock",
        model="mock-model",
        status=status,
        latency_ms=10.0,
        input_tokens=5,
        output_tokens=5,
        cost_usd=None,
        usage_source="mock",
        policy_actions=[],
        synthetic=True,
    )
    if status == "succeeded":
        row["prompt_redacted"] = text
    return row


def test_sources_matches_frontend_contract_and_counts_demo_events(client):
    body = client.get("/sources").json()
    assert set(body) == set(CONTRACT)
    assert set(body["gateway"]) == set(CONTRACT["gateway"])
    assert body["received"] == len(api.events()) + body["deduped"]
    assert body["classified"] == len(api.classifiable())
    assert body["gateway"]["connected"] is False and body["gateway"]["lastImportAt"].endswith("Z")
    assert body["project1DashboardUrl"] is None


def test_sources_counts_duplicates_and_never_classifies_failed_or_blocked(
    client, monkeypatch, tmp_path
):
    rows = [event("a"), event("a"), event("b", "failed"), event("c", "blocked"), event("d")]
    export = tmp_path / "events.ndjson"
    export.write_text("".join(json.dumps(r) + "\n" for r in rows) + "\n")
    monkeypatch.setattr(api, "EVENTS", export)
    monkeypatch.setenv("PI_PROJECT1_DASHBOARD_URL", "http://127.0.0.1:8000/dashboard")
    body = client.get("/sources").json()
    assert (body["received"], body["deduped"], body["failed"], body["blocked"]) == (5, 1, 1, 1)
    assert body["classified"] == 2
    assert body["project1DashboardUrl"] == "http://127.0.0.1:8000/dashboard"


def test_sources_is_text_free(client):
    text = json.dumps(client.get("/sources").json())
    assert all(e["user_id"] not in text for e in api.events())
    assert all(e.get("prompt_redacted", "\0") not in text for e in api.events())
