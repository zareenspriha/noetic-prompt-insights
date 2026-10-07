import json
import pytest
from prompt_insights.core import (
    MIN_GROUP_SIZE,
    parse_timestamp,
    suppress_counts,
    window_key,
    windowed_aggregate,
)
from prompt_insights.gateway import parse_ndjson, summarize_gateway, synthetic_events


def records(label, count, users, timestamp="2026-10-05T09:00:00Z", team="team-a"):
    return [
        dict(timestamp=timestamp, user_id=f"u{i % users}", team_id=team, topic=label)
        for i in range(count)
    ]


def test_window_keys_use_utc_iso_weeks_including_year_boundaries():
    assert window_key("2026-10-07T23:59:59Z", "day") == "2026-10-07"
    assert window_key("2026-10-07T00:00:00Z", "week") == "2026-W41"
    assert window_key("2026-10-07T00:00:00.5Z", "month") == "2026-10"
    assert window_key("2027-01-01T00:00:00Z", "week") == "2026-W53"
    assert window_key("2026-01-01T00:00:00Z", "week") == "2026-W01"
    with pytest.raises(ValueError):
        window_key("2026-10-07T00:00:00Z", "year")


@pytest.mark.parametrize(
    "value",
    [
        "nope",
        "2026-13-45T00:00:00Z",
        "2026-02-30T00:00:00Z",
        "2026-10-01T25:61:00Z",
        "2026-10-01 09:00:00Z",
        "2026-10-01T09:00:00+00:00",
        None,
    ],
)
def test_malformed_timestamps_rejected(value):
    with pytest.raises(ValueError):
        parse_timestamp(value)


def test_small_cells_suppressed_by_count_and_by_distinct_people():
    rows = records("coding", 30, 5) + records("legal", 12, 1) + records("hr", 12, 4)
    rows += records("writing", 3, 3)
    shown = suppress_counts(rows, "topic")
    assert shown["coding"] == 30 and shown["hr"] == 12
    assert shown["legal"] is None  # 12 prompts but one person
    assert shown["writing"] is None  # too few prompts


def test_single_hidden_cell_triggers_secondary_suppression():
    rows = records("coding", 30, 5) + records("hr", 12, 4) + records("legal", 2, 2)
    shown = suppress_counts(rows, "topic")
    assert shown == {"coding": 30, "hr": None, "legal": None}


def test_group_below_threshold_publishes_no_labels():
    assert suppress_counts(records("legal", MIN_GROUP_SIZE - 1, 5), "topic") == {}
    assert suppress_counts(records("legal", 50, 2), "topic") == {}
    with pytest.raises(ValueError):
        suppress_counts([], "topic", min_group_size=0)
    with pytest.raises(ValueError):
        suppress_counts([], "topic", min_distinct_users=True)


def test_windowed_aggregate_buckets_and_suppresses_per_group():
    week40 = records("coding", 20, 4, "2026-09-29T10:00:00Z")
    week41 = records("coding", 4, 4, "2026-10-06T10:00:00Z", team="team-b")
    result = windowed_aggregate(week40 + week41, ("topic",), "week", "team_id")
    assert result == [
        dict(window="2026-W40", team_id="team-a", total=20, topic={"coding": 20}),
        dict(window="2026-W41", team_id="team-b", total=None, topic={}),
    ]


def test_synthetic_export_passes_contract_and_is_deterministic():
    events = synthetic_events()
    assert events == synthetic_events()
    data = "\n".join(json.dumps(e) for e in events).encode()
    assert len(parse_ndjson(data)) == len(events) == 900
    assert {e["status"] for e in events} == {"succeeded", "failed", "blocked"}
    with pytest.raises(ValueError):
        synthetic_events(weeks=10, per_week=200)


def test_summary_is_text_free_and_every_published_cell_meets_thresholds():
    events = synthetic_events()
    summary = summarize_gateway(events)
    dumped = json.dumps(summary)
    for event in events:
        assert event["prompt_redacted"] not in dumped
        assert event["user_id"] not in dumped
        assert event["event_id"] not in dumped
    assert len(summary["windows"]) == 6
    published = []
    for table in [summary["topics"], summary["sensitivities"], summary["providers"]]:
        published += [v for v in table.values() if v is not None]
    for entry in summary["windows"] + summary["team_windows"]:
        for field in ("topic", "sensitivity"):
            published += [v for v in entry.get(field, {}).values() if v is not None]
    assert published and min(published) >= MIN_GROUP_SIZE
    cells = [v for e in summary["team_windows"] for v in e["topic"].values()]
    assert None in cells  # the demo really exercises suppression


def test_summary_still_rejects_bad_input_after_aggregation_changes():
    good = synthetic_events(weeks=1, per_week=3)
    for bad in [
        {**good[0], "timestamp": "2026-13-45T00:00:00Z"},
        {**good[0], "raw_prompt": "leak"},
        {**good[0], "synthetic": False},
        {**good[0], "user_id": ""},
    ]:
        with pytest.raises(ValueError):
            summarize_gateway([bad])
    with pytest.raises(ValueError):
        summarize_gateway(good, window="year")
    with pytest.raises(ValueError):
        summarize_gateway(good, min_group_size=0)


def test_cli_window_flags_and_synthetic_export(tmp_path):
    from prompt_insights.__main__ import main

    export = tmp_path / "events.ndjson"
    assert main(["synth-gateway", "--out", str(export)]) == 0
    out = tmp_path / "summary.json"
    args = ["import-gateway", "--input", str(export), "--out", str(out), "--window", "month"]
    assert main(args + ["--min-group-size", "5"]) == 0
    summary = json.loads(out.read_text())
    assert summary["window"] == "month" and summary["suppression"]["min_group_size"] == 5
    assert [w["window"] for w in summary["windows"]] == ["2026-08", "2026-09", "2026-10"]
    with pytest.raises(SystemExit) as exc:
        main(args + ["--min-group-size", "0"])
    assert exc.value.code == 2
