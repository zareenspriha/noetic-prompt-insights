"""Small provider boundary: no retries, no automatic live fallback, no key logging."""

import os
import json
import time
import httpx


def _count(value):
    """Provider-reported token count, or None when absent or malformed."""
    if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
        return value
    return None


def require_live(mode, allow_live):
    """Raise before any request unless the call is approved and fully configured."""
    if not allow_live:
        raise ValueError("Live calls require explicit allow_live approval")
    if mode not in ("openai", "anthropic"):
        raise ValueError("Unsupported provider mode")
    key = os.environ.get(mode.upper() + "_API_KEY", "")
    model = os.environ.get(mode.upper() + "_MODEL", "")
    if not key or not model:
        raise ValueError("Provider key and model must be configured in the environment")
    return key, model


def request_json(system, payload, schema, mode, allow_live=False, transport=None):
    return request_structured(system, payload, schema, mode, allow_live, transport)["content"]


def request_structured(system, payload, schema, mode, allow_live=False, transport=None):
    """One structured call. Returns content plus measured usage:
    {content, model, input_tokens, output_tokens, latency_ms}. Tokens are None when the
    provider does not report them; they are never estimated here."""
    key, model = require_live(mode, allow_live)
    if mode == "openai":
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {key}"}
        body = dict(
            model=model,
            messages=[
                dict(role="system", content=system + " Return JSON only."),
                dict(role="user", content=payload),
            ],
            response_format={"type": "json_object"},
            max_completion_tokens=1024,
        )
    else:
        url = "https://api.anthropic.com/v1/messages"
        headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
        body = dict(
            model=model,
            system=system,
            max_tokens=1024,
            messages=[dict(role="user", content=payload)],
            tools=[
                dict(
                    name="submit_result",
                    description="Submit the bounded analysis result",
                    input_schema=schema,
                )
            ],
            tool_choice={"type": "tool", "name": "submit_result"},
        )
    try:
        started = time.perf_counter()
        with httpx.Client(
            timeout=httpx.Timeout(30, connect=5),
            transport=transport,
            follow_redirects=False,
            trust_env=False,
        ) as client:
            with client.stream("POST", url, headers=headers, json=body) as response:
                response.raise_for_status()
                content = bytearray()
                for chunk in response.iter_bytes():
                    if len(content) + len(chunk) > 100000:
                        raise ValueError("Provider response too large")
                    content.extend(chunk)
                data = json.loads(content)
        latency_ms = (time.perf_counter() - started) * 1000
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        reported = data.get("model")
        measured = dict(
            model=reported if isinstance(reported, str) and 0 < len(reported) <= 128 else model,
            input_tokens=_count(usage.get("prompt_tokens" if mode == "openai" else "input_tokens")),
            output_tokens=_count(
                usage.get("completion_tokens" if mode == "openai" else "output_tokens")
            ),
            latency_ms=latency_ms,
        )
        if mode == "openai":
            return dict(content=data["choices"][0]["message"]["content"], **measured)
        blocks = [
            block
            for block in data["content"]
            if block.get("type") == "tool_use" and block.get("name") == "submit_result"
        ]
        if len(blocks) != 1:
            raise ValueError("Missing structured provider response")
        return dict(content=json.dumps(blocks[0]["input"]), **measured)
    except (
        httpx.HTTPError,
        KeyError,
        IndexError,
        TypeError,
        ValueError,
        AttributeError,
        RecursionError,
    ):
        raise ValueError(
            "Provider request failed or returned an invalid structured result"
        ) from None
