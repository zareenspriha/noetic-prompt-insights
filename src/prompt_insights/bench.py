"""Score models on the frozen benchmark. Shape follows Metrics in web/types/api.ts."""

import json
import statistics
import time
from pathlib import Path

from sklearn.metrics import classification_report, cohen_kappa_score, confusion_matrix

from .core import SENSITIVITIES, TOPICS

ROOT = Path(__file__).resolve().parents[2]
BENCHMARK = ROOT / "data/benchmark.ndjson"
META = ROOT / "data/benchmark.meta.json"


def load_benchmark():
    rows = [json.loads(line) for line in BENCHMARK.read_text().splitlines()]
    return rows, json.loads(META.read_text())


def _per_class(truth, predicted, labels):
    report = classification_report(
        truth, predicted, labels=labels, output_dict=True, zero_division=0
    )
    per_class = [
        dict(
            label=label,
            precision=round(report[label]["precision"], 3),
            recall=round(report[label]["recall"], 3),
            f1=round(report[label]["f1-score"], 3),
            support=int(report[label]["support"]),
        )
        for label in labels
    ]
    macro_f1 = round(sum(report[label]["f1-score"] for label in labels) / len(labels), 3)
    matrix = confusion_matrix(truth, predicted, labels=labels).tolist()
    return per_class, macro_f1, dict(labels=labels, matrix=matrix)


def score_model(name, version, predict, rows):
    """`predict(text)` returns (topic, sensitivity). Latency is measured per prompt."""
    topics, sensitivities, latencies = [], [], []
    for row in rows:
        started = time.perf_counter()
        topic, sensitivity = predict(row["text"])
        latencies.append((time.perf_counter() - started) * 1000)
        topics.append(topic)
        sensitivities.append(sensitivity)
    topic_truth = [row["topic"] for row in rows]
    sensitivity_truth = [row["sensitivity"] for row in rows]
    topic_per_class, topic_f1, topic_confusion = _per_class(topic_truth, topics, list(TOPICS))
    sens_per_class, sens_f1, sens_confusion = _per_class(
        sensitivity_truth, sensitivities, list(SENSITIVITIES)
    )
    confidential = [p for t, p in zip(sensitivity_truth, sensitivities) if t == "confidential"]
    missed = sum(p != "confidential" for p in confidential)
    return dict(
        model=name,
        modelVersion=version,
        topicMacroF1=topic_f1,
        sensitivityMacroF1=sens_f1,
        confidentialRecall=round(1 - missed / len(confidential), 3) if confidential else 0.0,
        confidentialFalseNegatives=missed,
        topicPerClass=topic_per_class,
        sensitivityPerClass=sens_per_class,
        topicConfusion=topic_confusion,
        sensitivityConfusion=sens_confusion,
        costPer1kUsd=None,  # local models: compute cost is not measured
        p50LatencyMs=round(statistics.median(latencies), 2),
    ), topics


def benchmark_metrics(models, compare=("knn", "keyword")):
    """`models` is a list of (name, version, predict); `compare` names the agreement pair."""
    rows, meta = load_benchmark()
    scored = {name: score_model(name, version, predict, rows) for name, version, predict in models}
    first, second = (scored[name][1] for name in compare)
    agree = sum(a == b for a, b in zip(first, second))
    frozen = meta["frozenAt"]
    return dict(
        evalSet="benchmark",
        n=len(rows),
        models=[result for result, _ in scored.values()],
        agreement=dict(
            pct=round(100 * agree / len(rows), 1),
            cohensKappa=round(cohen_kappa_score(first, second), 3),
            between=list(compare),
        ),
        benchmark=dict(
            size=meta["size"],
            sha256=meta["sha256"],
            frozenAt=frozen if "T" in frozen else f"{frozen}T00:00:00Z",
        ),
    )
