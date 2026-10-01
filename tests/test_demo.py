from prompt_insights.__main__ import main


def test_demo_writes_synthetic_evaluation(tmp_path):
    assert main(["demo", "--out", str(tmp_path)]) == 0
    import json

    report = json.loads((tmp_path / "evaluation.json").read_text())
    assert report["validation"]["samples"] == 70
    assert len((tmp_path / "prompts.ndjson").read_text().splitlines()) == 280
