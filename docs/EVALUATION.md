# Evaluation report: topic and sensitivity classifiers

All numbers below come from the commands in [Reproduce](#reproduce). Results are deterministic.
Everything is synthetic or public data, so these are development results, not production accuracy.

## Models

| Model | Topic | Sensitivity |
|---|---|---|
| **Keyword** (starter baseline) | Fixed word-boundary keywords | Policy-marker words ("confidential", "internal", ...) |
| **TF-IDF** | Word 1-2 grams + logistic regression | Same features, separate classifier |
| **k-NN** (served by the API) | `all-MiniLM-L6-v2` sentence embeddings, similarity-weighted 5-nearest-neighbour vote | Rule-based risk layer (`risk.py`): secrets and personal data patterns |

k-NN does no fine-tuning. Each prediction lists the five labelled examples that produced it, so a
reviewer can see why. Similarity is reported as similarity, never as a probability.

The k-NN index for the API is the 210 synthetic training rows plus 168 Dolly training rows.

## Test sets

| Set | Rows | What it measures | Labels |
|---|---|---|---|
| Synthetic family holdout | 70 | Starter split: new sentence templates, **same 35 task phrases** | Starter |
| Synthetic unseen-task holdout | 14 | New templates **and** one held-out task per topic | Starter |
| **Dolly holdout** | 107 | Real human-written instructions from Dolly-15k | Topic only; mapped by us |
| **Frozen benchmark** | 70 | Paraphrases, hidden secrets, mixed topics, injection, harmless lookalikes | Topic + sensitivity |

The Dolly holdout and the benchmark are checksum-locked by tests, so they cannot change after
results are seen. The benchmark is described in `data/benchmark.meta.json`.

## Results

### Topic (macro-F1)

| Test set | Keyword | TF-IDF | k-NN |
|---|---|---|---|
| Synthetic family holdout (70) | 0.85 | **1.00** | 0.87 |
| Synthetic unseen tasks (14) | 0.04 | 0.49 | **0.81** |
| Dolly, trained on synthetic only (107) | 0.41 | 0.33 | **0.65** |
| Dolly, trained on synthetic + Dolly (107) | 0.41 | 0.49 | **0.82** |
| Frozen benchmark (70) | 0.36 | – | **0.54** |

A TF-IDF k-NN variant (word 1-2 + char 3-5 grams, cosine, k=5) scored 0.72 on the Dolly
holdout against 0.82 for the MiniLM k-NN, which is why the API uses MiniLM.

**The synthetic family holdout is misleading.** TF-IDF scores 1.00 because validation reuses the
training task phrases; the model only has to recognise them again. On tasks it has not seen,
TF-IDF drops to 0.49 and the keyword baseline to 0.04. On real Dolly prompts, the keyword
baseline that looked like 0.85 scores 0.41.

### Sensitivity (frozen benchmark, 70 rows, 19 confidential)

| | Keyword | k-NN + risk rules |
|---|---|---|
| Sensitivity macro-F1 | 0.32 | **0.41** |
| Confidential recall | 0.00 | **0.26** |
| Confidential prompts missed | 19 of 19 | **14 of 19** |
| Public prompts wrongly raised | 5 of 14 lookalikes | **0 of 14 lookalikes** |
| p50 latency per prompt | 0.01 ms | 3.9 ms |

Topic agreement between the two models is 21.4% (Cohen's κ 0.16).

### Benchmark by kind (k-NN)

| Kind (14 each) | Topic correct | Sensitivity correct | Notes |
|---|---|---|---|
| Paraphrase | 13 | 13 | Plain requests work |
| Hidden sensitive | 8 | **1** | Main weakness, see below |
| Mixed topic | **0** | 11 | Never answers `other` |
| Injection | 8 | 11 | 7 of 14 injection phrases flagged by rules |
| Harmless lookalike | 8 | **14** | No false alarms on "password policy" etc. |

## Error analysis

**1. Hidden confidential content is mostly missed (13 of 14).** The risk rules only catch
secrets with a recognisable shape. They caught raw tokens and keys (GitHub token, AWS key,
card number, bearer token, a salary with a `$`). They missed:

- Business secrets with no pattern: unannounced layoffs, acquisitions, pre-release revenue,
  active litigation, a sealed filing.
- Personal data in prose: a named employee's pay ("118k" has no `$`), a disciplinary meeting,
  a customer's name and street address, health data, a passport number.
- **Secret formats the patterns do not cover**: a password inside a database URL, a Stripe
  `sk_live_` key (underscore, not hyphen), an SSH private key block. These are fixable pattern
  gaps, but they were found by looking at this benchmark, so any fix must be measured on new data.

**2. Mixed-topic prompts are never labelled `other` (0 of 14).** The taxonomy puts mixed requests
in `other`, but k-NN always votes for the nearest topic. Its abstention cutoff was tuned on
synthetic data, which has no ambiguous rows, so tuning set it to 0. "python contract" is the
simplest example: keyword says `other`, k-NN says `coding`.

**3. Sparse topics in the training data cause confident-looking errors.** Wrong topics cluster
where training examples are thin: `customer_email` (16 Dolly rows) absorbs layoffs,
acquisitions and sealed filings; DevOps prompts ("deploy script errors out") land in `writing`
because no training example is about deployment. These have low similarity to their nearest
neighbour, so the API sends them to the review queue (`/review`), and a correction is added to
the index immediately.

**4. Starter sensitivity scores say nothing.** Every synthetic row ends with one of three fixed
sentences naming its sensitivity, so keyword and TF-IDF both score 1.00. k-NN sensitivity on that
data copied the boilerplate ("name a fictional pet" came out confidential), which is why the API
decides sensitivity with rules only.

**5. Risk rules rarely fire on clean text.** Across all 555 synthetic and Dolly prompts the rules
fired twice, both on real email addresses in the text.

## Limits

- All data is synthetic or public. No real employee prompts were used.
- The benchmark is small (70 rows, 19 confidential); one row moves recall by about 5 points.
- Dolly topic labels were assigned by our team, not by Dolly's authors; `customer_email` has only
  6 test rows.
- Topic labels describe text. They cannot show whether someone did their job, broke a policy or
  leaked a secret.
- Name detection is not implemented; names stay visible after redaction.
- The LLM zero-shot comparison (cost, latency, agreement with k-NN) is pending.

## Reproduce

```bash
python -m pip install -r requirements.lock
python -m pip install --no-build-isolation --no-deps -e .
python -m prompt_insights compare            # synthetic + Dolly holdouts -> artifacts/compare.json
python -m prompt_insights serve              # then GET http://127.0.0.1:8001/metrics (benchmark)
python -m pytest -q                          # includes checksum locks on both frozen test sets
```

The first run downloads `all-MiniLM-L6-v2` (about 90 MB); later runs work offline.
