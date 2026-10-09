import json
import pytest
from fastapi.testclient import TestClient
from prompt_insights import api, security

ENGINEERING = "engineering-admin-token-0123456789"
SALES = "sales-admin-token-0123456789"
BODY = dict(question="overview", days=28)


@pytest.fixture
def admins(client, monkeypatch):
    """Real admin check: one token per department."""
    api.app.dependency_overrides.clear()
    monkeypatch.setenv("PI_ADMIN_TOKENS", f"engineering:{ENGINEERING},sales:{SALES}")

    def as_admin(token):
        return TestClient(api.app, headers={"Authorization": f"Bearer {token}"})

    return as_admin


def test_admin_sees_only_their_own_department(admins):
    engineering = admins(ENGINEERING)
    assert engineering.get("/ask/teams").json() == {"teams": ["engineering"]}
    assert engineering.post("/ask", json=dict(BODY, team="engineering")).status_code == 200
    assert engineering.post("/ask", json=dict(BODY, team="sales")).status_code == 403
    assert admins(SALES).post("/ask", json=dict(BODY, team="sales")).status_code == 200


def test_missing_or_wrong_admin_token_is_refused(admins):
    assert TestClient(api.app).post("/ask", json=dict(BODY, team="sales")).status_code == 401
    assert TestClient(api.app).get("/ask/teams").status_code == 401
    wrong = admins("not-a-real-admin-token-at-all")
    assert wrong.post("/ask", json=dict(BODY, team="sales")).status_code == 401


def test_reviewer_token_is_not_an_admin_token(admins):
    from conftest import REVIEWER_TOKEN

    reviewer = admins(REVIEWER_TOKEN)
    assert reviewer.post("/ask", json=dict(BODY, team="engineering")).status_code == 401


def test_no_admin_tokens_blocks_insights_except_in_development(client, monkeypatch):
    api.app.dependency_overrides.clear()
    monkeypatch.delenv("PI_ADMIN_TOKENS", raising=False)
    assert client.post("/ask", json=dict(BODY, team="sales")).status_code == 503
    monkeypatch.setenv("PI_ENV", "development")
    assert len(client.get("/ask/teams").json()["teams"]) == 5
    assert client.post("/ask", json=dict(BODY, team="sales")).status_code == 200


def test_every_question_is_audited_without_text(admins):
    admins(ENGINEERING).post("/ask", json=dict(BODY, team="engineering", question="risks"))
    entry = json.loads(security.AUDIT.read_text().splitlines()[-1])
    assert entry["action"] == "ask" and entry["reviewer"] == "admin:engineering"
    assert entry["itemId"] == "engineering"
    assert entry["after"] == dict(question="risks", days=28, source="rules")
