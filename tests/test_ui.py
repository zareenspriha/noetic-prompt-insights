from pathlib import Path
from streamlit.testing.v1 import AppTest


def test_mock_ui_has_no_live_call_on_load_or_rerun():
    app = AppTest.from_file(str(Path(__file__).parents[1] / "src/prompt_insights/ui.py")).run()
    assert not app.exception
    app.button[0].click().run()
    assert not app.exception
    assert "classification" in app.session_state
    assert app.session_state["classification"]["mode"] == "mock"


def test_live_submission_calls_once_not_on_rerun(monkeypatch):
    import prompt_insights.providers as providers

    calls = []

    def fake(text, mode, allow_live):
        calls.append((mode, allow_live))
        return {"topic": "coding", "sensitivity": "public", "mode": mode}

    monkeypatch.setattr(providers, "classify_prompt", fake)
    app = AppTest.from_file(str(Path(__file__).parents[1] / "src/prompt_insights/ui.py")).run()
    app.selectbox[0].select("openai").run()
    assert not calls
    app.checkbox[0].check()
    app.button[0].click().run()
    app.run()
    assert not app.exception and calls == [("openai", True)]
