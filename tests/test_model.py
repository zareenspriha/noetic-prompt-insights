import json
import re
import numpy as np
from prompt_insights import embed
from prompt_insights.core import TOPICS, generate, split
import hashlib
from prompt_insights.model import compare, fit, load_dolly, unseen_task_split


def fake_encode(texts):
    """Offline stand-in for the sentence encoder: unit-length hashed bag of words."""
    vectors = np.zeros((len(texts), 256))
    for row, text in enumerate(texts):
        for word in re.findall(r"[a-z]+", text.lower()):
            vectors[row, sum(map(ord, word)) % 256] += 1
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.where(norms == 0, 1, norms)


def test_fit_sees_only_training_families():
    train, _ = split(generate())
    vocabulary = fit(train, "topic").named_steps["tfidfvectorizer"].vocabulary_
    # "pretend" and "challenge" appear only in validation templates (families 6 and 7).
    assert "pretend" not in vocabulary and "challenge" not in vocabulary


def test_unseen_task_split_is_disjoint_by_family_and_task():
    train, validation = unseen_task_split(generate())
    assert len(train) == 168 and len(validation) == 14
    assert not {r["template_family"] for r in train} & {r["template_family"] for r in validation}
    assert all(r["id"].endswith("-4") for r in validation)
    assert not any(r["id"].endswith("-4") for r in train)


def test_compare_reports_both_models_with_denominators_and_no_fitting_on_validation():
    result = compare(generate(), encode=fake_encode, dolly=([], []))
    holdout = result["family_holdout"]
    assert holdout["train_samples"] == 210
    for target in ("topic", "sensitivity"):
        for model in ("keyword", "tfidf", "knn"):
            assert holdout[target][model]["samples"] == 70
    assert holdout["topic"]["tfidf"]["macro_f1"] >= holdout["topic"]["keyword"]["macro_f1"]
    assert result["unseen_task_holdout"]["topic"]["tfidf"]["samples"] == 14
    assert result == compare(generate(), encode=fake_encode, dolly=([], []))
    assert result["dolly_holdout"] is None
    json.dumps(result)


def test_knn_explains_with_training_neighbors_and_abstains_when_nothing_is_close():
    train, _ = split(generate())
    model = embed.NearestNeighbors(
        train, "topic", threshold=0.2, abstain="other", encode=fake_encode
    )
    explained = model.explain("Please debug a python parser for a fictional bookshop.")
    assert explained["label"] == "coding"
    assert len(explained["neighbors"]) == 5
    assert {n["id"] for n in explained["neighbors"]} <= {r["id"] for r in train}
    assert model.predict("zzz qqq") == "other"


def test_knn_cutoff_is_tuned_inside_training_families_only():
    train, _ = split(generate())
    assert embed.tune_threshold(train, "topic", encode=fake_encode) in embed.THRESHOLDS


def test_dolly_test_set_is_frozen_and_disjoint_from_training():
    train, test = load_dolly()
    frozen = sorted((r["id"], r["text"], r["topic"]) for r in test)
    # Changing the frozen test set must be a deliberate, reviewed edit to this digest.
    assert len(frozen) == 107
    assert (
        hashlib.sha256(json.dumps(frozen).encode()).hexdigest()
        == "a17e35d833bbade9b3277ad6d405c36ab68342b7fcb198890a460be520ba015e"
    )
    assert not {r["text"].lower() for r in train} & {r["text"].lower() for r in test}
    assert {r["topic"] for r in train + test} == set(TOPICS)
    assert all("sensitivity" not in r for r in train + test)


def test_dolly_holdout_scores_topic_only():
    train, test = load_dolly()
    result = compare(generate(), encode=fake_encode, dolly=(train, test))["dolly_holdout"]
    assert result["synthetic_only"]["topic"]["knn"]["samples"] == 107
    assert result["synthetic_plus_dolly"]["train_samples"] == 210 + len(train)
    assert result["synthetic_plus_dolly"]["sensitivity"] is None
