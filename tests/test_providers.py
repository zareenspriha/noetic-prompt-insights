import json
from pathlib import Path
import httpx
import pytest
from prompt_insights import providers
from prompt_insights.core import classify, classify_sensitivity
from prompt_insights.providers import (
    cost_usd,
    dataset_fingerprint,
    estimate_cost_usd,
    evaluate_provider,
    llm_prediction,
)
from prompt_insights.transport import request_json, request_structured

ROOT = Path(__file__).parents[1]
SECRET = "sk-live-0123456789abcdefghij"
PAYLOAD = json.dumps({"untrusted_prompt": "hello"})


@pytest.fixture
def live(monkeypatch):
    for mode in ("OPENAI", "ANTHROPIC"):
        monkeypatch.setenv(f"{mode}_API_KEY", "test-only-key")
        monkeypatch.setenv(f"{mode}_MODEL", "configured-test-model")
        monkeypatch.delenv(f"{mode}_PRICE_IN_PER_MTOK", raising=False)
        monkeypatch.delenv(f"{mode}_PRICE_OUT_PER_MTOK", raising=False)


def prompt_sent(request):
    body = json.loads(request.content)
    message = body["messages"][-1]["content"]
    return json.loads(message)["untrusted_prompt"]


def openai(answer=None, usage=True, seen=None):
    """Mock OpenAI that answers with the keyword baseline unless `answer` is given."""

    def handler(request):
        text = prompt_sent(request)
        if seen is not None:
            seen.append(request.content.decode())
        content = answer or dict(topic=classify(text), sensitivity=classify_sensitivity(text))
        body = dict(
            model="provider-model-2026-10-01",
            choices=[dict(message=dict(content=json.dumps(content)))],
        )
        if usage:
            body["usage"] = dict(prompt_tokens=120, completion_tokens=15)
        return httpx.Response(200, json=body)

    return httpx.MockTransport(handler)


def anthropic(seen=None):
    def handler(request):
        if seen is not None:
            seen.append(request.content.decode())
        return httpx.Response(
            200,
            json=dict(
                model="claude-test-snapshot",
                usage=dict(input_tokens=300, output_tokens=40),
                content=[
                    dict(
                        type="tool_use",
                        name="submit_result",
                        input=dict(topic="legal", sensitivity="confidential"),
                    )
                ],
            ),
        )

    return httpx.MockTransport(handler)


def test_transport_reports_measured_usage_model_and_latency(live):
    result = request_structured("s", PAYLOAD, {}, "openai", True, openai({"topic": "hr"}))
    assert result["model"] == "provider-model-2026-10-01"
    assert (result["input_tokens"], result["output_tokens"]) == (120, 15)
    assert result["latency_ms"] >= 0
    result = request_structured("s", PAYLOAD, {}, "anthropic", True, anthropic())
    assert (result["model"], result["input_tokens"], result["output_tokens"]) == (
        "claude-test-snapshot",
        300,
        40,
    )
    # The old string-returning entry point is unchanged for existing callers.
    assert json.loads(request_json("s", PAYLOAD, {}, "openai", True, openai({"topic": "hr"}))) == {
        "topic": "hr"
    }


def test_missing_or_malformed_usage_is_none_not_guessed(live):
    result = request_structured("s", PAYLOAD, {}, "openai", True, openai({"a": 1}, usage=False))
    assert result["input_tokens"] is None and result["output_tokens"] is None
    weird = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json=dict(
                usage=dict(prompt_tokens=-3, completion_tokens=True),
                choices=[dict(message=dict(content="{}"))],
            ),
        )
    )
    result = request_structured("s", PAYLOAD, {}, "openai", True, weird)
    assert result["input_tokens"] is None and result["output_tokens"] is None
    assert result["model"] == "configured-test-model"


@pytest.mark.parametrize("mode,transport", [("openai", openai), ("anthropic", anthropic)])
def test_provider_only_ever_sees_redacted_text(live, mode, transport):
    seen = []
    text = f"Why does Client(api_key='{SECRET}') fail? Email bob@example.com"
    llm_prediction(text, mode, True, transport(seen=seen))
    providers.classify_prompt(text, mode=mode, allow_live=True, transport=transport(seen=seen))
    assert len(seen) == 2
    for body in seen:
        assert SECRET not in body and "bob@example.com" not in body
        assert "[API_KEY]" in body and "[EMAIL]" in body


def test_prediction_matches_frontend_contract_except_rule_based_severity(live, monkeypatch):
    contract = json.loads((ROOT / "tests/fixtures/classify-contract.json").read_text())["llm"]
    result = llm_prediction("Review this contract clause", "anthropic", True, anthropic())
    assert set(result) == set(contract) - {"severity"}
    assert result["model"] == "llm" and result["modelVersion"] == "anthropic:claude-test-snapshot"
    assert (result["inputTokens"], result["outputTokens"]) == (300, 40)
    assert result["costUsd"] is None  # no price configured: unknown, not zero
    monkeypatch.setenv("ANTHROPIC_PRICE_IN_PER_MTOK", "3")
    monkeypatch.setenv("ANTHROPIC_PRICE_OUT_PER_MTOK", "15")
    result = llm_prediction("Review this contract clause", "anthropic", True, anthropic())
    assert result["costUsd"] == pytest.approx((300 * 3 + 40 * 15) / 1_000_000)


