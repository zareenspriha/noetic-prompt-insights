# Prompt Insights

**The dashboard a manager opens every Monday:** what people used AI for this week, and where the risk is.

Built for the Noetic Hackathon (Project Two) on top of the AI Gateway's event log. Each prompt gets a topic
(`coding`, `writing`, `data_analysis`, `customer_email`, `legal`, `hr`, `other`), a sensitivity
(`public`, `internal`, `confidential`) and a risk severity (`low` → `critical`). The results roll up into a weekly
report per team, with small groups hidden for privacy.

> All data here is synthetic or public (Dolly-15k). Scores are development results on a small frozen
> benchmark, not production accuracy.

## What's built

| Brief item | Status | Where |
|---|---|---|
| Topic + sensitivity classifier | Done | `embed.py` (kNN on MiniLM embeddings), `risk.py` (rules for keys, passwords, PII) |
| Risk severity per item (stretch) | Done | `risk.py`: critical = credentials, high = PII / salary / injection / confidential legal-HR, medium = internal |
| Weekly report: top topics per team, trend, flags | Done | `report.py`, `/report/weekly`, Weekly Report page |
| Frozen benchmark + metrics (macro-F1, confidential recall, confusion matrix) | Done | `data/benchmark.ndjson` (70 rows, SHA-256 locked by tests), `/metrics`, Model Comparison page |
| Feedback buttons that correct a label (stretch) | Done | Review Queue → `/feedback`, joins the kNN index instantly, with undo |
| LLM zero-shot vs kNN, with cost and agreement | **Code ready, needs API key** | `providers.py` + `python -m prompt_insights eval-provider`; not yet wired into `/classify` and `/metrics` |
| Integration with Project 1's dashboard (stretch) | Partial | Reads the gateway's NDJSON export; set `PI_PROJECT1_URL` to link its dashboard |

## Run it

You need Python 3.11 or 3.12 and Node 20.9+.

**1. Backend** (terminal 1, from the repo root):

```bash
python3.12 -m venv .venv && source .venv/bin/activate
python -m pip install -r requirements.lock
python -m pip install --no-build-isolation --no-deps -e .
python -m prompt_insights serve          # http://127.0.0.1:8001
```

The first start downloads `all-MiniLM-L6-v2` (about 90 MB). After that it works offline.
The backend uses port 8001 because the AI Gateway uses 8000.

**2. Frontend** (terminal 2):

```bash
cd web
npm install
npm run dev                              # http://localhost:3000
```

**3. Use it.** The sidebar's **Demo mode** switch is on by default and shows seeded placeholder data, so the app
works without the backend. Turn it off to use the real backend. If the backend runs elsewhere, put
`NEXT_PUBLIC_API_URL=http://host:port` in `web/.env.local`.

**Backup demo:** the starter's Streamlit explorer still works: `python -m streamlit run src/prompt_insights/ui.py`.

### Demo script (live backend, Demo mode off)

1. **Weekly Report:** KPIs with week-over-week change, team × topic heatmap (cells under 10 prompts show `<10`),
   6-week trend, flagged prompts sorted by severity. Click a heatmap cell to filter. Export CSV or PDF.
2. **Classify:** pick "Hidden API key". The key is masked, the prompt is labelled `coding` / `confidential` /
   **critical**, and the 5 nearest labelled examples explain the topic.
3. **Review Queue:** correct a label (keys 1–7, J/K, Enter). "Model updated" appears and the kNN index grows by one.
   Undo works.
4. **Model Comparison:** scores on the frozen benchmark, agreement and Cohen's κ, clickable confusion matrices.
5. **Data & Trust:** import counts, privacy rules, known limits.

## Results (frozen benchmark, 70 prompts, 19 confidential)

From `GET /metrics`. Full analysis in [docs/EVALUATION.md](docs/EVALUATION.md).

| | Keyword baseline | kNN + risk rules |
|---|---|---|
| Topic macro-F1 | 0.36 | **0.54** |
| Sensitivity macro-F1 | 0.32 | **0.41** |
| Confidential recall | 0.00 (19 of 19 missed) | **0.26** (14 of 19 missed) |
| Harmless lookalikes wrongly raised | 5 of 14 | **0 of 14** |
| API cost | none | none |

