import json
from pathlib import Path
import pytest
from prompt_insights.gateway import parse_ndjson
from prompt_insights.report import MIN_GROUP_SIZE, iso_week, shift_week, weekly_report

ROOT = Path(__file__).parents[1]


def event(n, timestamp, team="eng", text="Debug this python function", status="succeeded"):
    return dict(
        event_id=f"e{n}",
        timestamp=timestamp,
        team_id=team,
        status=status,
        prompt_redacted=text,
        synthetic=True,
    )


def label(e):
    secret = "password" in e["prompt_redacted"]
    return dict(
        topic="coding",
        sensitivity="confidential" if secret else "public",
        severity="critical" if secret else "low",
        reason="password or login" if secret else "",
        textRedacted=e["prompt_redacted"].replace("hunter2", "[PASSWORD]"),
    )


def test_iso_weeks_cross_year_boundaries():
    assert iso_week("2026-10-07T12:00:00Z") == "2026-W41"
    assert iso_week("2027-01-01T00:00:00Z") == "2026-W53"
    assert shift_week("2027-W01", -1) == "2026-W53"


def test_kpis_heatmap_suppression_trend_and_flags():
    week41 = [event(i, "2026-10-06T09:00:00Z") for i in range(MIN_GROUP_SIZE)]
    week41 += [event(100, "2026-10-06T10:00:00Z", text="my password is hunter2")]
    week41 += [event(101, "2026-10-07T10:00:00Z", team="hr")]  # a group of one
    week40 = [event(200 + i, "2026-09-29T09:00:00Z") for i in range(4)]
    ignored = [event(300, "2026-10-06T09:00:00Z", status="failed")]
    result = weekly_report(week41 + week40 + ignored, label)

    assert result["week"] == "2026-W41"
    assert result["kpis"]["totalPrompts"] == dict(value=12, prevValue=4)
    assert result["kpis"]["pctConfidential"] == dict(value=8.3, prevValue=0.0)
    assert result["kpis"]["criticalFlags"] == dict(value=1, prevValue=0)
    assert result["kpis"]["topTopic"] == dict(value="coding", prevValue="coding")
    cells = {(c["teamId"], c["topic"]): c["count"] for c in result["heatmap"]}
    assert cells["eng", "coding"] == 11 and cells["hr", "coding"] is None
    assert len(result["heatmap"]) == 2 * 7
    assert [p["week"] for p in result["trend"][::7]] == [f"2026-W{w}" for w in range(36, 42)]
    [flag] = result["flags"]
    assert flag["severity"] == "critical" and "hunter2" not in json.dumps(result)
    assert result["teams"] == ["eng", "hr"] and result["synthetic"] is True


def test_first_week_has_no_previous_values_and_filters_apply():
    rows = [event(i, "2026-10-06T09:00:00Z", team="eng" if i % 2 else "ops") for i in range(6)]
    result = weekly_report(rows, label, team="ops")
    assert result["kpis"]["totalPrompts"] == dict(value=3, prevValue=None)
    assert {c["teamId"] for c in result["heatmap"]} == {"ops"}
    assert result["teams"] == ["eng", "ops"]  # the filter list stays complete
    assert len(weekly_report(rows, label, topic="coding")["heatmap"]) == 2
    with pytest.raises(LookupError):
        weekly_report(rows, label, week="2026-W30")
    with pytest.raises(ValueError):
        weekly_report(rows, label, week="2026-W54")


def test_demo_events_satisfy_the_gateway_contract():
    events = parse_ndjson((ROOT / "data/demo-events.ndjson").read_bytes())
    assert len(events) <= 1000 and all(e["synthetic"] for e in events)


def test_report_endpoint_matches_frontend_mock(client):
    from test_api import same_shape

    contract = json.loads((ROOT / "tests/fixtures/report-weekly-contract.json").read_text())
    response = client.get("/report/weekly")
    assert response.status_code == 200
    same_shape(response.json(), contract)
    for secret in ("sk-test-FAKE", "Demo-Only-123", "078-05-1120", "pat.example@", "4242 4242"):
        assert secret not in response.text


def test_report_endpoint_rejects_bad_queries(client):
    assert client.get("/report/weekly?week=2026-W99").status_code == 422
    assert client.get("/report/weekly?week=junk").status_code == 422
    assert client.get("/report/weekly?topic=nope").status_code == 422
    assert client.get("/report/weekly?model=llm").status_code == 501
    assert client.get("/report/weekly?week=2020-W01").status_code == 404
    assert client.get("/report/weekly?model=keyword").status_code == 200
