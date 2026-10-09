import json
from prompt_insights import api
from test_api_llm import fake_llm

SECRET = "sk-live-0123456789abcdefghij"
TEXT = f"Why does Client(api_key='{SECRET}') fail when I deploy?"


def classify(client, text=TEXT, allow_llm=True):
    return client.post("/classify", json={"text": text, "allowLlm": allow_llm}).json()


def playground(queue):
    return [item for item in queue if item["id"].startswith("playground-")]


def test_disagreement_from_classify_appears_first_in_the_review_queue(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-only-key")
    monkeypatch.setenv("ANTHROPIC_MODEL", "configured-test-model")
    fake_llm(monkeypatch, "legal", "public")  # k-NN never says legal for this prompt
    body = classify(client)
    assert body["agree"] is False and body["needsReview"] is True
    queue = client.get("/review").json()
    [item] = playground(queue)
    assert queue[0] == item  # newest playground items come first
    assert item["reason"] == "disagreement"
    assert item["llm"]["topic"] == "legal" and item["knn"]["model"] == "knn"
    assert "neighbors" not in item["knn"]
    assert SECRET not in json.dumps(queue) and "[API_KEY]" in item["textRedacted"]


def test_unsure_knn_is_queued_without_an_llm_answer(client, monkeypatch):
    monkeypatch.setattr(api, "LOW_SIMILARITY", 2.0)  # every prompt counts as unfamiliar
    assert classify(client, allow_llm=False)["needsReview"] is True
    [item] = playground(client.get("/review").json())
    assert item["reason"] == "low_similarity" and item["llm"] is None


def test_confident_agreeing_prompts_are_not_queued(client, monkeypatch):
    monkeypatch.setattr(api, "LOW_SIMILARITY", -1.0)  # nothing counts as unfamiliar
    assert classify(client, allow_llm=False)["needsReview"] is False
    assert playground(client.get("/review").json()) == []


def test_the_same_prompt_twice_is_queued_once(client, monkeypatch):
    monkeypatch.setattr(api, "LOW_SIMILARITY", 2.0)
    classify(client, allow_llm=False)
    classify(client, allow_llm=False)
    assert len(playground(client.get("/review").json())) == 1


def test_correcting_a_playground_item_teaches_knn_in_memory_and_can_be_undone(
    client, monkeypatch, tmp_path
):
    monkeypatch.setattr(api, "LOW_SIMILARITY", 2.0)
    classify(client, allow_llm=False)
    [item] = playground(client.get("/review").json())
    before = len(api.index()["topic"].ids)
    response = client.post(
        "/feedback", json=dict(itemId=item["id"], topic="coding", sensitivity="confidential")
    ).json()
    assert response["ok"] and response["indexSize"] == before + 1
    assert playground(client.get("/review").json()) == []  # corrected: off the queue
    # Playground text is never written to disk, not even into the corrections file.
    for path in tmp_path.rglob("*"):
        if path.is_file():
            assert "Client(api_key" not in path.read_text(errors="ignore")
    undone = client.post("/feedback/undo", json=dict(undoToken=response["undoToken"])).json()
    assert undone["indexSize"] == before
    assert [i["id"] for i in playground(client.get("/review").json())] == [item["id"]]


def test_playground_queue_is_capped(client, monkeypatch):
    monkeypatch.setattr(api, "LOW_SIMILARITY", 2.0)
    monkeypatch.setattr(api, "PLAYGROUND_LIMIT", 3)
    for n in range(5):
        classify(client, text=f"Debug my python function number {n}", allow_llm=False)
    items = playground(client.get("/review").json())
    assert len(items) == 3 and "number 4" in items[0]["textRedacted"]
