"""Strict shared gateway contract; auth import exports aggregate metadata only."""

from datetime import timedelta
import ipaddress
import json
import os
from urllib.parse import urlsplit
import httpx
from jsonschema import Draft202012Validator, FormatChecker
from ._gateway_schema import SCHEMA
from .core import (
    MIN_DISTINCT_USERS,
    MIN_GROUP_SIZE,
    classify,
    classify_sensitivity,
    generate,
    parse_timestamp,
    suppress_counts,
    windowed_aggregate,
)

VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())
MAX_BYTES = 2000000


def _invalid_number(_value):
    raise ValueError("Nonfinite JSON measurement")


def parse_ndjson(data):
    if not isinstance(data, bytes) or len(data) > MAX_BYTES:
        raise ValueError("Gateway export exceeds size limit")
    rows = {}
    try:
        for line in data.splitlines():
            if not line.strip():
                continue
            if len(line) > 65536:
                raise ValueError("Gateway record exceeds size limit")
            row = json.loads(line, parse_constant=_invalid_number)
            if not VALIDATOR.is_valid(row):
                raise ValueError("Gateway contract violation")
            # jsonschema only enforces format: date-time with an optional, unpinned package.
            parse_timestamp(row["timestamp"])
            key = row["event_id"]
            if key in rows and rows[key] != row:
                raise ValueError("Conflicting gateway event identifier")
            rows[key] = row
            if len(rows) > 1000:
                raise ValueError("Gateway record limit exceeded")
    except (UnicodeError, json.JSONDecodeError, RecursionError, TypeError):
        raise ValueError("Invalid gateway NDJSON") from None
    return list(rows.values())


def fetch_gateway(base_url, token=None, transport=None):
    token = token or os.environ.get("GATEWAY_TOKEN", "")
    url = urlsplit(base_url)
    try:
        loopback = url.hostname == "localhost" or ipaddress.ip_address(url.hostname).is_loopback
    except ValueError:
        loopback = False
    if (
        url.scheme not in ("http", "https")
        or not url.hostname
        or url.username
        or url.password
        or url.query
        or url.fragment
        or url.path not in ("", "/")
        or (url.scheme == "http" and not loopback)
        or not token
    ):
        raise ValueError("Gateway requires a bearer token and HTTPS or loopback HTTP")
    try:
        with httpx.Client(timeout=10, transport=transport, follow_redirects=False) as client:
            with client.stream(
                "GET",
                base_url.rstrip("/") + "/events",
                headers={"Authorization": "Bearer " + token},
            ) as response:
                response.raise_for_status()
                content = bytearray()
                for chunk in response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_BYTES:
                        raise ValueError("Gateway export exceeds size limit")
        rows = json.loads(content)
        if not isinstance(rows, list) or len(rows) > 1000:
            raise ValueError("Gateway response must be a bounded event array")
        return parse_ndjson("\n".join(json.dumps(row) for row in rows).encode())
    except (httpx.HTTPError, TypeError, ValueError):
        raise ValueError("Gateway fetch failed; verify authentication and contract") from None


def summarize_gateway(
    rows,
    window="week",
    min_group_size=MIN_GROUP_SIZE,
    min_distinct_users=MIN_DISTINCT_USERS,
):
    """Text-free summary. Per-label cells below the group-size thresholds are null."""
    # Revalidate callers, not just the CLI path.
    rows = parse_ndjson("\n".join(json.dumps(row) for row in rows).encode())
    eligible = [r for r in rows if r["status"] == "succeeded"]
    with_text = [r for r in eligible if r.get("prompt_redacted")]
    labelled = [
        dict(
            timestamp=r["timestamp"],
            user_id=r["user_id"],
            team_id=r["team_id"],
            topic=classify(r["prompt_redacted"]),
            sensitivity=classify_sensitivity(r["prompt_redacted"]),
        )
        for r in with_text
    ]
    limits = dict(min_group_size=min_group_size, min_distinct_users=min_distinct_users)
    return dict(
        events=len(rows),
        classified=len(with_text),
        missing_text=len(eligible) - len(with_text),
        excluded_status=len(rows) - len(eligible),
        topics=suppress_counts(labelled, "topic", **limits),
        sensitivities=suppress_counts(labelled, "sensitivity", **limits),
        providers=suppress_counts(rows, "provider", **limits),
        window=window,
        windows=windowed_aggregate(labelled, ("topic", "sensitivity"), window, **limits),
        team_windows=windowed_aggregate(labelled, ("topic",), window, "team_id", **limits),
        suppression=dict(
            **limits,
            rule="Counts need both thresholds; otherwise null. A group below them lists no labels.",
        ),
        note="Authenticated gateway exports contain metadata only. Only explicit synthetic redacted fixture text is classified.",
    )


TEAMS = {
    "engineering": ("coding", "data_analysis"),
    "sales": ("customer_email", "writing"),
    "support": ("customer_email", "coding"),
    "legal-ops": ("legal", "writing"),
    "people": ("hr", "writing"),
}


def synthetic_events(weeks=6, per_week=150, start="2026-08-31T09:00:00Z"):
    """Deterministic multi-week, multi-team export built from the synthetic corpus.

    Teams mostly ask about their own topics, so some cells clear the thresholds and many
    do not, which is the point of the demo. Every event passes the shared contract.
    """
    if weeks * per_week > 1000:
        raise ValueError("Gateway record limit exceeded")
    prompts = generate()
    by_topic = {}
    for row in prompts:
        by_topic.setdefault(row["topic"], []).append(row["text"])
    teams = list(TEAMS)
    origin = parse_timestamp(start)
    events = []
    for i in range(weeks * per_week):
        team = teams[i % len(teams)]
        own = TEAMS[team]
        topic = own[(i // 5) % 2] if i % 7 else list(by_topic)[(i // 7) % len(by_topic)]
        texts = by_topic[topic]
        moment = origin + timedelta(weeks=i // per_week, minutes=(i % per_week) * 61)
        status = "failed" if i % 29 == 0 else "blocked" if i % 41 == 0 else "succeeded"
        events.append(
            dict(
                schema_version=1,
                event_type="llm.request",
                event_id=f"synthetic-event-{i}",
                request_id=f"synthetic-request-{i}",
                timestamp=moment.strftime("%Y-%m-%dT%H:%M:%SZ"),
                user_id=f"{team}-user-{(i // len(teams)) % 6}",
                team_id=team,
                provider="mock",
                model="mock-model",
                status=status,
                latency_ms=float(5 + i % 20),
                input_tokens=20 + i % 50,
                output_tokens=10 + i % 30,
                cost_usd=None,
                usage_source="mock",
                policy_actions=[],
                synthetic=True,
                prompt_redacted=texts[(i // len(teams) * 7) % len(texts)],
            )
        )
    return events
