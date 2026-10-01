"""Small provider boundary: no retries, no automatic live fallback, no key logging."""

import os
import json
import httpx


def request_json(system, payload, schema, mode, allow_live=False, transport=None):
    if not allow_live:
        raise ValueError("Live calls require explicit allow_live approval")
    if mode not in ("openai", "anthropic"):
        raise ValueError("Unsupported provider mode")
    key = os.environ.get(mode.upper() + "_API_KEY", "")
    model = os.environ.get(mode.upper() + "_MODEL", "")
    if not key or not model:
        raise ValueError("Provider key and model must be configured in the environment")
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
        if mode == "openai":
            return data["choices"][0]["message"]["content"]
        blocks = [
            block
            for block in data["content"]
            if block.get("type") == "tool_use" and block.get("name") == "submit_result"
        ]
        if len(blocks) != 1:
            raise ValueError("Missing structured provider response")
        return json.dumps(blocks[0]["input"])
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
