import json
from pathlib import Path
from prompt_insights import bench
from test_api import same_shape

CONTRACT = json.loads((Path(__file__).parent / "fixtures/metrics-contract.json").read_text())


def test_metrics_endpoint_matches_frontend_mock(client):
    from prompt_insights import api

    api.metrics.cache_clear()
    body = client.get("/metrics").json()
    api.metrics.cache_clear()
    same_shape(
        {k: v for k, v in body.items() if k != "models"},
        {k: v for k, v in CONTRACT.items() if k != "models"},
    )
    for model in body["models"]:
        same_shape(model, CONTRACT["models"][0])
    assert [m["model"] for m in body["models"]] == ["keyword", "knn"]
    assert body["n"] == 70 and body["benchmark"]["frozenAt"].endswith("Z")


def test_confidential_recall_and_false_negatives_are_counted():
    rows, _ = bench.load_benchmark()
    confidential = sum(r["sensitivity"] == "confidential" for r in rows)
    never = bench.score_model("x", "v", lambda text: ("other", "public"), rows)[0]
    always = bench.score_model("x", "v", lambda text: ("other", "confidential"), rows)[0]
    assert never["confidentialFalseNegatives"] == confidential and never["confidentialRecall"] == 0
    assert always["confidentialFalseNegatives"] == 0 and always["confidentialRecall"] == 1
    assert sum(map(sum, never["sensitivityConfusion"]["matrix"])) == 70
