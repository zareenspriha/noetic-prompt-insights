import json
from pathlib import Path
from prompt_insights import api

# Copy of web/mocks/classify.json: the frontend's agreed response shape.
CONTRACT = json.loads((Path(__file__).parent / "fixtures/classify-contract.json").read_text())


def keys(value):
    return set(value) if isinstance(value, dict) else set()


def test_classify_matches_frontend_contract(client):
    response = client.post(
        "/classify", json={"text": "Debug this python function", "allowLlm": False}
    )
    assert response.status_code == 200
    body = response.json()
    assert keys(body) == keys(CONTRACT)
    assert keys(body["knn"]) == keys(CONTRACT["knn"])
    assert keys(body["knn"]["neighbors"][0]) == keys(CONTRACT["knn"]["neighbors"][0])
    assert len(body["knn"]["neighbors"]) == api.K
    assert body["knn"]["model"] == "knn" and body["llm"] is None and body["agree"] is None


def test_classify_masks_secrets_everywhere_and_raises_severity(client):
    text = "Why does this fail? client = OpenAI(api_key='sk-proj-abcDEF1234567890xyzABCD')"
    body = client.post("/classify", json={"text": text, "allowLlm": False}).json()
    assert "sk-proj" not in json.dumps(body)
    assert body["knn"]["severity"] == "critical"
    assert body["knn"]["sensitivity"] == "confidential"
    assert body["riskSpans"][0]["kind"] == "api_key"


def test_classify_rejects_bad_input_and_unconfigured_llm(client):
    assert client.post("/classify", json={"text": "", "allowLlm": False}).status_code == 422
    assert client.post("/classify", json={"text": "x" * 16001}).status_code == 422
    assert client.post("/classify", json={"text": "hi", "extra": 1}).status_code == 422
    # The client fixture clears provider settings, so an approved LLM call has nowhere to go.
    assert client.post("/classify", json={"text": "hi", "allowLlm": True}).status_code == 503


def test_cors_allows_the_next_dev_server(client):
    response = client.options(
        "/classify",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"},
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def same_shape(actual, expected, path="body"):
    """Same keys and JSON types as the frontend mock, recursively. null may stand in for a value."""
    if actual is None or expected is None:
        return
    if isinstance(expected, bool) or isinstance(actual, bool):
        assert type(actual) is type(expected), path
    elif isinstance(expected, (int, float)):
        assert isinstance(actual, (int, float)), path
    elif isinstance(expected, dict):
        assert set(actual) == set(expected), path
        for key in expected:
            same_shape(actual[key], expected[key], f"{path}.{key}")
    elif isinstance(expected, list):
        assert isinstance(actual, list), path
        for item in actual:
            same_shape(item, expected[0], f"{path}[]")
    else:
        assert type(actual) is type(expected), path


def test_classify_types_match_frontend_mock_and_enums(client):
    body = client.post("/classify", json={"text": "Email bob@x.io the SSN 123-45-6789"}).json()
    same_shape(body, CONTRACT)
    topics = {"coding", "writing", "data_analysis", "customer_email", "legal", "hr", "other"}
    assert body["knn"]["topic"] in topics
    assert body["knn"]["sensitivity"] in {"public", "internal", "confidential"}
    assert body["knn"]["severity"] in {"low", "medium", "high", "critical"}
    assert {s["kind"] for s in body["riskSpans"]} <= {
        "api_key",
        "password",
        "email",
        "phone",
        "ssn",
        "salary",
        "card",
        "injection",
    }
    assert all(n["topic"] in topics for n in body["knn"]["neighbors"])


def test_sensitivity_comes_from_rules_not_synthetic_boilerplate(client):
    plain = client.post("/classify", json={"text": "name a fictional pet"}).json()
    assert plain["knn"]["sensitivity"] == "public" and plain["knn"]["severity"] == "low"
    salary = client.post("/classify", json={"text": "Offer: base salary of $145,000"}).json()
    assert salary["knn"]["sensitivity"] == "confidential"


def test_cors_allows_next_on_a_fallback_port_but_not_other_sites(client):
    def allowed(origin):
        response = client.options(
            "/report/weekly",
            headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
        )
        return response.headers.get("access-control-allow-origin") == origin

    assert allowed("http://localhost:3001") and allowed("http://127.0.0.1:3002")
    assert not allowed("https://evil.example") and not allowed("http://localhost.evil.example")
