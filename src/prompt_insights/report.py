"""Weekly manager report over classified gateway events. Shape follows WeeklyReport in
web/types/api.ts.

Only succeeded events with prompt text are counted; failed/blocked events are never classified.
Team x topic cells under MIN_GROUP_SIZE are returned as null so small groups cannot be singled out.
"""

import re
from collections import Counter
from datetime import datetime, timedelta

from .core import TOPICS

MIN_GROUP_SIZE = 10
TREND_WEEKS = 6
SEVERITY_ORDER = ("low", "medium", "high", "critical")
WEEK = re.compile(r"^(\d{4})-W(\d{2})$")


def iso_week(timestamp):
    year, week, _ = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).isocalendar()
    return f"{year}-W{week:02d}"


def shift_week(week, weeks):
    year, number = map(int, WEEK.match(week).groups())
    monday = datetime.fromisocalendar(year, number, 1) + timedelta(weeks=weeks)
    year, number, _ = monday.isocalendar()
    return f"{year}-W{number:02d}"


def parse_week(week):
    match = WEEK.match(week or "")
    if not match:
        raise ValueError("week must look like 2026-W41")
    datetime.fromisocalendar(int(match[1]), int(match[2]), 1)  # rejects W00, W54, ...
    return week


def weekly_report(events, label, week=None, team=None, topic=None):
    """`label(event)` returns topic, sensitivity, severity, reason and textRedacted."""
    eligible = [e for e in events if e["status"] == "succeeded" and e.get("prompt_redacted")]
    teams = sorted({e["team_id"] for e in eligible})
    items = [
        dict(event=e, week=iso_week(e["timestamp"]), **label(e))
        for e in eligible
        if team is None or e["team_id"] == team
    ]
    items = [i for i in items if topic is None or i["topic"] == topic]
    if not items:
        raise LookupError("No classified events match these filters")
    week = parse_week(week) if week else max(i["week"] for i in items)
    previous = shift_week(week, -1)
    current = [i for i in items if i["week"] == week]
    before = [i for i in items if i["week"] == previous]
    if not current:
        raise LookupError(f"No classified events in {week}")

    def pct_confidential(rows):
        return round(100 * sum(r["sensitivity"] == "confidential" for r in rows) / len(rows), 1)

    def critical(rows):
        return sum(r["severity"] == "critical" for r in rows)

    def top_topic(rows):
        counts = Counter(r["topic"] for r in rows)
        return max(TOPICS, key=lambda t: (counts[t], -list(TOPICS).index(t)))

    shown_topics = [topic] if topic else list(TOPICS)
    shown_teams = [team] if team else teams
    cells = Counter((i["event"]["team_id"], i["topic"]) for i in current)
    weeks = [shift_week(week, n) for n in range(1 - TREND_WEEKS, 1)]
    trend = Counter((i["week"], i["topic"]) for i in items)
    flags = sorted(
        (i for i in current if i["severity"] != "low"),
        key=lambda i: (-SEVERITY_ORDER.index(i["severity"]), i["event"]["timestamp"]),
    )
    return dict(
        week=week,
        minGroupSize=MIN_GROUP_SIZE,
        kpis=dict(
            totalPrompts=dict(value=len(current), prevValue=len(before) if before else None),
            pctConfidential=dict(
                value=pct_confidential(current),
                prevValue=pct_confidential(before) if before else None,
            ),
            criticalFlags=dict(
                value=critical(current), prevValue=critical(before) if before else None
            ),
            topTopic=dict(
                value=top_topic(current), prevValue=top_topic(before) if before else None
            ),
        ),
        heatmap=[
            dict(
                teamId=t,
                topic=topic_id,
                count=cells[t, topic_id] if cells[t, topic_id] >= MIN_GROUP_SIZE else None,
            )
            for t in shown_teams
            for topic_id in shown_topics
        ],
        trend=[dict(week=w, topic=t, count=trend[w, t]) for w in weeks for t in shown_topics],
        flags=[
            dict(
                eventId=i["event"]["event_id"],
                timestamp=i["event"]["timestamp"],
                teamId=i["event"]["team_id"],
                topic=i["topic"],
                sensitivity=i["sensitivity"],
                severity=i["severity"],
                reason=i["reason"],
                textRedacted=i["textRedacted"],
            )
            for i in flags
        ],
        teams=teams,
        synthetic=all(e["synthetic"] for e in eligible),
    )
