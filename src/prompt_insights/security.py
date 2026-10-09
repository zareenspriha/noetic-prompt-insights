"""Who may change the model, and a record of every change (OWASP A01, A07, A09).

Corrections retrain the k-NN index, so they need a reviewer token:

    PI_REVIEWER_TOKENS="spriha:<long random token>,nikhil:<long random token>"

Requests send `Authorization: Bearer <token>`. With no tokens configured, corrections are
refused unless PI_ENV=development, where they are recorded as reviewer "local-dev".
Tokens are compared in constant time and never logged.
"""

import hmac
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Header, HTTPException

MIN_TOKEN_LENGTH = 16
DEV_REVIEWER = "local-dev"
AUDIT = Path(os.environ.get("PI_AUDIT_LOG", "artifacts/audit.ndjson"))


def development():
    return os.environ.get("PI_ENV") == "development"


def reviewer_tokens():
    """token -> reviewer name. Malformed or short entries are ignored, never half-trusted."""
    tokens = {}
    for entry in os.environ.get("PI_REVIEWER_TOKENS", "").split(","):
        name, separator, token = entry.strip().partition(":")
        if separator and name and len(token) >= MIN_TOKEN_LENGTH:
            tokens[token] = name
    return tokens


def require_reviewer(authorization: str | None = Header(None)):
    """FastAPI dependency: returns the reviewer's name or refuses the request."""
    tokens = reviewer_tokens()
    if not tokens:
        if development():
            return DEV_REVIEWER
        raise HTTPException(503, "Corrections are disabled: no reviewer tokens are configured")
    scheme, _, supplied = (authorization or "").partition(" ")
    reviewer = None
    if scheme.lower() == "bearer" and supplied:
        for token, name in tokens.items():
            if hmac.compare_digest(token.encode(), supplied.strip().encode()):
                reviewer = name
    if reviewer is None:
        raise HTTPException(
            401, "A valid reviewer token is required", headers={"WWW-Authenticate": "Bearer"}
        )
    return reviewer


def audit(action, reviewer, item_id, before, after):
    """Append one line per change: when, who, what. Labels only; no prompt text, no tokens."""
    entry = dict(
        at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        action=action,
        reviewer=reviewer,
        itemId=item_id,
        before=before,
        after=after,
    )
    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    with AUDIT.open("a") as log:
        log.write(json.dumps(entry, sort_keys=True) + "\n")
