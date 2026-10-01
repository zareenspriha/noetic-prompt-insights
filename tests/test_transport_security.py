import httpx
import pytest
from prompt_insights.transport import request_json


def test_oversized_response_stops_reading_early(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-key")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")

    class Huge(httpx.SyncByteStream):
        def __iter__(self):
            yield b"x" * 100001
            raise AssertionError("Read beyond response limit")

    transport = httpx.MockTransport(lambda request: httpx.Response(200, stream=Huge()))
    with pytest.raises(ValueError, match="Provider request failed"):
        request_json("system", "{}", {}, "openai", True, transport)


def test_malformed_anthropic_block_is_sanitized(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-only-key")
    monkeypatch.setenv("ANTHROPIC_MODEL", "test-model")
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"content": [None]}))
    with pytest.raises(ValueError, match="Provider request failed"):
        request_json("system", "{}", {}, "anthropic", True, transport)
