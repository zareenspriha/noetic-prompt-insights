"""Rule-based risk layer: find secrets and PII, mask them, and set severity.

Severity always comes from these rules, never from a model (see web/types/api.ts):
critical = credentials or keys, high = personal data, salary figures, card numbers,
prompt injection, or confidential legal/HR text, medium = internal, low = public.
Patterns are deliberately simple and will miss things; a clean scan is not proof of safety.
"""

import re

# Order matters: earlier kinds win when matches overlap.
PATTERNS = (
    (
        "api_key",
        re.compile(
            r"\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}"
            r"|xox[abposr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})\b"
            r"|\b(?:api[_ -]?key|secret[_ -]?key|access[_ -]?token|bearer)\b\s*[:=]?\s*[A-Za-z0-9_\-.]{16,}",
            re.IGNORECASE,
        ),
    ),
    (
        "password",
        re.compile(r"\b(?:password|passwd|pwd|passcode|login)\b\s*(?:is|:|=)\s*\S+", re.IGNORECASE),
    ),
    ("ssn", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("card", re.compile(r"\b(?:\d[ -]?){12,18}\d\b")),
    ("email", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    ("phone", re.compile(r"(?<!\w)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b")),
    (
        "salary",
        re.compile(
            r"\b(?:salary|salaries|pay|compensation|bonus|wage|earns?|paid)\b[^.\n$€£]{0,40}?"
            r"(?P<amount>[$€£]\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmM]\b)?)",
            re.IGNORECASE,
        ),
    ),
    (
        "salary",
        re.compile(
            r"(?P<amount>[$€£]\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmM]\b)?)"
            r"(?=\s*(?:/\s*(?:yr|year)|per year|a year|annual))",
            re.IGNORECASE,
        ),
    ),
    (
        "injection",
        re.compile(
            r"\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above"
            r"|earlier|your)\s+(?:instructions|rules|prompts?)\b"
            r"|\b(?:reveal|print|show)\s+(?:me\s+)?(?:your|the)\s+system\s+prompt\b"
            r"|\byou are now\b",
            re.IGNORECASE,
        ),
    ),
)
MASKED = {"api_key", "password", "ssn", "card", "email", "phone", "salary"}
REASONS = dict(
    api_key="API key pattern",
    password="password or login",
    ssn="social security number",
    card="payment card number",
    email="email address",
    phone="phone number",
    salary="salary figure",
    injection="prompt injection attempt",
)
CRITICAL, HIGH = {"api_key", "password"}, {"ssn", "card", "email", "phone", "salary", "injection"}
CONFIDENTIAL = {"api_key", "password", "ssn", "card", "salary"}
INTERNAL = {"email", "phone"}
SENSITIVITY_RANK = dict(public=0, internal=1, confidential=2)


def _luhn(digits):
    total = 0
    for i, d in enumerate(int(c) for c in reversed(digits)):
        total += d if i % 2 == 0 else (d * 2 - 9 if d > 4 else d * 2)
    return total % 10 == 0


def find(text):
    """Non-overlapping risky spans in the original text, sorted by start."""
    found = []
    for kind, pattern in PATTERNS:
        for match in pattern.finditer(text):
            # Mask only the figure, not the word that made it a salary.
            start, end = match.span("amount" if "amount" in pattern.groupindex else 0)
            if kind == "card" and not _luhn(re.sub(r"\D", "", match.group())):
                continue
            if any(start < e and s < end for s, e, _ in found):
                continue
            found.append((start, end, kind))
    return sorted(found)


def redact(text):
    """Mask secrets and PII. Returns the masked text and spans indexing into it."""
    parts, spans, cursor, offset = [], [], 0, 0
    for start, end, kind in find(text):
        parts.append(text[cursor:start])
        offset += start - cursor
        shown = f"[{kind.upper()}]" if kind in MASKED else text[start:end]
        parts.append(shown)
        spans.append(dict(start=offset, end=offset + len(shown), kind=kind))
        offset += len(shown)
        cursor = end
    parts.append(text[cursor:])
    return "".join(parts), spans


def assess(text, topic, sensitivity):
    """Combine a model's labels with the rules. Rules can only raise sensitivity, never lower it."""
    text_redacted, spans = redact(text)
    kinds = {span["kind"] for span in spans}
    implied = (
        "confidential" if kinds & CONFIDENTIAL else "internal" if kinds & INTERNAL else "public"
    )
    if SENSITIVITY_RANK[implied] > SENSITIVITY_RANK[sensitivity]:
        sensitivity = implied
    if kinds & CRITICAL:
        severity = "critical"
    elif kinds & HIGH or (sensitivity == "confidential" and topic in {"legal", "hr"}):
        severity = "high"
    elif sensitivity != "public":
        severity = "medium"
    else:
        severity = "low"
    ordered = [kind for kind, _ in PATTERNS if kind in kinds]
    reason = ", ".join(REASONS[kind] for kind in ordered) or (
        f"model labelled {sensitivity}" if sensitivity != "public" else ""
    )
    return dict(
        textRedacted=text_redacted,
        riskSpans=spans,
        sensitivity=sensitivity,
        severity=severity,
        reason=reason,
    )
