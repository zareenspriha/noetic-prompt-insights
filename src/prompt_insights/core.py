"""Transparent prompt-topic baseline and independently grouped synthetic evaluation."""

from collections import Counter, defaultdict
from datetime import datetime, timezone
import re
from sklearn.metrics import classification_report, confusion_matrix

TOPICS = {
    "coding": ("python", "debug", "function", "compiler"),
    "writing": ("rewrite", "paragraph", "grammar", "draft"),
    "data_analysis": ("sql", "chart", "dataset", "statistics"),
    "customer_email": ("customer", "email", "support"),
    "legal": ("contract", "legal", "clause", "liability"),
    "hr": ("recruitment", "employee", "payroll", "onboarding"),
    "other": (),
}
TASKS = {
    "coding": (
        "debug a python parser",
        "test a function",
        "explain a compiler error",
        "refactor python loops",
        "find a parser defect",
    ),
    "writing": (
        "rewrite a paragraph",
        "correct grammar",
        "draft an announcement",
        "rewrite a headline",
        "polish prose",
    ),
    "data_analysis": (
        "write a sql query",
        "summarize a dataset",
        "choose a chart",
        "explain statistics",
        "measure a distribution",
    ),
    "customer_email": (
        "answer a customer request",
        "compose an email reply",
        "resolve a support question",
        "greet a customer",
        "respond to a buyer",
    ),
    "legal": (
        "review a contract",
        "explain a legal term",
        "compare a clause",
        "summarize liability",
        "review an agreement",
    ),
    "hr": (
        "plan recruitment",
        "write an employee checklist",
        "explain payroll",
        "prepare onboarding",
        "plan hiring",
    ),
    "other": (
        "name a fictional pet",
        "choose a hiking route",
        "suggest a garden layout",
        "compare board games",
        "invent a lunch menu",
    ),
}
SENSITIVITIES = ("public", "internal", "confidential")
POLICY_CONTEXT = {
    "public": "Public classroom exercise with invented examples.",
    "internal": "Internal planning notes for an imaginary organization.",
    "confidential": "Confidential synthetic account details; all values are invented.",
}
FAMILIES = (
    "Please {task} for a fictional {context}.",
    "I need help to {task}. Use a made-up {context} as the example.",
    "For the imaginary {context}, could you {task}?",
    "Give three steps to {task}, using only a synthetic {context}.",
    "Our classroom exercise: {task}. Scenario: {context}.",
    "Produce a concise answer: {task}. This concerns a fictional {context}.",
    "What approach would you use to {task} for a pretend {context}?",
    "Challenge: {task}; justify your approach with an imaginary {context}.",
)
CONTEXTS = ("bookshop", "garden club", "museum", "robot team", "campus cafe")


def generate():
    """280 original synthetic prompts: 7 topics x 8 families x 5 scenarios."""
    return [
        dict(
            id=f"syn-{topic}-{family}-{variant}",
            text=template.format(
                task=TASKS[topic][variant], context=CONTEXTS[(variant + family) % 5]
            )
            + " "
            + POLICY_CONTEXT[SENSITIVITIES[(variant + family) % 3]],
            topic=topic,
            sensitivity=SENSITIVITIES[(variant + family) % 3],
            template_family=f"family-{family}",
            synthetic=True,
        )
        for topic in TOPICS
        for family, template in enumerate(FAMILIES)
        for variant in range(5)
    ]


def split(rows):
    """Six template families train, two validation. Never random-split near duplicates."""
    train = [
        dict(row) for row in rows if row["template_family"] in {f"family-{i}" for i in range(6)}
    ]
    validation = [dict(row) for row in rows if row["template_family"] in {"family-6", "family-7"}]
    return train, validation


def classify(text):
    if not isinstance(text, str) or len(text) > 16000:
        raise ValueError("Prompt must be a string of at most 16000 characters")
    words = set(re.findall(r"\b[a-z]+\b", text.lower()))
    scores = {topic: len(words.intersection(keywords)) for topic, keywords in TOPICS.items()}
    best = max(scores.values())
    winners = [topic for topic, score in scores.items() if score == best]
    return winners[0] if best > 0 and len(winners) == 1 else "other"


def classify_sensitivity(text):
    """Fictional classroom policy; absence of markers is not a security guarantee."""
    classify(text)
    words = set(re.findall(r"\b[a-z]+\b", text.lower()))
    if words.intersection({"confidential", "secret", "password", "credential"}):
        return "confidential"
    if words.intersection({"internal", "private"}):
        return "internal"
    return "public"


def aggregate(rows):
    return dict(Counter(classify(row["text"]) for row in rows))


# Small-cell suppression: a count is published only when it covers enough events AND enough
# distinct people. Ten prompts from one person still describe that person.
MIN_GROUP_SIZE = 10
MIN_DISTINCT_USERS = 3
WINDOWS = ("day", "week", "month")
TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z")


