import hashlib
import json
from collections import Counter
from pathlib import Path
from prompt_insights.core import SENSITIVITIES, TOPICS

ROOT = Path(__file__).parents[1]


def test_benchmark_is_frozen():
    # Changing data/benchmark.ndjson must be a deliberate, reviewed edit to the meta file too.
    data = (ROOT / "data/benchmark.ndjson").read_bytes()
    meta = json.loads((ROOT / "data/benchmark.meta.json").read_text())
    assert hashlib.sha256(data).hexdigest() == meta["sha256"]
    assert len(data.splitlines()) == meta["size"] == 70


def test_benchmark_labels_and_kinds_are_valid():
    rows = [json.loads(line) for line in (ROOT / "data/benchmark.ndjson").read_text().splitlines()]
    assert {r["topic"] for r in rows} <= set(TOPICS)
    assert {r["sensitivity"] for r in rows} == set(SENSITIVITIES)
    assert Counter(r["kind"] for r in rows) == {
        "paraphrase": 14,
        "implicit_sensitive": 14,
        "mixed_topic": 14,
        "injection": 14,
        "adversarial_public": 14,
    }
    assert len({r["id"] for r in rows}) == len({r["text"] for r in rows}) == 70
