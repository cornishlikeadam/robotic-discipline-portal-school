#!/usr/bin/env python3
"""
The chat turn, with the consent rule enforced in code rather than in the prompt:

1. The model sees authored lore + APPROVED memories + this session's messages.
   Older conversation is not sent, so nothing crosses days unless the owner kept it.
2. The model may end a reply with <propose_memory category="...">...</propose_memory>.
3. The server strips those lines and files each as PROPOSED. This module never
   calls review_memory, so no model output can approve, edit, or delete a memory.
"""

from __future__ import annotations

import datetime
import pathlib
import re
from typing import Any, Dict, List, Tuple

from skeleton.interfaces import MEMORY_CATEGORIES, AnimalScryptKernel

from . import llm

PROMPT_PATH = pathlib.Path(__file__).resolve().parents[2] / "skeleton" / "prompts" / "chat_prompt.md"

SESSION_WINDOW = datetime.timedelta(hours=3)
HISTORY_LIMIT = 12
MAX_PROPOSALS_PER_TURN = 2
MAX_MEMORY_CHARS = 280
MAX_HUMAN_CHARS = 2000
MAX_KEPT_IN_PROMPT = 60

_PROPOSAL = re.compile(
    r"<propose_memory\b([^>]*)>(.*?)</propose_memory\s*>",
    re.IGNORECASE | re.DOTALL,
)
_CATEGORY_ATTR = re.compile(r"""category\s*=\s*["']?([a-zA-Z]+)""")
# Any other memory-ish markup the model might invent is removed from the visible reply too.
_STRAY_TAG = re.compile(r"</?\s*(?:propose|approve|save|store|delete)_?memory\b[^>]*>", re.IGNORECASE)


def _normalize(text: str) -> str:
    return " ".join(text.lower().split()).rstrip(".")


def build_system_prompt(companion: Dict[str, Any], approved: List[Dict[str, Any]]) -> str:
    kept = approved[-MAX_KEPT_IN_PROMPT:]
    if kept:
        kept_block = "\n".join(f"- ({m['category']}) {m['content']}" for m in kept)
    else:
        kept_block = "(nothing yet — you don't know anything about your owner beyond this conversation)"
    template = PROMPT_PATH.read_text(encoding="utf-8")
    return (
        template.replace("{{name}}", companion["name"])
        .replace("{{authored_lore}}", companion["authored_lore"])
        .replace("{{approved_memories}}", kept_block)
    )


def session_history(kernel: AnimalScryptKernel, companion_id: str, owner_id: str) -> List[Dict[str, str]]:
    since = (datetime.datetime.now(datetime.timezone.utc) - SESSION_WINDOW).isoformat(timespec="microseconds")
    rows = kernel.recent_messages(companion_id, owner_id, limit=HISTORY_LIMIT, since=since)
    turns: List[Dict[str, str]] = []
    for row in rows:
        role = "user" if row["role"] == "human" else "assistant"
        if turns and turns[-1]["role"] == role:
            turns[-1]["content"] += "\n\n" + row["content"]
        else:
            turns.append({"role": role, "content": row["content"]})
    while turns and turns[0]["role"] != "user":
        turns.pop(0)
    return turns


def extract_proposals(raw_reply: str) -> Tuple[str, List[Dict[str, str]]]:
    proposals: List[Dict[str, str]] = []
    for match in _PROPOSAL.finditer(raw_reply):
        cat_match = _CATEGORY_ATTR.search(match.group(1) or "")
        category = (cat_match.group(1).lower() if cat_match else "")
        content = " ".join(match.group(2).split())
        if category not in MEMORY_CATEGORIES:
            continue
        if not (3 <= len(content) <= MAX_MEMORY_CHARS):
            continue
        if any(_normalize(p["content"]) == _normalize(content) for p in proposals):
            continue
        proposals.append({"category": category, "content": content})
        if len(proposals) >= MAX_PROPOSALS_PER_TURN:
            break
    visible = _STRAY_TAG.sub("", _PROPOSAL.sub("", raw_reply)).strip()
    return visible, proposals


def run_turn(
    kernel: AnimalScryptKernel,
    companion_id: str,
    owner_id: str,
    human_text: str,
) -> Dict[str, Any]:
    text = (human_text or "").strip()
    if not text:
        raise ValueError("Say something first.")
    if len(text) > MAX_HUMAN_CHARS:
        raise ValueError(f"Keep messages under {MAX_HUMAN_CHARS} characters.")

    companion = kernel.get_companion(companion_id)
    approved = kernel.list_memories(companion_id, "APPROVED")
    system = build_system_prompt(companion, approved)
    history = session_history(kernel, companion_id, owner_id)
    if history and history[-1]["role"] == "user":
        history[-1]["content"] += "\n\n" + text
    else:
        history.append({"role": "user", "content": text})

    raw = llm.generate_reply(
        system,
        history,
        {"name": companion["name"], "approved_memories": approved},
    )
    visible, proposals = extract_proposals(raw)
    if not visible:
        visible = "I've asked to keep that — check the note below." if proposals else "…"

    kernel.log_message(companion_id, owner_id, "human", text)
    kernel.log_message(companion_id, owner_id, "creature", visible)

    existing = {
        _normalize(m["content"])
        for status in ("PROPOSED", "APPROVED")
        for m in kernel.list_memories(companion_id, status)
    }
    filed: List[Dict[str, Any]] = []
    for proposal in proposals:
        if _normalize(proposal["content"]) in existing:
            continue
        memory_id = kernel.propose_memory(companion_id, proposal["category"], proposal["content"])
        filed.append(kernel.get_memory(memory_id))

    return {"reply": visible, "proposals": filed, "provider": llm.provider_name()}

