import json

import pytest

from prompt_insights import ask, providers

QUESTIONS = ("overview", "problems", "risks", "support")
KEYS = {
    "team",
    "days",
    "question",
    "questionText",
    "start",
    "asOf",
    "prompts",
    "topics",
    "severity",
    "problemPrompts",
    "problemsByTopic",
    "reasons",
    "minGroupSize",
    "summary",
    "source",
    "notice",
    "modelVersion",
    "latencyMs",
    "costUsd",
    "inputTokens",
    "outputTokens",
}


def post(client, **body):
    return client.post(
        "/ask", json=dict(dict(question="overview", team="engineering", days=7), **body)
    )


@pytest.fixture
def no_paid_calls(monkeypatch):
    def refuse(*args, **kwargs):
        raise AssertionError("paid LLM call without allowLlm")

    monkeypatch.setattr(ask, "request_structured", refuse)


@pytest.fixture
def anthropic_configured(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-only-key")
    monkeypatch.setenv("ANTHROPIC_MODEL", "configured-test-model")


@pytest.mark.parametrize("question", QUESTIONS)
def test_every_preset_question_gets_a_rule_based_answer(client, no_paid_calls, question):
    body = post(client, question=question).json()
    assert set(body) == KEYS
    assert body["source"] == "rules" and body["notice"] is None and body["costUsd"] is None
    assert body["questionText"] == ask.QUESTIONS[question]
    assert body["summary"]["overview"]
    assert sum(body["severity"].values()) == body["prompts"] >= 10


def test_answers_never_contain_user_ids(client):
    for team in ("engineering", "sales", "finance", "legal", "people"):
        text = json.dumps(post(client, team=team).json())
        assert "-user-" not in text


def test_free_text_questions_and_bad_inputs_are_rejected(client):
    assert post(client, question="Who pasted the API key?").status_code == 422
    assert post(client, days=0).status_code == 422
    assert post(client, days=ask.MAX_DAYS + 1).status_code == 422
    assert post(client, extra=1).status_code == 422
    assert post(client, team="no-such-team").status_code == 404


def test_small_groups_are_refused_not_described(client):
    responses = [post(client, team=t, days=1) for t in ("legal", "people", "finance")]
    refused = [r for r in responses if r.status_code == 422]
    assert refused, "expected at least one team below the thresholds on a 1-day window"
    assert "Too few prompts or people" in refused[0].json()["detail"]


def test_llm_requested_without_a_provider_falls_back_and_says_so(client, no_paid_calls):
    body = post(client, allowLlm=True).json()
    assert body["source"] == "rules" and "No LLM is configured" in body["notice"]


def test_llm_summary_uses_redacted_aggregate_input_only(client, anthropic_configured, monkeypatch):
    seen = {}

    def fake(system, payload, schema, mode, allow_live=False, transport=None):
        assert allow_live is True and mode == "anthropic"
        seen["payload"] = json.loads(payload)
        answer = dict(
            overview="Mostly coding.",
            themes=["Debugging services", " ", "a", "b", "c", "d"],
            problems=["Deploy errors"],
            risks=["Keys pasted"],
            suggestions=[],
        )
        return dict(
            content=json.dumps(answer),
            model="m",
            input_tokens=900,
            output_tokens=120,
            latency_ms=812.3,
        )

    monkeypatch.setattr(ask, "request_structured", fake)
    body = post(client, allowLlm=True, question="problems").json()
    assert body["source"] == "llm" and body["modelVersion"] == "anthropic:m"
    assert body["summary"]["themes"] == [
        "Debugging services",
        "a",
        "b",
        "c",
    ]  # blanks dropped, max 4
    assert body["inputTokens"] == 900 and body["costUsd"] is None  # no price configured
    sent = seen["payload"]
    assert sent["question"] == ask.QUESTIONS["problems"]
    assert len(sent["untrusted_prompt_sample"]) <= ask.MAX_SAMPLE
    assert "-user-" not in json.dumps(sent)  # no user ids reach the provider


def test_llm_failure_falls_back_to_rules(client, anthropic_configured, monkeypatch):
    def broken(*args, **kwargs):
        raise ValueError("provider down")

    monkeypatch.setattr(ask, "request_structured", broken)
    body = post(client, allowLlm=True).json()
    assert body["source"] == "rules" and "LLM call failed" in body["notice"]


def test_configured_provider_is_used_by_the_endpoint(anthropic_configured):
    assert providers.configured_provider() == "anthropic"
