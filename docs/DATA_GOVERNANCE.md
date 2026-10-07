# Consent, retention and deletion requirements

Status: **requirements, not yet satisfied.** Everything in this repository today is synthetic.
These are the conditions that must hold **before** any real prompt, or real prompt metadata, is
imported. The retention periods are team proposals, not legal advice. Anyone deploying this for
real must confirm them with their privacy/legal function and, where it applies, employee
representatives.

## 1. What we would process

| Data | Source | Contains | Needed for |
|---|---|---|---|
| Event metadata | gateway `GET /events` | pseudonymous `user_id`, `team_id`, timestamp, provider, model, status, tokens, cost, policy actions | volume, cost and status aggregates |
| Redacted prompt text | gateway export field `prompt_redacted` | prompt after the gateway's redaction | topic and sensitivity classification only |
| Derived labels | this project | topic, sensitivity per event | aggregates |
| Aggregates | this project | suppressed counts per window / team | the report people actually see |

Raw (unredacted) prompt text is **never** accepted. The gateway contract has no field for it, and
unknown fields are rejected (`tests/test_gateway.py`).

## 2. Consent

1. **Opt-in, per person, before collection.** Text is collected only from people who actively
   agreed. Silence or continued use doesn't count as consent. Without consent, only event
   metadata is processed, never text.
2. **Informed.** The notice says: what is collected (section 1), the single purpose
   (aggregate insight into what kinds of tasks people use AI for), who sees what (section 6),
   the retention periods (section 3), and how to withdraw and delete (section 4).
3. **Granular.** Metadata-only and metadata-plus-redacted-text are separate choices.
4. **Freely given.** Employer–employee consent is rarely free, so we need **no consequence for
   declining**. The data must never be used for performance review, discipline or monitoring
   individuals. Topic labels describe text. They can't establish whether someone did their job,
   broke a policy or disclosed a secret.
5. **Revocable at any time**, as easily as it was given. Withdrawing consent starts deletion (section 4).
6. **Recorded.** We keep a consent record: pseudonymous user id, consent version, scope,
   given-at, withdrawn-at. The record never includes prompt content.
7. **Machine-enforced at import.** Today, `prompt_redacted` is accepted only when
   `synthetic=true`. Accepting real text requires a reviewed contract change, e.g. a
   `consent_version` field that the importer checks against the consent record. The gateway
   schema is shared with the AI Gateway starter, so that change must be agreed with them.
   Until then, the importer **cannot** ingest real prompt text, and that's intended.

## 3. Retention (proposed)

| Data | Keep for | Then |
|---|---|---|
| Redacted prompt text | Until classified, **max 30 days** | Deleted; labels kept |
| Event metadata + labels | **90 days** | Deleted |
| Published aggregates (suppressed) | 13 months (year-over-year comparison) | Deleted |
| Consent records | While consent is active + 1 year after withdrawal (proof of lawful basis) | Deleted |
| Gateway bearer token | Environment variable only; never written to disk by this project | Rotated after the event |
| Backups | Same periods as the source; expired data must not be restored | — |

Retention is measured from the event `timestamp`, which is UTC and strictly validated (malformed or
impossible timestamps are rejected so they can't dodge expiry).

## 4. Deletion

1. **Self-service request.** A person can ask for deletion of everything linked to their
   pseudonymous `user_id`, either by withdrawing consent or with a plain request.
2. **Scope.** All events, redacted text and labels for that `user_id`, everywhere they're stored,
   **within 30 days**. That includes derived stores such as review queues or any kNN index built
   from imported prompts.
3. **Aggregates are recomputed** from the remaining data. Already-published aggregate reports
   aren't recalled; they contained no text and only cells meeting the group-size thresholds.
   We say this in the notice.
4. **Verification.** We log that a deletion happened (who requested it, when, how many rows), never
   what was deleted.
5. **Expiry deletion** (section 3) runs automatically, not on request.

## 5. Minimisation and aggregate privacy (implemented)

What the code does today:

- **Text-free outputs.** `summarize_gateway` output contains no prompt text, user ids or event
  ids. Tests in `tests/test_aggregates.py` check this with every synthetic event.
- **Minimum group sizes.** A count is published only if it covers ≥ 10 events **and** ≥ 3
  distinct people (`MIN_GROUP_SIZE`, `MIN_DISTINCT_USERS` in `core.py`). Otherwise it's `null`.
- **Secondary suppression.** If exactly one cell in a table is hidden, the next-smallest is
  hidden too, so the published total can't reveal it by subtraction.
- **Empty small groups.** A window/team below the thresholds publishes no labels at all.
- **Failed and blocked events** are counted but never classified.
- **Size and shape limits** on imports: 2 MB, 1000 events, strict schema, deduplication by event id.

Known gaps, stated honestly:

- **Differencing across tables isn't prevented.** The org-wide, per-window and per-team tables
  overlap, and so do consecutive exports. Someone comparing them can sometimes narrow down a
  suppressed cell. Mitigations before real use: publish one granularity per report, don't offer
  free-form filters over small populations, and consider adding noise (differential privacy).
- **A window or team appearing at all** reveals that it had at least one event.
- **Pseudonymous ≠ anonymous.** `user_id` and `team_id` can be linked back to people by whoever
  runs the gateway.
- **Offline exports aren't authenticated**, so we can't verify who produced an NDJSON file.
- **Redaction quality depends on the gateway.** This project doesn't re-check that
  `prompt_redacted` is actually redacted.

## 6. Access

| Role | Sees |
|---|---|
| Employees (data subjects) | The notice, their consent record, their deletion status |
| Report viewers | Suppressed aggregates only |
| Operators | Gateway token (env var), import logs without content |
| Nobody through this project | Raw prompts, per-person reports |

## 7. Checklist before importing real data

- [ ] Lawful basis and consent notice reviewed by privacy/legal; employee representatives consulted where required
- [ ] Consent record store and `consent_version` contract change agreed with the gateway owners
- [ ] Retention jobs implemented and tested for every store in section 3
- [ ] Per-user deletion implemented, including derived stores, with a deletion log
- [ ] Report granularity fixed to limit differencing (section 5)
- [ ] HTTPS-only gateway connection (already enforced outside loopback)
