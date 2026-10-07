"""HTTP API for the Next.js frontend. Response shapes follow web/types/api.ts exactly.

    python -m prompt_insights serve --port 8000

Prompt text is classified in memory and never logged or stored by this module.
"""

import os
from contextlib import asynccontextmanager
import time
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from . import embed, risk
from .core import generate, split
from .model import load_dolly

MAX_CHARS = 16000
K = 5
# Below this cosine similarity to the closest labelled example, ask a person to check.
# A review trigger picked by hand, not a probability.
LOW_SIMILARITY = 0.35
MODEL_VERSION = f"{embed.MODEL_NAME.split('/')[-1]}+k{K}"
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
    """
    dolly_train, _ = load_dolly()
    rows = split(generate())[0] + [dict(row, sensitivity="public") for row in dolly_train]
    return dict(
        rows={row["id"]: row for row in rows},
        topic=embed.fit_topic(rows, encode=embed.encode),
        sensitivity=embed.fit_sensitivity(rows, encode=embed.encode),
    )


def knn_prediction(text):
    started = time.perf_counter()
    models = index()
    topic = models["topic"].explain(text)
    sensitivity = models["sensitivity"].predict(text)
    assessed = risk.assess(text, topic["label"], sensitivity)
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
