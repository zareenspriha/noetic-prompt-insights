import pytest
from fastapi.testclient import TestClient
from prompt_insights import api, embed
from test_model import fake_encode

CACHES = (
    api.index,
    api.events,
    api.event_vectors,
    api.corrections,
    api.metrics,
    api.source_stats,
)


@pytest.fixture
def client(monkeypatch, tmp_path):
    """API client with the offline fake encoder and a throwaway corrections file."""
    monkeypatch.setattr(embed, "encode", fake_encode)
    monkeypatch.setattr(api, "CORRECTIONS", tmp_path / "corrections.json")
    api.UNDO.clear()
    for cached in CACHES:
        cached.cache_clear()
    yield TestClient(api.app)
    for cached in CACHES:
        cached.cache_clear()
