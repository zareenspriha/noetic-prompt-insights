import json
from fastapi.testclient import TestClient
from prompt_insights import api, security
from conftest import REVIEWER_TOKEN


def correction(client):
    item = client.get("/review").json()[0]
    return dict(itemId=item["id"], topic="legal", sensitivity="internal")


def test_feedback_needs_a_valid_reviewer_token(client):
    body = correction(client)
    anonymous = TestClient(api.app)
    assert anonymous.post("/feedback", json=body).status_code == 401
    wrong = {"Authorization": "Bearer not-the-right-token-at-all"}
    assert anonymous.post("/feedback", json=body, headers=wrong).status_code == 401
    assert anonymous.post("/feedback/undo", json={"undoToken": "x"}).status_code == 401
    assert client.post("/feedback", json=body).status_code == 200


def test_no_tokens_configured_blocks_corrections_except_in_development(client, monkeypatch):
    body = correction(client)
    monkeypatch.delenv("PI_REVIEWER_TOKENS")
    assert client.post("/feedback", json=body).status_code == 503
    monkeypatch.setenv("PI_ENV", "development")
    assert client.post("/feedback", json=body).status_code == 200
    assert json.loads(security.AUDIT.read_text().splitlines()[-1])["reviewer"] == "local-dev"


def test_short_or_malformed_tokens_are_never_accepted(monkeypatch):
    monkeypatch.setenv("PI_REVIEWER_TOKENS", "a:short, nocolon, b:" + "x" * 20 + ", :" + "y" * 20)
    assert security.reviewer_tokens() == {"x" * 20: "b"}


def test_audit_log_records_who_and_what_without_text_or_tokens(client):
    body = correction(client)
    response = client.post("/feedback", json=body).json()
    client.post("/feedback/undo", json={"undoToken": response["undoToken"]})
    entries = [json.loads(line) for line in security.AUDIT.read_text().splitlines()]
    assert [e["action"] for e in entries] == ["correct", "undo"]
    assert all(e["reviewer"] == "tester" and e["itemId"] == body["itemId"] for e in entries)
    assert entries[0]["after"] == dict(topic="legal", sensitivity="internal")
    assert entries[1]["before"] == entries[0]["after"]
    text = api.classifiable()[body["itemId"]]["prompt_redacted"]
    raw = security.AUDIT.read_text()
    assert REVIEWER_TOKEN not in raw and text not in raw


def test_only_the_same_reviewer_can_undo(client, monkeypatch):
    other = "other-reviewer-token-0123456789"
    monkeypatch.setenv("PI_REVIEWER_TOKENS", f"tester:{REVIEWER_TOKEN},other:{other}")
    undo = client.post("/feedback", json=correction(client)).json()["undoToken"]
    stranger = TestClient(api.app, headers={"Authorization": f"Bearer {other}"})
    assert stranger.post("/feedback/undo", json={"undoToken": undo}).status_code == 404
    assert client.post("/feedback/undo", json={"undoToken": undo}).status_code == 200


def test_api_docs_are_hidden_outside_development(client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404