Topic agreement between the two is 21.4% (κ 0.16). The main weakness is confidential content with no
recognisable pattern (layoffs, acquisitions, a named person's pay without a `$`). The rules only catch secrets with
a known shape.

## How it works

```
gateway export (NDJSON) → validate + dedupe → drop failed/blocked → kNN topic + risk rules → suppressed aggregates
                                                                  ↘ review queue ← human corrections → kNN index
```

- **kNN topic:** each prompt is embedded with `all-MiniLM-L6-v2` and gets a similarity-weighted vote from its
  5 nearest labelled examples (210 synthetic training rows + 168 Dolly rows). There's no training step, every
  answer shows the examples behind it, and corrections apply instantly.
- **Sensitivity and severity come from rules, not a model.** Rules can only raise sensitivity, never lower it.
- **Review queue:** high/critical flags, plus prompts whose nearest example is below 0.35 similarity.
  The 0.35 is a review trigger chosen by hand, not a probability.

### API (FastAPI, `src/prompt_insights/api.py`; shapes match `web/types/api.ts`)

| Route | Returns |
|---|---|
| `GET /report/weekly?week=&team=&topic=&model=knn\|keyword` | KPIs, heatmap, trend, flags |
| `POST /classify` | kNN prediction, risky spans, redacted text, neighbours |
| `GET /review` · `POST /feedback` · `POST /feedback/undo` | Review queue and corrections |
| `GET /metrics` | Benchmark scores, confusion matrices, agreement, benchmark hash |
| `GET /sources` | Import counts (received, duplicates, failed, blocked, classified) |

`model=llm` and `allowLlm: true` return **501** until the LLM is wired in.

## Guardrails

- No prompt text in aggregates or CSV exports. Flags show redacted text only.
- A count is shown only with ≥ 10 prompts from ≥ 3 people. A single hidden cell takes the next-smallest with it,
  and filters that go below the thresholds are refused.
- Failed and blocked events are counted but never classified.
- No automatic paid API calls: the LLM runs only when someone switches it on, and only on redacted text.
- Tokens and keys live in environment variables and are never logged. Remote gateway connections must use HTTPS.
- Corrections are stored as labels only (`artifacts/corrections.json`, gitignored).

See [docs/DATA_GOVERNANCE.md](docs/DATA_GOVERNANCE.md) for consent, retention and deletion requirements before any
real prompt is imported.

## LLM comparison (next step, needs an API key)

```bash
# .env is not loaded automatically; export the variables (names in .env.example)
export ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=... ANTHROPIC_PRICE_IN_PER_MTOK=... ANTHROPIC_PRICE_OUT_PER_MTOK=...
python -m prompt_insights eval-provider --input data/benchmark.ndjson --mode anthropic --yes
```

This makes one paid call per benchmark row and writes `artifacts/provider-eval.json` with quality, measured
tokens, latency and cost. Prices come from your provider's pricing page; cost stays `null` without them.
Still to do: show this in `/metrics` and serve `allowLlm` in `/classify`.

## Checks

```bash
python -m ruff check . && python -m ruff format --check .
python -m pytest -q                       # includes contract tests against the frontend mocks
cd web && npm run lint && npm run build
```

## Limits

- Synthetic and public data only, and a 70-row benchmark: one prompt moves confidential recall by about 5 points.
- Mixed-topic prompts are never labelled `other`, because kNN always votes for the nearest topic.
- Names aren't detected, so they stay visible after redaction.
- Similarity scores are not confidence, and `other` is a topic, not an uncertainty score.
- Topic labels describe text. They can't show whether someone did their job, broke a policy or leaked a secret.

## Repo layout

| Path | What |
|---|---|
| `src/prompt_insights/` | `api.py` (HTTP), `embed.py` (kNN), `risk.py` (rules), `report.py` (weekly report), `bench.py` (metrics), `providers.py` (LLM), `gateway.py` (import), `core.py` (starter corpus, baseline, suppression) |
| `data/` | `benchmark.ndjson` (frozen), `demo-events.ndjson` (synthetic gateway export), `dolly-topics.ndjson`, starter `prompts.ndjson` |
| `web/` | Next.js frontend, see [web/README.md](web/README.md) |
| `docs/` | Evaluation, backend design, data governance |
| `tests/` | Backend tests, including frontend contract checks |

Built from the Noetic starter repo. Dependency attributions are in `THIRD_PARTY_NOTICES.md`. The starter grants no
open-source licence.
