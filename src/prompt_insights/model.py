"""TF-IDF + logistic regression baseline, fitted only on training families."""

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

import json
from pathlib import Path

from . import embed
from .core import SENSITIVITIES, TOPICS, classify, classify_sensitivity, score, split

DOLLY = Path(__file__).resolve().parents[2] / "data/dolly-topics.ndjson"

# Hand-written smoke probes, not a test set: reported as predictions only, never scored.
PROBES = (
    "Debug a python function",
    "python contract",
    "Can you look over the NDA terms before I sign?",
    "Why does my program segfault when the array is empty?",
    "Turn these quarterly numbers into a bar graph",
    "Our Q3 revenue figures are under embargo until the earnings call",
    "Here is the admin login for the staging server, please check it",
)


def fit(rows, target):
    model = make_pipeline(
        TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True),
        LogisticRegression(max_iter=1000),
    )
    model.fit([row["text"] for row in rows], [row[target] for row in rows])
    return model


def unseen_task_split(rows):
    """Stricter check: hold out both template families 6-7 and the fifth task of every topic."""
    train, validation = split(rows)
    train = [row for row in train if not row["id"].endswith("-4")]
    validation = [row for row in validation if row["id"].endswith("-4")]
    return train, validation


def _keyword(train):
    return classify, classify_sensitivity


def _with_sensitivity(rows):
    """Dolly rows carry a topic label only; sensitivity models train on synthetic rows."""
    return [row for row in rows if "sensitivity" in row]


def _tfidf(train):
    topic_model = fit(train, "topic")
    sensitivity_model = fit(_with_sensitivity(train), "sensitivity")
    return (
        lambda text: topic_model.predict([text])[0],
        lambda text: sensitivity_model.predict([text])[0],
    )


def _knn(encode):
    def build(train):
        topic_model = embed.fit_topic(train, encode=encode)
        sensitivity_model = embed.fit_sensitivity(_with_sensitivity(train), encode=encode)
        return topic_model.predict, sensitivity_model.predict

    return build


def load_dolly(path=DOLLY):
    """Hand-labelled Dolly-15k topics; see scripts/build_dolly_topics.py. Empty if absent."""
    if not path.exists():
        return [], []
    rows = [json.loads(line) for line in path.read_text().splitlines()]
    return [r for r in rows if r["split"] == "train"], [r for r in rows if r["split"] == "test"]


def compare(rows, encode=None, dolly=None):
    """Score every model on the same splits. Pass `encode` to swap the sentence encoder."""
    topics, sensitivities = list(TOPICS), list(SENSITIVITIES)
    builders = dict(keyword=_keyword, tfidf=_tfidf, knn=_knn(encode or embed.encode))

    def run(train, validation):
        models = {name: build(train) for name, build in builders.items()}
        predictions = {
            row["id"]: {name: topic(row["text"]) for name, (topic, _) in models.items()}
            for row in validation
        }
        return dict(
            train_samples=len(train),
            topic={
                name: score(validation, "topic", topic, topics)
                for name, (topic, _) in models.items()
            },
            sensitivity={
                name: score(validation, "sensitivity", sensitivity, sensitivities)
                for name, (_, sensitivity) in models.items()
            }
            if all("sensitivity" in row for row in validation)
            else None,
            topic_disagreements=[
                dict(id=row["id"], text=row["text"], truth=row["topic"], **predictions[row["id"]])
                for row in validation
                if any(label != row["topic"] for label in predictions[row["id"]].values())
            ],
        ), models

    family_holdout, models = run(*split(rows))
    unseen_task, _ = run(*unseen_task_split(rows))
    dolly_train, dolly_test = load_dolly() if dolly is None else dolly
    synthetic_train = split(rows)[0]
    dolly_holdout = (
        dict(
            synthetic_only=run(synthetic_train, dolly_test)[0],
            synthetic_plus_dolly=run(synthetic_train + dolly_train, dolly_test)[0],
        )
        if dolly_test
        else None
    )
    return dict(
        method=dict(
            keyword="fixed word-boundary keywords and policy markers; no fitting",
            tfidf="TF-IDF word 1-2 grams + logistic regression, default C",
            knn=f"{embed.MODEL_NAME} embeddings, similarity-weighted 5-nearest-neighbor vote; "
            "topic abstains to other below a cutoff chosen by leave-one-family-out on train",
        ),
        family_holdout=family_holdout,
        unseen_task_holdout=unseen_task,
        dolly_holdout=dolly_holdout,
        probes=[
            dict(
                text=text,
                **{
                    name: dict(topic=topic(text), sensitivity=sensitivity(text))
                    for name, (topic, sensitivity) in models.items()
                },
            )
            for text in PROBES
        ],
        limitation=(
            "Dolly holdout is the closest to real prompts: frozen human-written instructions, "
            "topic only, labels assigned by us and thin for customer_email. "
            "Family holdout reuses the same 35 task phrases, so it mostly measures template "
            "robustness. The unseen-task holdout has only 14 rows. Synthetic sensitivity is fixed "
            "by one of three policy sentences, so perfect sensitivity scores say nothing about "
            "real prompts. TF-IDF always picks a class; k-NN abstains only below a similarity "
            "cutoff. Neither score is a calibrated probability. Probes are illustrative, "
            "not an evaluation."
        ),
    )
