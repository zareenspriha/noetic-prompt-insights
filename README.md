# Prompt Insights

Build an explainable view of what people ask AI tools **using consented prompt data**. This starter ships 280 original synthetic prompts across seven topics, transparent keyword topic and policy-marker sensitivity classifiers, a family-held-out evaluation, a Streamlit explorer, and an importer for the AI Gateway starter's exact event contract. Everything runs offline by default.

## Three-minute demo

Use Python 3.11 or 3.12 in this repository:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock
python -m pip install --no-build-isolation --no-deps -e .
python -m prompt_insights demo --out artifacts/demo
python -m pytest -q
python -m streamlit run src/prompt_insights/ui.py
```

Installation requires package downloads; subsequent mock demos do not need a network or API key.

1. View the topic chart and family-held-out score.
2. Submit `Debug a python function` in mock mode, then try `python contract` to see ambiguity produce `other`.
3. Inspect `artifacts/demo/evaluation.json`: denominators and per-class precision/recall/F1 for topic and sensitivity and confusion matrix are included.
4. Import the shipped gateway fixture and inspect a text-free summary:

```bash
python -m prompt_insights import-gateway --input data/gateway-events.ndjson --out artifacts/gateway-summary.json
```

## What is included

- `src/prompt_insights/core.py`: deterministic corpus generator, fixed word-boundary keyword baseline, grouped split, evaluation, aggregates.
- `data/prompts.ndjson`: 280 generated classroom prompts, 40 per topic. Every row carries its synthetic provenance, topic, sensitivity and template-family labels.
- `schemas/gateway-event.schema.json`: exact shared gateway contract. Its packaged Python mirror supports installed use; a regression test prevents drift.
- `gateway.py`: bounded NDJSON validation, event-ID deduplication, authenticated metadata fetch and aggregate-only output.
- `providers.py` and `transport.py`: optional bounded, typed OpenAI/Anthropic classifier. Keys stay in environment variables. Provider errors never print request bodies or credentials.
- `ui.py`: topic explorer, upload importer and an explicit one-call submission form.

Topic categories are coding, writing, data_analysis, customer_email, legal, hr and other. Other covers miscellaneous, mixed and unrecognized topics; it is not a calibrated uncertainty estimate. The baseline is fixed and has no fitted parameters; the training split is available for your improved model. Six template families (210 rows) are development data; two different wrapper families (70 rows) are validation data. Topic phrases and explicit sensitivity markers still overlap, so this is a synthetic development check, **not evidence of production accuracy or domain generalization**. Keep an additional untouched test set when you begin tuning.

Sensitivity labels are `public`, `internal`, and `confidential`. The deterministic baseline treats confidential/secret/password/credential markers as confidential, internal/private markers as internal, and other text as public. These rules label a fictional classroom policy; **public does not establish that arbitrary text is safe to disclose**. Each synthetic topic has all three sensitivity labels; the explicit markers deliberately make sensitivity a simple starter exercise. Students should add independent, implicit and adversarial sensitivity cases and measure false negatives. Live classification must return both allowlisted labels; no extra fields are accepted.

## Connect the AI Gateway starter

The gateway exposes `GET /events` with `Authorization: Bearer <token>`. Start that repository separately, configure an identity token there, and set the same token in this shell:

```bash
export GATEWAY_TOKEN='your-local-demo-token'
python -m prompt_insights import-gateway --url http://127.0.0.1:8000 --out artifacts/gateway-metadata.json
```

The authenticated endpoint returns a JSON array of **metadata only**. The importer deliberately reports missing text rather than inventing topics. Content integration uses the explicit synthetic NDJSON export in `data/gateway-events.ndjson`. A `prompt_redacted` field is accepted only when `synthetic=true`; unknown fields, malformed timestamps, conflicting event IDs and oversized exports are rejected. Failed/blocked events are counted but never classified. No token or prompt text appears in the summary. Remote connections require HTTPS; localhost HTTP is for the classroom only. This starter does not verify who originally authored an offline export.

## Optional provider experiment

Mock mode remains default even when keys exist. `.env.example` lists names; this starter does not automatically load `.env` files. Set environment variables yourself for one provider:

```bash
export OPENAI_API_KEY='your-key'
export OPENAI_MODEL='a-chat-completions-compatible-model-you-have-access-to'
# Or ANTHROPIC_API_KEY and ANTHROPIC_MODEL
```

Choose the provider in the UI, authorize sending the text and a paid request, then click **Classify once**. A rerun or chart interaction does not issue another call. The model must return a strict topic-and-sensitivity object; malformed responses are rejected, not silently replaced by mock results. There are no automatic retries. You can also call `classify_prompt(text, mode='openai', allow_live=True)` from Python. No live requests were needed to validate the starter; provider wire formats are tested with mock transports. There is no cost estimator or confidence calibration.

API references: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages). Model access and pricing depend on your account.

## Student work

1. Establish a TF-IDF/logistic or embedding baseline using only the training families. Compare topic and sensitivity macro-F1 and errors against keywords.
2. Add genuinely new human-written test prompts, paraphrase families, mixed-topic examples and prompt-injection attempts. Freeze that test set before tuning.
3. Improve sensitivity detection beyond explicit markers, reporting confidential false negatives. Design a multi-label taxonomy and decide how uncertainty appears to a user. Do not turn similarity scores into unsupported probabilities.
4. Improve aggregates with time windows and minimum group sizes. Document consent, retention and deletion requirements before importing real prompts.
5. Evaluate the optional provider on the same frozen inputs; report model/version, latency, measured token usage and cost separately from quality.

Success means a reproducible report with honest error analysis and a working UI. Topic classification cannot establish whether an employee performed work, violated policy, or disclosed secrets. The dataset is synthetic and contains no corporate captures. No open-source licence is granted by this starter.

Dependency versions are pinned in `requirements.lock` for Python 3.11–3.12 on macOS/Linux. See `THIRD_PARTY_NOTICES.md` for dependency attribution.
