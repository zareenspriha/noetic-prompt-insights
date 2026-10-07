"""Transparent prompt-topic baseline and independently grouped synthetic evaluation."""

from collections import Counter
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
