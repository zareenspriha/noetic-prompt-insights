"""HTTP API for the Next.js frontend. Response shapes follow web/types/api.ts exactly.

    python -m prompt_insights serve --port 8000

Prompt text is classified in memory and never logged or stored by this module.
"""

import os
from contextlib import asynccontextmanager
import time
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from pathlib import Path

from . import embed, report, risk
from .core import TOPICS, classify as keyword_topic, generate, split
from .gateway import MAX_BYTES, parse_ndjson
from .model import load_dolly

MAX_CHARS = 16000
K = 5
# Below this cosine similarity to the closest labelled example, ask a person to check.
# A review trigger picked by hand, not a probability.
LOW_SIMILARITY = 0.35
MODEL_VERSION = f"{embed.MODEL_NAME.split('/')[-1]}+k{K}"
EVENTS = Path(
    os.environ.get("PI_EVENTS", Path(__file__).resolve().parents[2] / "data/demo-events.ndjson")
)
ORIGINS = os.environ.get("PI_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")


@asynccontextmanager
async def lifespan(_app):
    if os.environ.get("PI_SKIP_WARMUP") != "1":
        index()["topic"].explain("warm up")  # load the encoder before the first real request
    yield


app = FastAPI(title="Prompt Insights API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ORIGINS.split(",") if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ClassifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=MAX_CHARS)
    allowLlm: bool = False


@lru_cache(maxsize=1)
def index():
    """Labelled examples the k-NN votes over: synthetic training families plus Dolly train.

    Dolly rows have no sensitivity label; they are published text, so they count as public.
    Sensitivity is not voted on: synthetic sensitivity comes only from three fixed policy
    sentences, so a k-NN vote copies that boilerplate (e.g. "name a fictional pet" came out
    confidential). Until real sensitivity examples exist, the risk rules decide it alone.
    """
    dolly_train, _ = load_dolly()
    rows = split(generate())[0] + [dict(row, sensitivity="public") for row in dolly_train]
    return dict(
        rows={row["id"]: row for row in rows},
        topic=embed.fit_topic(rows, encode=embed.encode),
    )


def knn_prediction(text):
    started = time.perf_counter()
    models = index()
    topic = models["topic"].explain(text)
    assessed = risk.assess(text, topic["label"], "public")
    neighbors = []
    for neighbor in topic["neighbors"]:
        row = models["rows"][neighbor["id"]]
        neighbors.append(
            dict(
                id=row["id"],
                textRedacted=risk.redact(row["text"])[0],
                topic=row["topic"],
                sensitivity=row["sensitivity"],
                similarity=neighbor["similarity"],
            )
        )
    prediction = dict(
        model="knn",
        topic=topic["label"],
        sensitivity=assessed["sensitivity"],
        severity=assessed["severity"],
        latencyMs=round((time.perf_counter() - started) * 1000, 1),
        costUsd=None,
        inputTokens=None,
        outputTokens=None,
        modelVersion=MODEL_VERSION,
        neighbors=neighbors,
    )
    return prediction, assessed, topic["nearest_similarity"]


@app.get("/health")
def health():
    return dict(ok=True, modelVersion=MODEL_VERSION)


@app.post("/classify")
def classify(request: ClassifyRequest):
    if request.allowLlm:
        # Wired up in the LLM step; refusing beats silently returning k-NN only.
        raise HTTPException(501, "LLM classification is not available yet")
    knn, assessed, nearest = knn_prediction(request.text)
    return dict(
        knn=knn,
        llm=None,
        agree=None,
        needsReview=nearest < LOW_SIMILARITY,
        riskSpans=assessed["riskSpans"],
        textRedacted=assessed["textRedacted"],
        llmCostEstimateUsd=0.0,
    )


@lru_cache(maxsize=1)
def events():
    """Gateway events to report on, validated against the shared gateway contract."""
    with EVENTS.open("rb") as stream:
        return parse_ndjson(stream.read(MAX_BYTES + 1))


@lru_cache(maxsize=2)
def event_labels(model):
    """Topic + rule-based risk for every classifiable event, computed once per model."""
    rows = [e for e in events() if e["status"] == "succeeded" and e.get("prompt_redacted")]
    texts = [e["prompt_redacted"] for e in rows]
    if model == "knn":
        topics = index()["topic"].predict_many(texts)
    else:
        topics = [keyword_topic(text) for text in texts]
    labels = {}
    for event, text, topic in zip(rows, texts, topics):
        assessed = risk.assess(text, topic, "public")
        labels[event["event_id"]] = dict(
            topic=topic,
            sensitivity=assessed["sensitivity"],
            severity=assessed["severity"],
            reason=assessed["reason"],
            textRedacted=assessed["textRedacted"],
        )
    return labels


@app.get("/report/weekly")
def weekly_report(
    week: str | None = Query(None, pattern=r"^\d{4}-W\d{2}$"),
    team: str | None = Query(None, max_length=128),
    topic: str | None = None,
    model: str = "knn",
):
    if topic is not None and topic not in TOPICS:
        raise HTTPException(422, "unknown topic")
    if model == "llm":
        raise HTTPException(501, "LLM labels are not available yet")
    if model not in {"knn", "keyword"}:
        raise HTTPException(422, "model must be knn, keyword or llm")
    labels = event_labels(model)
    try:
        return report.weekly_report(
            events(), lambda e: labels[e["event_id"]], week=week, team=team or None, topic=topic
        )
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    except LookupError as error:
        raise HTTPException(404, str(error)) from None
