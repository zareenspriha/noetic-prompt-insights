import json
import pytest
from prompt_insights import api, providers
from prompt_insights.gateway import parse_ndjson
from prompt_insights.providers import label_events
from test_api import CONTRACT, same_shape
from test_providers import openai


@pytest.fixture
def anthropic_configured(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-only-key")
    monkeypatch.setenv("ANTHROPIC_MODEL", "configured-test-model")
    monkeypatch.delenv("ANTHROPIC_PRICE_IN_PER_MTOK", raising=False)
    monkeypatch.delenv("ANTHROPIC_PRICE_OUT_PER_MTOK", raising=False)


def fake_llm(monkeypatch, topic, sensitivity, calls=None):
    def answer(text, mode, allow_live, transport=None):
        assert allow_live is True and mode == "anthropic"
        if calls is not None:
            calls.append(text)
        return dict(
            model="llm",
            topic=topic,
            sensitivity=sensitivity,
            latencyMs=812.0,
            costUsd=None,
            inputTokens=140,
            outputTokens=18,
            modelVersion="anthropic:test-model",
        )

    monkeypatch.setattr(providers, "llm_prediction", answer)


def test_no_paid_call_without_allow_llm(client, anthropic_configured, monkeypatch):
    calls = []
    fake_llm(monkeypatch, "coding", "public", calls)
    body = client.post("/classify", json={"text": "Debug this python function"}).json()
    assert calls == [] and body["llm"] is None and body["agree"] is None


def test_llm_answer_matches_contract_and_rules_set_severity(
    client, anthropic_configured, monkeypatch
):
    fake_llm(monkeypatch, "coding", "public")
    text = "Why does Client(api_key='sk-live-0123456789abcdefghij') fail in python?"
    body = client.post("/classify", json={"text": text, "allowLlm": True}).json()
    same_shape(body, CONTRACT)
    # The LLM said public, but a key is present: rules raise it and set severity.
    assert body["llm"]["sensitivity"] == "confidential"
    assert body["llm"]["severity"] == "critical"
    assert body["llm"]["modelVersion"] == "anthropic:test-model"
    assert body["agree"] is (body["knn"]["topic"] == "coding")
    assert body["llmCostEstimateUsd"] is None  # no price configured: unknown, not free


def test_disagreement_sends_to_review(client, anthropic_configured, monkeypatch):
    fake_llm(monkeypatch, "legal", "public")
    body = client.post(
        "/classify", json={"text": "Debug this python function", "allowLlm": True}
    ).json()
    assert body["knn"]["topic"] != "legal"  # the fake LLM says legal, so they disagree
    assert body["agree"] is False and body["needsReview"] is True


def test_provider_failure_is_a_clean_502(client, anthropic_configured, monkeypatch):
    def broken(*args, **kwargs):
        raise ValueError("Provider request failed or returned an invalid structured result")

    monkeypatch.setattr(providers, "llm_prediction", broken)
    response = client.post("/classify", json={"text": "hi there", "allowLlm": True})
    assert response.status_code == 502 and "test-only-key" not in response.text


def test_cost_estimate_appears_once_a_price_is_configured(
    client, anthropic_configured, monkeypatch
):
    monkeypatch.setenv("ANTHROPIC_PRICE_IN_PER_MTOK", "1")
    monkeypatch.setenv("ANTHROPIC_PRICE_OUT_PER_MTOK", "5")
    body = client.post("/classify", json={"text": "Debug this python function"}).json()
    assert 0 < body["llmCostEstimateUsd"] < 0.01


def test_provider_choice(monkeypatch):
    for name in ("PI_LLM_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert providers.configured_provider() is None
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("OPENAI_MODEL", "m")
    assert providers.configured_provider() == "openai"
    monkeypatch.setenv("PI_LLM_PROVIDER", "anthropic")
    assert providers.configured_provider() is None  # asked for anthropic, which has no key


def save_labels(path, labels):
    path.write_text(json.dumps(dict(mode="anthropic", labels=labels)))


def test_report_uses_saved_llm_labels_and_never_calls_the_provider(client, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("GET /report/weekly must not make a paid call")

    monkeypatch.setattr(providers, "llm_prediction", forbidden)
    ids = list(api.classifiable())
    save_labels(api.LLM_LABELS, {i: dict(topic="writing", sensitivity="public") for i in ids})
    body = client.get("/report/weekly?model=llm").json()
    assert body["kpis"]["topTopic"]["value"] == "writing"

    save_labels(api.LLM_LABELS, {i: dict(topic="writing", sensitivity="public") for i in ids[1:]})
    assert client.get("/report/weekly?model=llm").status_code == 409  # incomplete
    save_labels(api.LLM_LABELS, {i: dict(topic="nonsense", sensitivity="public") for i in ids})
    assert client.get("/report/weekly?model=llm").status_code == 409  # invalid label
    api.LLM_LABELS.write_text("not json")
    assert client.get("/report/weekly?model=llm").status_code == 409


def test_label_events_calls_once_per_distinct_text_and_keeps_no_text(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-key")
    monkeypatch.setenv("OPENAI_MODEL", "configured-test-model")
    events = parse_ndjson(open("data/demo-events.ndjson", "rb").read())[:60]
    calls = []
    transport = openai()
    real = transport.handle_request

    def counting(request):
        calls.append(1)
        return real(request)

    transport.handle_request = counting
    result = label_events(events, "openai", True, transport)
    eligible = [e for e in events if e["status"] == "succeeded" and e.get("prompt_redacted")]
    assert len(calls) == result["calls"] == len({e["prompt_redacted"] for e in eligible})
    assert set(result["labels"]) == {e["event_id"] for e in eligible}
    dumped = json.dumps(result)
    assert not any(e["prompt_redacted"] in dumped for e in eligible)
    with pytest.raises(ValueError, match="explicit"):
        label_events(events, "openai", False, transport)


def test_label_events_cli_requires_yes(tmp_path):
    from prompt_insights.__main__ import main

    out = tmp_path / "labels.json"
    with pytest.raises(SystemExit) as refused:
        main(["label-events", "--mode", "openai", "--out", str(out)])
    assert refused.value.code == 2 and not out.exists()
