#!/usr/bin/env python3
"""
One model call per chat turn, behind a tiny provider switch.

Pick a provider with environment variables (first match wins unless
LLM_PROVIDER forces one):

* anthropic — ANTHROPIC_API_KEY set. Model: LLM_MODEL (default claude-haiku-5-5).
* openai    — OPENAI_COMPATIBLE_BASE_URL set (OpenAI, Groq, OpenRouter, or a
              local Ollama at http://localhost:11434/v1). Optional OPENAI_API_KEY.
              Model: LLM_MODEL (required).
* offline   — no keys. A scripted stand-in so the full flow (talk, propose,
              approve, recall) can be demoed and tested without any model.

Every provider gets the same inputs and returns plain text. The creature's
only way to affect stored memory is the <propose_memory> line parsed in chat.py.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any, Dict, List

DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5"
MAX_OUTPUT_TOKENS = 600


class LLMError(RuntimeError):
    pass


def provider_name() -> str:
    forced = os.environ.get("LLM_PROVIDER", "").strip().lower()
    if forced in ("anthropic", "openai", "offline"):
        return forced
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("OPENAI_COMPATIBLE_BASE_URL"):
        return "openai"
    return "offline"


def _post_json(url: str, headers: Dict[str, str], payload: Dict[str, Any], timeout: int = 45) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise LLMError(f"Model API returned {exc.code}: {detail}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise LLMError(f"Couldn't reach the model API: {exc}") from exc


def _anthropic(system: str, messages: List[Dict[str, str]]) -> str:
    data = _post_json(
        "https://api.anthropic.com/v1/messages",
        {
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
        },
        {
            "model": os.environ.get("LLM_MODEL") or DEFAULT_ANTHROPIC_MODEL,
            "max_tokens": MAX_OUTPUT_TOKENS,
            "system": system,
            "messages": messages,
        },
    )
    text = "".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text")
    if not text.strip():
        raise LLMError("The model returned an empty reply.")
    return text


def _openai_compatible(system: str, messages: List[Dict[str, str]]) -> str:
    base = os.environ["OPENAI_COMPATIBLE_BASE_URL"].rstrip("/")
    model = os.environ.get("LLM_MODEL", "")
    if not model:
        raise LLMError("Set LLM_MODEL for the OpenAI-compatible provider (e.g. llama3.1 for Ollama).")
    headers = {}
    if os.environ.get("OPENAI_API_KEY"):
        headers["Authorization"] = f"Bearer {os.environ['OPENAI_API_KEY']}"
    data = _post_json(
        f"{base}/chat/completions",
        headers,
        {
            "model": model,
            "max_tokens": MAX_OUTPUT_TOKENS,
            "messages": [{"role": "system", "content": system}] + messages,
        },
        timeout=120,
    )
    try:
        text = data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMError("Unexpected response shape from the model API.") from exc
    if not text.strip():
        raise LLMError("The model returned an empty reply.")
    return text


_REMEMBER = re.compile(r"^\s*(?:please\s+)?remember(?:\s+that)?[\s,:]+(.+)$", re.IGNORECASE | re.DOTALL)
_RECALL = re.compile(r"what do you (?:remember|know)|do you remember", re.IGNORECASE)


def _offline(system: str, messages: List[Dict[str, str]], context: Dict[str, Any]) -> str:
    """Scripted stand-in. Clearly labeled in the UI; never pretends to be a model."""
    name = context.get("name", "Your creature")
    last = messages[-1]["content"] if messages else ""
    kept = context.get("approved_memories", [])

    match = _REMEMBER.match(last)
    if match:
        fact = " ".join(match.group(1).split()).rstrip(".")
        return (
            "Noted. I've asked to keep that — it's waiting for your approval.\n"
            f'<propose_memory category="project">{fact}.</propose_memory>'
        )
    if _RECALL.search(last):
        if not kept:
            return "Nothing yet. I only keep what you approve."
        return "Here's what you've let me keep: " + " / ".join(m["content"] for m in kept[:8])
    return (
        f"{name} here, running in offline demo mode (no AI model connected yet). "
        "Try “remember that …”, then ask “what do you remember?”"
    )


def generate_reply(system: str, messages: List[Dict[str, str]], context: Dict[str, Any]) -> str:
    provider = provider_name()
    if provider == "anthropic":
        return _anthropic(system, messages)
    if provider == "openai":
        return _openai_compatible(system, messages)
    return _offline(system, messages, context)
