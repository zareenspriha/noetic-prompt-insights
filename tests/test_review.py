import json
from pathlib import Path
from prompt_insights import api
from test_api import same_shape

CONTRACT = json.loads((Path(__file__).parent / "fixtures/review-contract.json").read_text())


def test_review_queue_matches_frontend_mock_and_masks_secrets(client):
    queue = client.get("/review").json()
    assert 0 < len(queue) <= api.REVIEW_LIMIT
    for item in queue:
        same_shape(item, CONTRACT[0])
        assert item["reason"] in {"low_similarity", "flagged"} and item["llm"] is None
    texts = [item["textRedacted"] for item in queue]
    assert len(texts) == len(set(texts))  # repeats of a prompt are shown once
    reasons = [item["reason"] for item in queue]
    assert reasons == sorted(reasons, key=["flagged", "low_similarity"].index)
    for secret in ("sk-test-FAKE", "Demo-Only-123", "078-05-1120", "pat.example@", "4242 4242"):
        assert secret not in json.dumps(queue)


def test_feedback_teaches_the_index_updates_the_report_and_can_be_undone(client):
    item = client.get("/review").json()[0]
    before = len(api.index()["topic"].ids)
    response = client.post(
        "/feedback", json=dict(itemId=item["id"], topic="legal", sensitivity="internal")
    ).json()
    assert response["ok"] and response["correctionsTotal"] == 1
    assert response["indexSize"] == before + 1
    assert item["id"] not in {i["id"] for i in client.get("/review").json()}
    assert api.event_labels("knn")[item["id"]]["topic"] == "legal"

    saved = json.loads(api.CORRECTIONS.read_text())
    assert saved == {item["id"]: dict(topic="legal", sensitivity="internal")}  # no prompt text

    undone = client.post("/feedback/undo", json=dict(undoToken=response["undoToken"])).json()
    assert undone == dict(ok=True, indexSize=before, correctionsTotal=0)
    assert json.loads(api.CORRECTIONS.read_text()) == {}
    assert (
        client.post("/feedback/undo", json=dict(undoToken=response["undoToken"])).status_code == 404
    )


def test_corrections_survive_a_restart(client):
    item_id = client.get("/review").json()[0]["id"]
    client.post("/feedback", json=dict(itemId=item_id, topic="hr", sensitivity="public"))
    for cached in (api.index, api.corrections):
        cached.cache_clear()  # simulate a fresh process reading the saved file
    assert api.event_labels("knn")[item_id]["topic"] == "hr"
    assert f"feedback-{item_id}" in api.index()["topic"].ids


def test_feedback_rejects_unknown_items_and_labels(client):
    ok = dict(itemId="demo-event-0", topic="coding", sensitivity="public")
    assert client.post("/feedback", json={**ok, "itemId": "nope"}).status_code == 404
    assert client.post("/feedback", json={**ok, "topic": "sports"}).status_code == 422
    assert client.post("/feedback", json={**ok, "sensitivity": "secret"}).status_code == 422
    assert client.post("/feedback", json={**ok, "extra": 1}).status_code == 422