def parse_timestamp(value):
    """Strict RFC 3339 UTC ('Z') timestamp; rejects impossible dates such as month 13."""
    if not isinstance(value, str) or not TIMESTAMP.fullmatch(value):
        raise ValueError("Timestamp must be RFC 3339 UTC ending in Z")
    seconds, _, fraction = value[:-1].partition(".")
    try:
        moment = datetime.strptime(seconds, "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        raise ValueError("Timestamp is not a real calendar time") from None
    return moment.replace(tzinfo=timezone.utc)


def window_key(timestamp, window="week"):
    """UTC calendar bucket: '2026-10-07', ISO week '2026-W41', or '2026-10'."""
    if window not in WINDOWS:
        raise ValueError("Window must be one of day, week, month")
    moment = parse_timestamp(timestamp)
    if window == "day":
        return moment.date().isoformat()
    if window == "month":
        return f"{moment.year:04d}-{moment.month:02d}"
    year, week, _ = moment.isocalendar()
    return f"{year:04d}-W{week:02d}"


def _check_thresholds(min_group_size, min_distinct_users):
    for value in (min_group_size, min_distinct_users):
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            raise ValueError("Group-size thresholds must be positive integers")


def suppress_counts(
    records, field, min_group_size=MIN_GROUP_SIZE, min_distinct_users=MIN_DISTINCT_USERS
):
    """Count records by `field`; small cells become None.

    If exactly one cell is hidden, the next-smallest is hidden too, so a published total
    cannot recover it by subtraction. If the whole table is below the threshold, no labels
    are published at all (label presence alone would leak).
    """
    _check_thresholds(min_group_size, min_distinct_users)
    counts = Counter(r[field] for r in records)
    users = defaultdict(set)
    for r in records:
        users[r[field]].add(r["user_id"])
    everyone = set().union(*users.values()) if users else set()
    if len(records) < min_group_size or len(everyone) < min_distinct_users:
        return {}
    shown = {
        label: n if n >= min_group_size and len(users[label]) >= min_distinct_users else None
        for label, n in sorted(counts.items())
    }
    hidden = [label for label, n in shown.items() if n is None]
    visible = sorted((n, label) for label, n in shown.items() if n is not None)
    if len(hidden) == 1 and visible:
        shown[visible[0][1]] = None
    return shown


def windowed_aggregate(
    records,
    fields,
    window="week",
    group_by=None,
    min_group_size=MIN_GROUP_SIZE,
    min_distinct_users=MIN_DISTINCT_USERS,
):
    """Per time window (and optional group such as team_id) suppressed counts for each field.

    Records need `timestamp` and `user_id`; neither user ids nor text appear in the output.
    """
    _check_thresholds(min_group_size, min_distinct_users)
    buckets = defaultdict(list)
    for r in records:
        buckets[(window_key(r["timestamp"], window), r[group_by] if group_by else "")].append(r)
    result = []
    for (key, group), part in sorted(buckets.items()):
        people = len({r["user_id"] for r in part})
        large = len(part) >= min_group_size and people >= min_distinct_users
        entry = dict(window=key)
        if group_by:
            entry[group_by] = group
        entry["total"] = len(part) if large else None
        for field in fields:
            entry[field] = suppress_counts(part, field, min_group_size, min_distinct_users)
        result.append(entry)
    return result


def score(part, target, classifier, labels):
    truth = [row[target] for row in part]
    predicted = [classifier(row["text"]) for row in part]
    report = classification_report(
        truth, predicted, labels=labels, output_dict=True, zero_division=0
    )
    return dict(
        samples=len(part),
        accuracy=sum(a == b for a, b in zip(truth, predicted)) / len(part) if part else None,
        per_class={k: report[k] for k in labels},
        macro_f1=sum(report[k]["f1-score"] for k in labels) / len(labels),
        confusion_labels=labels,
        confusion_matrix=confusion_matrix(truth, predicted, labels=labels).tolist(),
    )


def evaluate(rows):
    train, validation = split(rows)
    return dict(
        train=score(train, "topic", classify, list(TOPICS)),
        validation=score(validation, "topic", classify, list(TOPICS)),
        sensitivity={
            "train": score(train, "sensitivity", classify_sensitivity, list(SENSITIVITIES)),
            "validation": score(
                validation, "sensitivity", classify_sensitivity, list(SENSITIVITIES)
            ),
        },
        method="fixed keyword topic and policy-marker sensitivity baselines; no fitting",
        split="template-family disjoint: families 0–5 train, 6–7 validation",
        limitation="Synthetic family holdout shares topic phrases and sensitivity markers. This is a development check, not real-world accuracy. Other includes mixed or unrecognized topics; public is a policy-marker default, not proof of safety.",
    )