def test_invalid_answers_and_missing_approval_are_rejected(live):
    with pytest.raises(ValueError, match="invalid topic"):
        llm_prediction("hi", "openai", True, openai({"topic": "secret", "sensitivity": "public"}))
    with pytest.raises(ValueError, match="explicit"):
        llm_prediction("hi", "openai", False, openai())
    with pytest.raises(ValueError):
        llm_prediction("x" * 16001, "openai", True, openai())


@pytest.mark.parametrize("price", ["", "abc", "-1", "nan", "inf"])
def test_bad_or_missing_prices_give_unknown_cost(monkeypatch, price):
    monkeypatch.setenv("OPENAI_PRICE_IN_PER_MTOK", price)
    monkeypatch.setenv("OPENAI_PRICE_OUT_PER_MTOK", "1")
    assert cost_usd("openai", 100, 10) is None
    assert estimate_cost_usd("hello", "openai") is None


def test_cost_estimate_needs_a_price_and_ignores_mock(monkeypatch):
    assert estimate_cost_usd("hello", "mock") is None
    monkeypatch.setenv("OPENAI_PRICE_IN_PER_MTOK", "1")
    monkeypatch.setenv("OPENAI_PRICE_OUT_PER_MTOK", "1")
    assert 0 < estimate_cost_usd("hello", "openai") < 0.001
    assert cost_usd("openai", None, 10) is None


def benchmark_rows():
    return [json.loads(line) for line in (ROOT / "data/prompts.ndjson").read_text().splitlines()]


def test_evaluate_provider_reports_quality_latency_tokens_and_cost_separately(live, monkeypatch):
    monkeypatch.setenv("OPENAI_PRICE_IN_PER_MTOK", "1")
    monkeypatch.setenv("OPENAI_PRICE_OUT_PER_MTOK", "2")
    rows = [dict(r, kind=r["template_family"]) for r in benchmark_rows()[:20]]
    report = evaluate_provider(rows, "openai", True, openai())
    assert (report["rows"], report["answered"], report["failed"]) == (20, 20, 0)
    assert report["modelVersions"] == ["openai:provider-model-2026-10-01"]
    assert report["quality"]["sensitivity"]["samples"] == 20
    assert report["quality"]["confidentialFalseNegatives"] == 0
    assert set(report["quality"]["topicAccuracyByKind"]) == {r["kind"] for r in rows}
    assert report["tokens"] == dict(input=2400, output=300, source="provider-reported usage")
    assert report["costUsd"]["total"] == pytest.approx((2400 + 2 * 300) / 1_000_000)
    assert report["latencyMs"]["p50"] is not None


def test_topic_only_sets_skip_sensitivity_and_unknown_cost_stays_none(live):
    rows = [dict(id=f"d{i}", text="Debug my python function", topic="coding") for i in range(3)]
    report = evaluate_provider(rows, "openai", True, openai())
    assert report["quality"]["topic"]["accuracy"] == 1.0
    assert report["quality"]["sensitivity"] is None
    assert (
        report["costUsd"]["total"] is None and report["costUsd"]["source"] == "price not configured"
    )


def test_evaluate_provider_refuses_before_any_call_and_stops_on_repeated_failures(live):
    calls = []
    counting = httpx.MockTransport(lambda request: calls.append(1) or httpx.Response(500))
    rows = benchmark_rows()[:20]
    with pytest.raises(ValueError, match="explicit"):
        evaluate_provider(rows, "openai", False, counting)
    assert calls == []
    with pytest.raises(ValueError, match="consecutive"):
        evaluate_provider(rows, "openai", True, counting, max_failures=3)
    assert len(calls) == 3  # no retries, no running through the whole paid set


def test_frozen_set_fingerprint_must_match_meta():
    assert dataset_fingerprint(b"abc") == dataset_fingerprint(b"abc", None)
    digest = dataset_fingerprint(b"abc")
    assert dataset_fingerprint(b"abc", {"sha256": digest}) == digest
    with pytest.raises(ValueError, match="changed"):
        dataset_fingerprint(b"abd", {"sha256": digest})


def test_eval_provider_cli_requires_yes_and_unchanged_frozen_file(tmp_path, live, monkeypatch):
    from prompt_insights.__main__ import main

    data = tmp_path / "set.ndjson"
    data.write_text("".join(json.dumps(dict(r, split="test")) + "\n" for r in benchmark_rows()[:4]))
    out = tmp_path / "eval.json"
    args = ["eval-provider", "--input", str(data), "--mode", "openai", "--out", str(out)]
    with pytest.raises(SystemExit) as refused:
        main(args)
    assert refused.value.code == 2 and not out.exists()

    real = providers.llm_prediction
    monkeypatch.setattr(
        providers, "llm_prediction", lambda text, mode, allow, _: real(text, mode, allow, openai())
    )
    assert main(args + ["--yes", "--split", "test"]) == 0
    report = json.loads(out.read_text())
    assert report["answered"] == 4 and report["dataset"]["frozen"] is False

    (tmp_path / "set.meta.json").write_text(json.dumps({"sha256": "not-the-real-hash"}))
    with pytest.raises(SystemExit) as changed:
        main(args + ["--yes"])
    assert changed.value.code == 2
