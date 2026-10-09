"""HTTP API for the Next.js frontend. Response shapes follow web/types/api.ts exactly.

    python -m prompt_insights serve  # http://127.0.0.1:8001; port 8000 is the AI Gateway

Prompt text is classified in memory and never logged or stored by this module.
"""

import json
import os
import threading
import uuid
from contextlib import asynccontextmanager
import time
from datetime import datetime, timezone
from functools import lru_cache
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from pathlib import Path

from . import ask, bench, embed, providers, report, risk, security
from .core import TOPICS, classify as keyword_topic, classify_sensitivity, generate, split
from .gateway import MAX_BYTES, parse_ndjson
from .model import load_dolly

MAX_CHARS = 16000
K = 5
# Below this cosine similarity to the closest labelled example, ask a person to check.
# A review trigger picked by hand, not a probability.
LOW_SIMILARITY = 0.35
SEVERITY_RANK = dict(low=0, medium=1, high=2, critical=3)
TOPICS_TUPLE = tuple(TOPICS)
MODEL_VERSION = f"{embed.MODEL_NAME.split('/')[-1]}+k{K}"
EVENTS = Path(
    os.environ.get("PI_EVENTS", Path(__file__).resolve().parents[2] / "data/demo-events.ndjson")
)
ORIGINS = os.environ.get("PI_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
# Next.js moves to 3001, 3002, ... when 3000 is busy; any local port is still this machine.
LOCAL_ORIGIN = r"http://(localhost|127\.0\.0\.1)(:\d+)?"


@asynccontextmanager
async def lifespan(_app):
    if os.environ.get("PI_SKIP_WARMUP") != "1":
        index()["topic"].explain("warm up")  # load the encoder before the first real request
        event_labels("knn")  # encode gateway events and apply saved corrections
    yield


# The interactive API docs describe every route; only serve them while developing (OWASP A02).
DOCS = {} if security.development() else dict(docs_url=None, redoc_url=None, openapi_url=None)
app = FastAPI(title="Prompt Insights API", lifespan=lifespan, **DOCS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ORIGINS.split(",") if origin.strip()],
    allow_origin_regex=LOCAL_ORIGIN,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
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
    with LOCK:
        corrections()  # make sure saved corrections are in the index
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


def llm_prediction(text, mode):
    """One paid call on redacted text. Like k-NN, the rules may raise its sensitivity and
    always decide severity; the LLM's own answer is never lowered."""
    try:
        raw = providers.llm_prediction(text, mode, allow_live=True)
    except ValueError:
        raise HTTPException(502, "LLM request failed or returned an invalid answer") from None
    judged = risk.assess(text, raw["topic"], raw["sensitivity"])
    return dict(raw, sensitivity=judged["sensitivity"], severity=judged["severity"])


@app.post("/classify")
def classify(request: ClassifyRequest):
    mode = providers.configured_provider()
    if request.allowLlm and mode is None:
        raise HTTPException(
            503, "No LLM is configured on the server; set a provider API key and model"
        )
    knn, assessed, nearest = knn_prediction(request.text)
    llm = llm_prediction(request.text, mode) if request.allowLlm else None
    agree = (
        None
        if llm is None
        else (llm["topic"], llm["sensitivity"])
        == (
            knn["topic"],
            knn["sensitivity"],
        )
    )
    needs_review = nearest < LOW_SIMILARITY or agree is False
    if needs_review:
        queue_playground(
            assessed["textRedacted"],
            {k: v for k, v in knn.items() if k != "neighbors"},
            llm,
            "disagreement" if agree is False else "low_similarity",
        )
    return dict(
        knn=knn,
        llm=llm,
        agree=agree,
        needsReview=needs_review,
        riskSpans=assessed["riskSpans"],
        textRedacted=assessed["textRedacted"],
        # Labelled estimate; null when no provider or price is configured (unknown, not free).
        llmCostEstimateUsd=providers.estimate_cost_usd(request.text, mode) if mode else None,
    )


@lru_cache(maxsize=1)
def events():
    """Gateway events to report on, validated against the shared gateway contract."""
    with EVENTS.open("rb") as stream:
        rows = parse_ndjson(stream.read(MAX_BYTES + 1))
    LOADED["at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return rows


LOADED = {}  # when events() last read the export, for /sources


def classifiable():
    """Failed and blocked events, and events without text, are never classified."""
    return {
        e["event_id"]: e
        for e in events()
        if e["status"] == "succeeded" and e.get("prompt_redacted")
    }


@lru_cache(maxsize=1)
def event_vectors():
    """Encode every event once; votes are recomputed cheaply as the index learns."""
    rows = list(classifiable().values())
    started = time.perf_counter()
    vectors = embed.encode([e["prompt_redacted"] for e in rows])
    per_event_ms = round((time.perf_counter() - started) * 1000 / max(len(rows), 1), 1)
    return {e["event_id"]: v for e, v in zip(rows, vectors)}, per_event_ms


# Saved LLM results live in git (ids, labels and numbers only; no prompt text, no keys) so the
# whole team gets them. Paid runs write them; requests only read them.
LLM_RESULTS = Path(__file__).resolve().parents[2] / "data/llm-results"
LLM_LABELS = Path(os.environ.get("PI_LLM_LABELS", LLM_RESULTS / "llm-event-labels.json"))
NO_LLM_LABELS = (
    "No complete LLM labels for these events. Run once, with consent to the paid calls: "
    "python -m prompt_insights label-events --mode anthropic --yes"
)


def llm_labels():
    """Saved batch labels from `label-events`. A GET never makes a paid call itself."""
    try:
        labels = json.loads(LLM_LABELS.read_text())["labels"]
    except (OSError, ValueError, KeyError, TypeError):
        raise HTTPException(409, NO_LLM_LABELS) from None
    valid = isinstance(labels, dict) and all(
        isinstance(label, dict)
        and label.get("topic") in TOPICS
        and label.get("sensitivity") in ("public", "internal", "confidential")
        for label in labels.values()
    )
    if not valid or not set(classifiable()) <= set(labels):
        raise HTTPException(409, NO_LLM_LABELS)
    return labels


def event_labels(model):
    """Topic + rule-based risk for every classifiable event. Human corrections win."""
    with LOCK:
        store = corrections()
        topic_model = index()["topic"]
        vectors, _ = event_vectors() if model == "knn" else ({}, 0)
        saved = llm_labels() if model == "llm" else {}
        labels = {}
        for event_id, event in classifiable().items():
            text = event["prompt_redacted"]
            corrected = store.get(event_id)
            if corrected:
                topic, sensitivity, nearest = corrected["topic"], corrected["sensitivity"], 1.0
            elif model == "knn":
                explained = topic_model.explain_vector(vectors[event_id])
                topic, sensitivity, nearest = (
                    explained["label"],
                    "public",
                    explained["nearest_similarity"],
                )
            elif model == "llm":
                topic, sensitivity = saved[event_id]["topic"], saved[event_id]["sensitivity"]
                nearest = None
            else:
                topic, sensitivity, nearest = keyword_topic(text), "public", None
            assessed = risk.assess(text, topic, sensitivity)
            labels[event_id] = dict(
                topic=topic,
                sensitivity=assessed["sensitivity"],
                severity=assessed["severity"],
                reason=assessed["reason"],
                textRedacted=assessed["textRedacted"],
                nearest=nearest,
                corrected=bool(corrected),
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
    if model not in {"knn", "keyword", "llm"}:
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


# ---------- review queue and human feedback ----------

LOCK = threading.RLock()
CORRECTIONS = Path(os.environ.get("PI_CORRECTIONS", "artifacts/corrections.json"))
REVIEW_LIMIT = 50
UNDO = {}
# Classify-page prompts that need a person. Redacted text only, held in memory and never
# written to disk, so they disappear when the server restarts. Newest last; capped.
PLAYGROUND = {}
PLAYGROUND_LIMIT = 50


def queue_playground(text_redacted, knn, llm, reason):
    with LOCK:
        for item_id, item in list(PLAYGROUND.items()):
            if item["textRedacted"] == text_redacted:
                del PLAYGROUND[item_id]  # same prompt again: keep only the latest answers
        item_id = f"playground-{uuid.uuid4().hex[:12]}"
        PLAYGROUND[item_id] = dict(
            textRedacted=text_redacted, knn=knn, llm=llm, reason=reason, corrected=None
        )
        while len(PLAYGROUND) > PLAYGROUND_LIMIT:
            PLAYGROUND.pop(next(iter(PLAYGROUND)))


@lru_cache(maxsize=1)
def corrections():
    """event_id -> {topic, sensitivity}. The file holds labels only, never prompt text."""
    store = json.loads(CORRECTIONS.read_text()) if CORRECTIONS.exists() else {}
    known = classifiable()
    store = {k: v for k, v in store.items() if k in known}
    for event_id, label in store.items():
        _teach(event_id, label)
    return store


def _item_text(item_id):
    if item_id in PLAYGROUND:
        return PLAYGROUND[item_id]["textRedacted"]
    return classifiable()[item_id]["prompt_redacted"]


def _teach(event_id, label):
    text = _item_text(event_id)
    row_id = f"feedback-{event_id}"
    index()["topic"].add(row_id, label["topic"], text)
    index()["rows"][row_id] = dict(
        id=row_id, text=text, topic=label["topic"], sensitivity=label["sensitivity"]
    )


def _forget(event_id):
    row_id = f"feedback-{event_id}"
    index()["topic"].remove(row_id)
    index()["rows"].pop(row_id, None)


def _save(store):
    CORRECTIONS.parent.mkdir(parents=True, exist_ok=True)
    CORRECTIONS.write_text(json.dumps(store, indent=2, sort_keys=True) + "\n")


def _prediction(label, latency_ms):
    return dict(
        model="knn",
        topic=label["topic"],
        sensitivity=label["sensitivity"],
        severity=label["severity"],
        latencyMs=latency_ms,
        costUsd=None,
        inputTokens=None,
        outputTokens=None,
        modelVersion=MODEL_VERSION,
    )


@app.get("/review")
def review_queue():
    """Flagged high/critical items first, then uncertain ones (least similar on top).

    Repeats of the same prompt appear once, and a prompt drops out once any copy is corrected:
    the correction joins the index, so its repeats are relabelled too.
    """
    labels = event_labels("knn")
    _, latency_ms = event_vectors()
    texts = {event_id: event["prompt_redacted"] for event_id, event in classifiable().items()}
    done = {texts[event_id] for event_id, label in labels.items() if label["corrected"]}
    queue, seen = [], set()
    for event_id, label in sorted(labels.items(), key=lambda item: item[0]):
        if texts[event_id] in done or texts[event_id] in seen:
            continue
        if label["severity"] in {"high", "critical"}:
            reason, rank = "flagged", (0, -SEVERITY_RANK[label["severity"]])
        elif label["nearest"] < LOW_SIMILARITY:
            reason, rank = "low_similarity", (1, label["nearest"])
        else:
            continue
        seen.add(texts[event_id])
        queue.append((rank, event_id, label, reason))
    queue.sort(key=lambda item: item[:2])
    with LOCK:
        playground = [
            dict(
                id=item_id,
                textRedacted=item["textRedacted"],
                knn=item["knn"],
                llm=item["llm"],
                reason=item["reason"],
            )
            for item_id, item in reversed(PLAYGROUND.items())
            if item["corrected"] is None
        ]
    # Prompts someone just classified come first, newest on top, then gateway events.
    return playground + [
        dict(
            id=event_id,
            textRedacted=label["textRedacted"],
            knn=_prediction(label, latency_ms),
            llm=None,
            reason=reason,
        )
        for _, event_id, label, reason in queue[: max(REVIEW_LIMIT - len(playground), 0)]
    ]


class Correction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    itemId: str = Field(min_length=1, max_length=128)
    topic: Literal[TOPICS_TUPLE]
    sensitivity: Literal["public", "internal", "confidential"]


class Undo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    undoToken: str = Field(min_length=1, max_length=64)


@app.post("/feedback")
def feedback(correction: Correction, reviewer: str = Depends(security.require_reviewer)):
    with LOCK:
        store = corrections()
        label = dict(topic=correction.topic, sensitivity=correction.sensitivity)
        if correction.itemId in PLAYGROUND:
            # Playground corrections teach the index in memory only, like the item itself.
            item = PLAYGROUND[correction.itemId]
            previous = item["corrected"]
            item["corrected"] = label
        elif correction.itemId in classifiable():
            previous = store.get(correction.itemId)
            store[correction.itemId] = label
            _save(store)
        else:
            raise HTTPException(404, "unknown review item")
        _teach(correction.itemId, label)
        security.audit("correct", reviewer, correction.itemId, previous, label)
        token = uuid.uuid4().hex
        UNDO[token] = (correction.itemId, previous, reviewer)
        return dict(
            ok=True,
            indexSize=len(index()["topic"].ids),
            correctionsTotal=len(store),
            undoToken=token,
        )


@app.post("/feedback/undo")
def undo_feedback(request: Undo, reviewer: str = Depends(security.require_reviewer)):
    with LOCK:
        # Only the reviewer who made a correction can undo it.
        if request.undoToken not in UNDO or UNDO[request.undoToken][2] != reviewer:
            raise HTTPException(404, "unknown or already used undo token")
        event_id, previous, _ = UNDO.pop(request.undoToken)
        store = corrections()
        if event_id in PLAYGROUND:
            undone = PLAYGROUND[event_id]["corrected"]
            PLAYGROUND[event_id]["corrected"] = previous
        else:
            undone = store.get(event_id)
            if previous:
                store[event_id] = previous
            else:
                store.pop(event_id, None)
            _save(store)
        known = event_id in PLAYGROUND or event_id in classifiable()
        if previous and known:
            _teach(event_id, previous)
        else:
            _forget(event_id)
        security.audit("undo", reviewer, event_id, undone, previous)
        return dict(ok=True, indexSize=len(index()["topic"].ids), correctionsTotal=len(store))


# ---------- model comparison ----------


LLM_EVAL = Path(os.environ.get("PI_LLM_EVAL", LLM_RESULTS / "provider-eval-benchmark.json"))


def saved_llm_run():
    """A saved `eval-provider` run on this exact frozen benchmark, or None.

    /metrics never calls the provider; it only scores answers saved by an approved run.
    """
    try:
        run = json.loads(LLM_EVAL.read_text())
        rows, meta = bench.load_benchmark()
        answers = run["predictions"]
        complete = run["dataset"]["sha256"] == meta["sha256"] and all(
            answers[r["id"]]["topic"] in TOPICS
            and answers[r["id"]]["sensitivity"] in ("public", "internal", "confidential")
            for r in rows
        )
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return run if complete else None


def metrics():
    """Recomputed only when a saved LLM run appears or changes."""
    try:
        stamp = LLM_EVAL.stat().st_mtime_ns
    except OSError:
        stamp = None
    return _metrics(stamp)


metrics.cache_clear = lambda: _metrics.cache_clear()


@lru_cache(maxsize=2)
def _metrics(_llm_eval_stamp):
    def keyword(text):
        return keyword_topic(text), classify_sensitivity(text)

    def knn(text):
        topic = index()["topic"].explain(text)["label"]
        return topic, risk.assess(text, topic, "public")["sensitivity"]

    models = [
        ("keyword", "keyword baseline + policy markers", keyword),
        ("knn", MODEL_VERSION, knn),
    ]
    run = saved_llm_run()
    if run is None:
        return bench.benchmark_metrics(models)
    rows, _ = bench.load_benchmark()
    by_text = {r["text"]: run["predictions"][r["id"]] for r in rows}

    def llm(text):
        # Same rule layer as k-NN, so the comparison is like for like.
        answer = by_text[text]
        return answer["topic"], risk.assess(text, answer["topic"], answer["sensitivity"])[
            "sensitivity"
        ]

    extras = dict(p50_latency_ms=run["latencyMs"]["p50"], cost_per_1k_usd=run["costUsd"]["per1k"])
    version = ", ".join(run["modelVersions"]) or "llm"
    return bench.benchmark_metrics(models + [("llm", version, llm, extras)], compare=("knn", "llm"))


@app.post("/ask")
def ask_team(request: ask.AskRequest):
    """Summary of what one team used AI for over the last N days. Teams only, never people.
    The LLM runs only when allowLlm is true; otherwise the summary is rule-based."""
    mode = providers.configured_provider()
    labels = event_labels("knn")
    teams = {e["team_id"] for e in classifiable().values()}
    try:
        return ask.answer(request, events(), lambda e: labels[e["event_id"]], teams, mode)
    except ask.AskRefused as error:
        raise HTTPException(422, str(error)) from None
    except LookupError as error:
        raise HTTPException(404, str(error)) from None


@app.get("/metrics")
def get_metrics():
    return metrics()


@app.get("/sources")
def sources():
    """Where the report's events came from: counts only, never text or user ids.

    Events are read from an NDJSON export (PI_EVENTS), not pulled live from the gateway, so
    `connected` is false. `received` counts non-blank lines before exact-duplicate removal.
    """
    rows = events()
    with EVENTS.open("rb") as stream:
        received = sum(1 for line in stream.read(MAX_BYTES + 1).splitlines() if line.strip())
    status = {name: sum(1 for e in rows if e["status"] == name) for name in ("failed", "blocked")}
    return dict(
        received=received,
        deduped=received - len(rows),
        failed=status["failed"],
        blocked=status["blocked"],
        classified=len(classifiable()),
        gateway=dict(connected=False, url=None, lastImportAt=LOADED.get("at")),
        project1DashboardUrl=os.environ.get("PI_PROJECT1_DASHBOARD_URL") or None,
    )
