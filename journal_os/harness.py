"""Agent reply path for Journal OS channels.

No model is connected yet. `StubRuntime` stands in for one: it reads the
person's message with the same deterministic interpreter the command bar
uses and answers either with plain text or with a tool call. Tool calls go
through `JournalStore.post_agent_message`, so they become pending approval
cards exactly as a real model's would. A real runtime only has to implement
`AgentRuntime.reply` with the same inputs and outputs.
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Any, Dict, List, Optional

from journal_os import interpreter
from journal_os.store import Forbidden, Invalid, JournalStore, NotFound

_MENTION = re.compile(r"(?<![\w@])@[A-Za-z0-9_-]{1,32}")
_REMEMBER_THIS = re.compile(r"^(please\s+)?(remember|save|keep|note)\s+(this|that|it|the selection|what i selected)\W*$", re.I)
_THIS = re.compile(r"\b(this event|this|it)\b", re.I)

LEAD_IN = {
    "create_event": "I can add that to your planner.",
    "update_event": "I can move that event.",
    "delete_event": "I can delete that event.",
    "create_journal_entry": "I can start that journal entry.",
    "propose_memory": "I can propose that for my memory ledger.",
    "schedule_companion_activity": "I can put that session on the companion calendar.",
}


def _with_context(text: str, context: Dict[str, Any]) -> str:
    """Point "this" at the event the person was looking at, so "move this to
    Friday at 3pm" or "create a journal entry for this" find that event."""
    if context.get("kind") == "event" and context.get("title") and _THIS.search(text):
        return _THIS.sub(f"my {context['title']}", text, count=1)
    return text


def _context_hint(context: Dict[str, Any]) -> str:
    title = context.get("title")
    if context.get("kind") == "event":
        tries = ["Move this to Friday at 3pm", "Create a journal entry for this", "Cancel this"]
    elif context.get("kind") == "journal_entry":
        tries = ["Remember this (after selecting a line)", "Schedule a follow-up tomorrow at 10"]
    else:
        tries = ["Remember this"]
    where = f"you're looking at “{title}”" if title else "you selected some text"
    return (f"I can see {where}. I'm a rule-based stand-in until a model is connected, so I can't read or "
            f"summarise it yet, but I can act on it. Try: " + "; ".join(f"“{t}”" for t in tries) + ".")


def _parse_now(now_local: Optional[str]) -> dt.datetime:
    try:
        return dt.datetime.fromisoformat(str(now_local)[:16]) if now_local else dt.datetime.now()
    except ValueError:
        return dt.datetime.now()


class AgentRuntime:
    """Produces one agent reply to one message. Implementations must post the
    reply with `store.post_agent_message`, never write data directly."""

    name = "base"

    def reply(self, store: JournalStore, user_id: str, agent: Dict[str, Any], trigger: Dict[str, Any],
              now_local: Optional[str] = None) -> Dict[str, Any]:  # pragma: no cover - interface
        raise NotImplementedError


class StubRuntime(AgentRuntime):
    """Rule-based stand-in used while an agent's model is 'none'."""

    name = "stub"

    def reply(self, store: JournalStore, user_id: str, agent: Dict[str, Any], trigger: Dict[str, Any],
              now_local: Optional[str] = None) -> Dict[str, Any]:
        ws, channel_id = agent["workspace_id"], trigger["channel_id"]
        where = {"thread_id": trigger["thread_id"], "trigger_message_id": trigger["id"]}
        text = _MENTION.sub(" ", trigger["content"]).strip(" ,:;-\n\t")
        context = trigger.get("context") or {}
        if _REMEMBER_THIS.match(text):
            if not context.get("selection"):
                return store.post_agent_message(user_id, agent["id"], channel_id,
                                                "Select the words you want me to remember first, then ask again.", **where)
            payload = {"content": context["selection"], "category": "observation"}
            if context.get("kind") == "journal_entry":
                payload["journal_entry_id"] = context["id"]
            elif context.get("kind") == "event":
                payload["event_id"] = context["id"]
            result = {"ok": True, "action": "propose_memory", "payload": payload,
                      "summary": f"Propose remembering the text you selected: “{context['selection'][:120]}”."}
        else:
            events = store.list_events(user_id, ws, calendar="personal")
            companions = [{"id": c["id"], "name": c["name"]} for c in store.list_companions(user_id, ws)]
            result = interpreter.interpret(_with_context(text, context), _parse_now(now_local), events, companions)
        if result.get("ok"):
            tool, payload = result["action"], dict(result["payload"])
            if tool == "propose_memory":
                payload.pop("companion_id", None)  # the store points it at this agent's own ledger
            content = (f"{LEAD_IN.get(tool, 'I can do that.')} {result['summary']} "
                       "Nothing changes until you approve the card below.")
            try:
                return store.post_agent_message(user_id, agent["id"], channel_id, content,
                                                tool_calls=[{"tool": tool, "input": payload}], **where)
            except (Forbidden, Invalid) as exc:
                content = f"I can't propose that here: {exc}"
        elif context.get("title") or context.get("selection"):
            content = _context_hint(context)
        else:
            examples = "; ".join(f"“{x}”" for x in (result.get("examples") or [])[:3])
            content = ("I'm a rule-based stand-in until a model is connected, so I only understand planner, "
                       f"journal and memory requests. Try: {examples}.")
        return store.post_agent_message(user_id, agent["id"], channel_id, content, **where)


STUB = StubRuntime()


def runtime_for(agent: Dict[str, Any]) -> AgentRuntime:
    """Every agent uses the stub until model drivers exist (Prompt 3)."""
    return STUB


def respond_to(store: JournalStore, user_id: str, message: Dict[str, Any],
               now_local: Optional[str] = None) -> List[Dict[str, Any]]:
    """Let the agents a person's message is addressed to reply.

    Addressed means @mentioned, or the agent on the other side of a DM. Agent
    messages never wake other agents here, so the stub cannot loop.
    """
    if message.get("author_type") != "human":
        return []
    channel = store.get_channel(user_id, message["channel_id"])
    targets = list(message.get("mentions") or [])
    partner = channel.get("dm_with") or {}
    if not targets and partner.get("member_type") == "agent":
        targets = [partner["member_id"]]
    replies = []
    for agent_id in targets:
        agent = store.get_agent(user_id, agent_id)
        if agent["status"] != "active":
            continue
        try:
            replies.append(runtime_for(agent).reply(store, user_id, agent, message, now_local))
        except (Forbidden, Invalid, NotFound):
            # e.g. the agent is only an observer here. The person's message is already saved.
            continue
    return replies
