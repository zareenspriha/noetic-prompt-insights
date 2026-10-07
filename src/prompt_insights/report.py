"""Weekly manager report over classified gateway events. Shape follows WeeklyReport in
web/types/api.ts.

Only succeeded events with prompt text are counted; failed/blocked events are never classified.
Team x topic cells use core.suppress_counts: a cell is shown only with at least MIN_GROUP_SIZE
prompts from at least MIN_DISTINCT_USERS people, a lone hidden cell takes the next-smallest with
it, and a team below the thresholds shows no cells at all. Otherwise it is null.

The same rules cover the trend (per week) and the KPIs: a filtered selection below the thresholds
is refused rather than reported exactly, so filters cannot reveal a cell the heatmap hides.
"""

import re
from collections import Counter
from datetime import datetime, timedelta

from .core import MIN_DISTINCT_USERS, MIN_GROUP_SIZE, TOPICS, suppress_counts

TREND_WEEKS = 6
SEVERITY_ORDER = ("low", "medium", "high", "critical")
WEEK = re.compile(r"^(\d{4})-W(\d{2})$")


class GroupTooSmall(ValueError):
    """A filtered selection too small to report without singling people out."""

    def __init__(self):
        super().__init__(
            f"Too few prompts or people in this selection to report "
            f"(needs {MIN_GROUP_SIZE} prompts from {MIN_DISTINCT_USERS} people)"
        )


def large_enough(rows):
    people = {r["event"]["user_id"] for r in rows}
    return len(rows) >= MIN_GROUP_SIZE and len(people) >= MIN_DISTINCT_USERS


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
    filtered = team is not None or topic is not None
    if not items:
        # Same answer as "too small", so a filter cannot tell 0 apart from 1-9.
        if filtered:
            raise GroupTooSmall()
        raise LookupError("No classified events match these filters")
    week = parse_week(week) if week else max(i["week"] for i in items)
    previous = shift_week(week, -1)
    current = [i for i in items if i["week"] == week]
    before = [i for i in items if i["week"] == previous]
    if not current and not filtered:
        raise LookupError(f"No classified events in {week}")
    if not large_enough(current):
        raise GroupTooSmall()
    # A previous week below the thresholds is reported as missing (null), never exactly.
    if not large_enough(before):
        before = []

    def pct_confidential(rows):
        return round(100 * sum(r["sensitivity"] == "confidential" for r in rows) / len(rows), 1)

    def critical(rows):
        return sum(r["severity"] == "critical" for r in rows)

    def top_topic(rows):
        counts = Counter(r["topic"] for r in rows)
        return max(TOPICS, key=lambda t: (counts[t], -list(TOPICS).index(t)))

    shown_topics = [topic] if topic else list(TOPICS)
    shown_teams = [team] if team else teams
    per_team = {
        t: suppress_counts(
            [
                dict(topic=i["topic"], user_id=i["event"]["user_id"])
                for i in current
                if i["event"]["team_id"] == t
            ],
            "topic",
        )
        for t in shown_teams
    }
    weeks = [shift_week(week, n) for n in range(1 - TREND_WEEKS, 1)]
    by_week = {
        w: [dict(topic=i["topic"], user_id=i["event"]["user_id"]) for i in items if i["week"] == w]
        for w in weeks
    }
    trend = {w: suppress_counts(rows, "topic") for w, rows in by_week.items()}
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
                # Absent topics in a published team are true zeros; a hidden team is all null.
                count=per_team[t].get(topic_id, 0) if per_team[t] else None,
            )
            for t in shown_teams
            for topic_id in shown_topics
        ],
        # Same rule as the heatmap; a week with no prompts at all is a true zero, not hidden.
        trend=[
            dict(week=w, topic=t, count=trend[w].get(t, 0) if trend[w] or not by_week[w] else None)
            for w in weeks
            for t in shown_topics
        ],
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
