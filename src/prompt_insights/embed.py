"""Pretrained sentence embeddings + k-nearest-neighbor vote. No fine-tuning, no fitted weights."""

from functools import lru_cache

import numpy as np
from sklearn.metrics import f1_score

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
THRESHOLDS = (0.0, 0.2, 0.3, 0.4, 0.5, 0.6)


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_NAME)


def encode(texts):
    """Unit-length embeddings, so a dot product is cosine similarity."""
    return np.asarray(
        _model().encode(list(texts), normalize_embeddings=True, show_progress_bar=False)
    )


def _vote(similarities, labels, k):
    """Similarity-weighted vote over the k nearest rows; ties go to the nearer neighbor."""
    top = np.argsort(-similarities, kind="stable")[:k]
    votes = {}
    for i in top:
        votes[labels[i]] = votes.get(labels[i], 0.0) + max(float(similarities[i]), 1e-6)
    return max(votes, key=votes.get), top


def tune_threshold(rows, target, k=5, abstain="other", encode=encode):
    """Pick the abstention cutoff by leave-one-family-out inside the given rows only."""
    vectors = encode([row["text"] for row in rows])
    labels = [row[target] for row in rows]
    families = [row["template_family"] for row in rows]
    truth, voted, nearest = [], [], []
    for family in sorted(set(families)):
        held = [i for i, f in enumerate(families) if f == family]
        rest = [i for i, f in enumerate(families) if f != family]
        rest_labels = [labels[i] for i in rest]
        for i in held:
            similarities = vectors[rest] @ vectors[i]
            label, top = _vote(similarities, rest_labels, k)
            truth.append(labels[i])
            voted.append(label)
            nearest.append(float(similarities[top[0]]))

    def macro_f1(threshold):
        predicted = [v if s >= threshold else abstain for v, s in zip(voted, nearest)]
        return f1_score(truth, predicted, average="macro", zero_division=0)

    return max(THRESHOLDS, key=lambda t: (macro_f1(t), -t))


class NearestNeighbors:
    """Explainable: every prediction lists the labelled rows that produced it."""

    def __init__(self, rows, target, k=5, threshold=0.0, abstain=None, encode=encode):
        self.ids = [row["id"] for row in rows]
        self.labels = [row[target] for row in rows]
        self.vectors = encode([row["text"] for row in rows])
        self.k, self.threshold, self.abstain, self.encode = k, threshold, abstain, encode

    def explain(self, text):
        similarities = self.vectors @ self.encode([text])[0]
        label, top = _vote(similarities, self.labels, self.k)
        nearest = float(similarities[top[0]])
        if self.abstain and nearest < self.threshold:
            label = self.abstain
        return dict(
            label=label,
            nearest_similarity=round(nearest, 4),
            threshold=self.threshold,
            neighbors=[
                dict(
                    id=self.ids[i],
                    label=self.labels[i],
                    similarity=round(float(similarities[i]), 4),
                )
                for i in top
            ],
        )

    def predict(self, text):
        return self.explain(text)["label"]


def fit_topic(rows, encode=encode):
    threshold = tune_threshold(rows, "topic", encode=encode)
    return NearestNeighbors(rows, "topic", threshold=threshold, abstain="other", encode=encode)


def fit_sensitivity(rows, encode=encode):
    return NearestNeighbors(rows, "sensitivity", encode=encode)
