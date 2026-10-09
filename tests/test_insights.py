import json
import pytest
from prompt_insights.core import generate, split, classify, evaluate, aggregate
from prompt_insights.providers import classify_prompt


def test_fresh_balanced_family_disjoint_corpus():
    rows = generate()
    assert len(rows) == 280 and len({r["id"] for r in rows}) == 280
    assert len({r["topic"] for r in rows}) == 7
    train, validation = split(rows)
    assert len(train) == 210 and len(validation) == 70
    assert not {r["template_family"] for r in train} & {r["template_family"] for r in validation}
    assert generate() == rows


def test_abstains_and_word_boundaries_and_multi_topic():
    assert classify("") == "other"
    assert classify("The manuscript is ready") == "other"
    assert classify("Debug this python function") == "coding"
    assert classify("python contract") == "other"


def test_evaluation_has_denominators_and_aggregates_no_prompt_text():
    result = evaluate(generate())
    assert result["validation"]["samples"] == 70
    assert result["validation"]["accuracy"] > 0.5
    summary = aggregate(generate())
    assert sum(summary.values()) == 280
    assert "text" not in json.dumps(summary)


def test_provider_mock_and_explicit_live_gate(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert classify_prompt("Debug python")["topic"] == "coding"
    with pytest.raises(ValueError, match="explicit"):
        classify_prompt("Debug python", mode="openai")
    with pytest.raises(ValueError, match="configured"):
        classify_prompt("Debug python", mode="openai", allow_live=True)
    with pytest.raises(ValueError):
        classify_prompt("x" * 16001)


def test_live_mock_transport_validates_result_and_does_not_expose_errors(monkeypatch):
    import httpx

    monkeypatch.setenv("OPENAI_API_KEY", "test-only-key")
    monkeypatch.setenv("OPENAI_MODEL", "configured-test-model")
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": '{"topic":"legal","sensitivity":"public"}'}}]
            },
        )
    )
    assert (
        classify_prompt("review a contract", mode="openai", allow_live=True, transport=transport)[
            "topic"
        ]
        == "legal"
    )
    invalid = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"topic":"secret","sensitivity":"public","prompt":"leak"}'
                        }
                    }
                ]
            },
        )
    )
    with pytest.raises(ValueError, match="invalid topic"):
        classify_prompt("hello", mode="openai", allow_live=True, transport=invalid)


def test_anthropic_mock_transport(monkeypatch):
    import httpx

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-only-key")
    monkeypatch.setenv("ANTHROPIC_MODEL", "configured-test-model")
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={
                "stop_reason": "end_turn",
                "content": [
                    {"type": "text", "text": '{"topic": "writing", "sensitivity": "internal"}'}
                ],
            },
        )
    )
    assert (
        classify_prompt("draft", mode="anthropic", allow_live=True, transport=transport)["topic"]
        == "writing"
    )


def test_approved_taxonomy_sensitivity_labels_and_evaluation():
    from prompt_insights.core import TOPICS, classify_sensitivity

    assert set(TOPICS) == {
        "coding",
        "writing",
        "data_analysis",
        "customer_email",
        "legal",
        "hr",
        "other",
    }
    rows = generate()
    assert {r["sensitivity"] for r in rows} == {"public", "internal", "confidential"}
    assert classify_sensitivity("A public fictional exercise") == "public"
    assert classify_sensitivity("internal planning notes") == "internal"
    assert classify_sensitivity("confidential fake account details") == "confidential"
    assert classify_prompt("confidential python code")["sensitivity"] == "confidential"
    report = evaluate(rows)
    assert report["sensitivity"]["validation"]["samples"] == 70
    assert "macro_f1" in report["sensitivity"]["validation"]


def test_shipped_corpus_schema_and_generation_match():
    from pathlib import Path
    from jsonschema import Draft202012Validator

    root = Path(__file__).parents[1]
    schema = json.loads((root / "schemas/prompt.schema.json").read_text())
    rows = [json.loads(line) for line in (root / "data/prompts.ndjson").read_text().splitlines()]
    assert rows == generate()
    for row in rows:
        Draft202012Validator(schema).validate(row)
    assert "sensitivity" in schema["required"]
