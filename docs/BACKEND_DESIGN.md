# Backend design — Prompt Insights

Status: **agreed between Person A and Person B (Nikhil)** on 2026-10-07; frontend: Sanjana.
The frontend contract is `web/types/api.ts` (now on `main`). The backend serves exactly that
contract; if a shape must change, change `api.ts` first in its own small PR.

## 1. What the starter gives us (measured, not assumed)

Run on 2026-10-07 from `main` (`f07baad`): 19/19 tests pass.

| Check | n | Accuracy | Macro-F1 |
|---|---|---|---|
| Topic, keyword, train families 0–5 | 210 | 0.829 | 0.851 |
| Topic, keyword, validation families 6–7 | 70 | 0.829 | 0.851 |
| Sensitivity, markers, validation | 70 | 1.000 | 1.000 |

What these numbers really mean:

- **Topic errors are all one pattern.** In each topic, one of the five task phrases contains no keyword,
  for example "find a parser defect", "polish prose", "respond to a buyer", "review an agreement"
  and "plan hiring". Those phrases always fall to `other`, which is the whole 2/10 miss per class.
- **The validation split does not test generalisation.** Validation families only change the
  wrapper sentence. The same 35 task phrases appear in train, so any model we fit will score
  about 100% on validation. That would be meaningless, so we must not pitch it.
- **The sensitivity score is perfect only because it's trivial.** Every row ends with one of three
  fixed sentences that literally contain "Public", "Internal" or "Confidential".
- The gateway fixture prompt "Summarize this synthetic internal HR policy." is classified as `other`,
  because the `hr` keywords don't include "hr" or "policy".

**So the main backend deliverable is a frozen independent benchmark plus honest error analysis,
not a higher validation number.**

## 2. Agreed decisions

| Piece | Decision | Owner | Why |
|---|---|---|---|
| k-NN model | MiniLM embeddings (`embed.py`, `model.py`) | A | On A's 107 frozen Dolly prompts: topic F1 0.82 vs 0.72 for TF-IDF k-NN; 0.66 vs 0.37 with synthetic-only training. Works offline after a one-time model download; CI passes. |
| API framework | FastAPI (`api.py`) | A | Already built and tested. FastAPI is built on Starlette. |
| Port | **8001** for our API: server done; frontend default still 8000 | A (server, done), Sanjana (`web/.env.example`, `web/lib/api.ts`) | The AI Gateway starter already uses 8000, and we import from it. |
| Small-group privacy | B's suppression: ≥10 events **and** ≥3 people, plus secondary suppression | B | See section 4. |
| Time windows | B's `window_key` (day / ISO week / month) with strict timestamps | B | A's report only handles weeks and accepts impossible timestamps. |
| Weekly report endpoint | A's `/report/weekly`, rebuilt to call B's functions | A endpoint, B functions and leak fixes | A's endpoint matches the contract; B's functions do the privacy. |
| Demo events | A's `data/demo-events.ndjson` (Dolly text + planted fake secrets) | A | Gives the flags panel and review queue real content. B's `synthetic_events()` stays as test data for aggregates only. |
| LLM classifier | `providers.py`, `transport.py`, and the `allowLlm` path | B | B owns the provider code. |
| Test sets | Both: A's frozen Dolly set (107, topic on real text) **and** a 70-row adversarial set (hidden secrets, mixed topics, injection) | A | The adversarial set is how sensitivity gets tested. Not built yet. |

## 3. Ownership

| Person A — models, API & evaluation | Person B (Nikhil) — data, gateway, aggregates & LLM |
|---|---|
| `api.py`, `embed.py`, `model.py`, `risk.py`, `report.py`, classifier/evaluation code in `core.py` | `gateway.py`, aggregate/window code in `core.py`, `providers.py`, `transport.py` |
| Tasks 1–3: k-NN baseline, frozen test sets, sensitivity beyond explicit markers | Task 4: time windows + minimum group sizes (done) |
| Demo events, review queue, feedback | Consent, retention & deletion requirements: `docs/DATA_GOVERNANCE.md` (done) |
| | LLM classifier for `/classify` (`allowLlm`) and `/report/weekly?model=llm` |
| | Task 5: live provider on both frozen sets; record model, version, latency, tokens, cost |

## 4. Weekly report on B's privacy functions

B's functions, in `core.py` (tested in `tests/test_aggregates.py`):

```python
MIN_GROUP_SIZE = 10; MIN_DISTINCT_USERS = 3
parse_timestamp(ts) -> datetime                 # rejects month 13, 25:61, non-Z
window_key(ts, "day" | "week" | "month") -> str # "2026-W41" matches TrendPoint.week
suppress_counts(records, field) -> {label: n | None}  # {} if the whole group is too small
windowed_aggregate(records, fields, window, group_by) -> [ {window, group, total, field: {...}} ]
```

Records need `timestamp`, `user_id` and the counted field. Here's what A's current
`report.weekly_report` does, and what needs to change:

| Part | Today | Problem | Fix with B's functions |
|---|---|---|---|
| Heatmap | **Done** (`spriha` 998e46b): uses `suppress_counts` per team | — | — |
| Trend | **Done**: `suppress_counts` per week; hidden points are `null` (`TrendPoint.count: number \| null` in `api.ts`), and weeks with no prompts are true zeros | — | — |
| KPIs | **Done**: a selection below the thresholds gets **422** (`GroupTooSmall`), with the same answer for empty and small selections; a small previous week gives `prevValue: null` | — | — |
| Week parsing | `fromisoformat` | Accepts impossible timestamps if called outside `parse_ndjson` | `window_key(ts, "week")` |
| Flags | One row per event, redacted text | Event-level by design, not aggregate | Keep, but never include `user_id`; the governance doc says report viewers see these (see `DATA_GOVERNANCE.md` §6) |

## 5. Person B next work

1. **LLM classifier.** `transport.request_json` additionally returns measured usage (tokens) and
   latency. Existing callers stay unchanged. `providers.classify_prompt` returns a `Prediction`-shaped
   result: model version, tokens, cost from `LLM_PRICE_IN_PER_MTOK` / `LLM_PRICE_OUT_PER_MTOK`, or
   `null` when no price is set. The LLM only ever sees `textRedacted`. Severity stays rule-based.
   A then replaces the two `501` responses in `api.py` with calls to it.
2. **Task 5.** A CLI runs the provider once over a frozen set and writes model, version, p50 latency,
   measured tokens, cost and quality separately. It needs the frozen sets plus a key the user sets
   in their own shell.

## 6. Merging

Done by A on `spriha` (748d8d3): `main` (frontend) and `Nikhil` (9921c77) are merged and both
conflicts are resolved. Plan: `spriha` → `main` by PR first; then B merges `main` into `Nikhil`
and opens follow-up PRs from there.

## 7. Honest limits

The data is synthetic or public (Dolly), so we make no production-accuracy claims. Topic labels
describe text, not employee intent or misconduct. Regex secret/PII detection has known misses,
which we report. We don't verify consent or authorship of offline exports. Before any real import,
`DATA_GOVERNANCE.md` §7 must be complete.
