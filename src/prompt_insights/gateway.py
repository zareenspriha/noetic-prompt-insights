"""Strict shared gateway contract; auth import exports aggregate metadata only."""

from collections import Counter
import ipaddress
import json
import os
from urllib.parse import urlsplit
import httpx
from jsonschema import Draft202012Validator, FormatChecker
from ._gateway_schema import SCHEMA
from .core import classify, classify_sensitivity

VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())
MAX_BYTES = 2000000


def _invalid_number(_value):
    raise ValueError("Nonfinite JSON measurement")


def parse_ndjson(data):
    if not isinstance(data, bytes) or len(data) > MAX_BYTES:
        raise ValueError("Gateway export exceeds size limit")
    rows = {}
    try:
        for line in data.splitlines():
            if not line.strip():
                continue
            if len(line) > 65536:
                raise ValueError("Gateway record exceeds size limit")
            row = json.loads(line, parse_constant=_invalid_number)
            if not VALIDATOR.is_valid(row):
                raise ValueError("Gateway contract violation")
            key = row["event_id"]
            if key in rows and rows[key] != row:
                raise ValueError("Conflicting gateway event identifier")
            rows[key] = row
            if len(rows) > 1000:
                raise ValueError("Gateway record limit exceeded")
    except (UnicodeError, json.JSONDecodeError, RecursionError, TypeError):
        raise ValueError("Invalid gateway NDJSON") from None
    return list(rows.values())


def fetch_gateway(base_url, token=None, transport=None):
    token = token or os.environ.get("GATEWAY_TOKEN", "")
    url = urlsplit(base_url)
    try:
        loopback = url.hostname == "localhost" or ipaddress.ip_address(url.hostname).is_loopback
    except ValueError:
        loopback = False
    if (
        url.scheme not in ("http", "https")
        or not url.hostname
        or url.username
        or url.password
        or url.query
        or url.fragment
        or url.path not in ("", "/")
        or (url.scheme == "http" and not loopback)
        or not token
    ):
        raise ValueError("Gateway requires a bearer token and HTTPS or loopback HTTP")
    try:
        with httpx.Client(timeout=10, transport=transport, follow_redirects=False) as client:
            with client.stream(
                "GET",
                base_url.rstrip("/") + "/events",
                headers={"Authorization": "Bearer " + token},
            ) as response:
                response.raise_for_status()
                content = bytearray()
                for chunk in response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_BYTES:
                        raise ValueError("Gateway export exceeds size limit")
        rows = json.loads(content)
        if not isinstance(rows, list) or len(rows) > 1000:
            raise ValueError("Gateway response must be a bounded event array")
        return parse_ndjson("\n".join(json.dumps(row) for row in rows).encode())
    except (httpx.HTTPError, TypeError, ValueError):
        raise ValueError("Gateway fetch failed; verify authentication and contract") from None


def summarize_gateway(rows):
    # Revalidate callers, not just the CLI path.
    rows = parse_ndjson("\n".join(json.dumps(row) for row in rows).encode())
    eligible = [r for r in rows if r["status"] == "succeeded"]
    with_text = [r for r in eligible if r.get("prompt_redacted")]
    return dict(
        events=len(rows),
        classified=len(with_text),
        missing_text=len(eligible) - len(with_text),
        excluded_status=len(rows) - len(eligible),
        topics=dict(Counter(classify(r["prompt_redacted"]) for r in with_text)),
        sensitivities=dict(Counter(classify_sensitivity(r["prompt_redacted"]) for r in with_text)),
        providers=dict(Counter(r["provider"] for r in rows)),
        note="Authenticated gateway exports contain metadata only. Only explicit synthetic redacted fixture text is classified.",
    )
