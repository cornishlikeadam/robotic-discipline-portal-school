"""Action pipeline: interpret -> PENDING proposal -> human approve/reject -> execute.

Generated text never reaches SQL or the OS. Only whitelisted actions with
validated payloads run, through the same store methods (and permission
checks) the manual UI uses.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import uuid
from typing import Any, Dict, List, Optional

from journal_os import interpreter
from journal_os.store import Forbidden, Invalid, JournalStore, NotFound, utc_now


class ActionService:
    def __init__(self, store: JournalStore) -> None:
        self.store = store

    # --------------------------------------------------------- proposals
    def propose(self, user_id: str, workspace_id: str, text: str, now_local: Optional[str] = None,
                source: str = "command") -> Dict[str, Any]:
        self.store.require_role(user_id, workspace_id, "editor")
        try:
            now = dt.datetime.fromisoformat(now_local[:16]) if now_local else dt.datetime.now()
        except ValueError:
            now = dt.datetime.now()
        events = self.store.list_events(user_id, workspace_id, calendar="personal")
        companions = [{"id": c["id"], "name": c["name"]} for c in self.store.list_companions(user_id, workspace_id)]
        result = interpreter.interpret(text, now, events, companions)
        if not result.get("ok"):
            return {"ok": False, "reason": result["reason"], "examples": result["examples"]}
        proposal = {
            "id": f"act-{uuid.uuid4().hex[:10]}",
            "workspace_id": workspace_id,
            "user_id": user_id,
            "source": source,
            "input_text": text[:500],
            "action": result["action"],
            "payload_json": json.dumps(result["payload"]),
            "summary": result["summary"],
            "status": "PENDING",
            "created_at": utc_now(),
        }
        self.store._insert_proposal(proposal)
        self.store.audit(workspace_id, user_id, "action.propose", "action", proposal["id"],
                         {"action": result["action"]})
        self.store.conn.commit()
        out = self.get(user_id, proposal["id"])
        out["notes"] = result.get("notes", [])
        out["ok"] = True
        return out

    def get(self, user_id: str, proposal_id: str) -> Dict[str, Any]:
        row = self.store._one("SELECT * FROM action_proposals WHERE id = ?", (proposal_id,))
        if not row:
            raise NotFound("Proposal not found.")
        self.store.require_role(user_id, row["workspace_id"], "viewer")
        row["payload"] = json.loads(row.pop("payload_json"))
        row["result"] = json.loads(row.pop("result_json")) if row.get("result_json") else None
        if row["payload"].get("event_id"):
            ev = self.store._one("SELECT title, start_at FROM events WHERE id = ?", (row["payload"]["event_id"],))
            row["target"] = ev
        return row

    def history(self, user_id: str, workspace_id: str, limit: int = 30) -> List[Dict[str, Any]]:
        self.store.require_role(user_id, workspace_id, "viewer")
        ids = self.store._all("SELECT id FROM action_proposals WHERE workspace_id = ? ORDER BY created_at DESC,"
                              " rowid DESC LIMIT ?", (workspace_id, int(limit)))
        return [self.get(user_id, r["id"]) for r in ids]

    @staticmethod
    def _guard_agent_proposal(prop: Dict[str, Any], via_harness: bool) -> None:
        # An agent's proposal is mirrored by a row in `approvals`. Deciding it
        # anywhere else would leave that card out of date, so only
        # decide_tool_call may approve or reject it.
        if prop["source"].startswith("agent:") and not via_harness:
            raise Forbidden("This request came from an agent. Decide it from its approval card.")

    def reject(self, user_id: str, proposal_id: str, *, via_harness: bool = False) -> Dict[str, Any]:
        prop = self.get(user_id, proposal_id)
        self.store.require_role(user_id, prop["workspace_id"], "editor")
        self._guard_agent_proposal(prop, via_harness)
        if prop["status"] != "PENDING":
            raise Invalid(f"Proposal is already {prop['status']}.")
        self._finish(prop, "REJECTED", None)
        return self.get(user_id, proposal_id)

    def approve(self, user_id: str, proposal_id: str, edited_payload: Optional[Dict[str, Any]] = None,
                *, via_harness: bool = False) -> Dict[str, Any]:
        prop = self.get(user_id, proposal_id)
        ws = prop["workspace_id"]
        self.store.require_role(user_id, ws, "editor")
        self._guard_agent_proposal(prop, via_harness)
        if prop["status"] != "PENDING":
            raise Invalid(f"Proposal is already {prop['status']}.")
        payload = dict(prop["payload"])
        if edited_payload:
            # The preview may edit values but never switch to a different action or target.
            for locked in ("event_id", "calendar"):
                if locked in edited_payload and edited_payload[locked] != payload.get(locked):
                    if not (locked == "event_id" and prop["action"] == "create_journal_entry"):
                        raise Forbidden(f"'{locked}' cannot be changed in the preview.")
            payload.update(edited_payload)
        try:
            interpreter.validate_action(prop["action"], payload)
            via = "agent" if prop["source"].startswith("agent:") else "command"
            result = self._execute(user_id, ws, prop["action"], payload, via)
        except (Invalid, ValueError, NotFound, Forbidden) as exc:
            self._finish(prop, "FAILED", {"error": str(exc)}, payload)
            raise
        self._finish(prop, "EXECUTED", result, payload)
        return self.get(user_id, proposal_id)

    def _finish(self, prop: Dict[str, Any], status: str, result: Optional[Dict[str, Any]],
                payload: Optional[Dict[str, Any]] = None) -> None:
        self.store.conn.execute(
            "UPDATE action_proposals SET status = ?, result_json = ?, decided_at = ?, payload_json = ? WHERE id = ?",
            (status, json.dumps(result) if result is not None else None, utc_now(),
             json.dumps(payload if payload is not None else prop["payload"]), prop["id"]),
        )
        self.store.audit(prop["workspace_id"], prop["user_id"], f"action.{status.lower()}", "action", prop["id"],
                         {"action": prop["action"]})
        self.store.conn.commit()

    def _execute(self, user_id: str, ws: str, action: str, p: Dict[str, Any],
                 via: str = "command") -> Dict[str, Any]:
        s = self.store
        if action == "create_event":
            return {"event": s.create_event(user_id, ws, {**p, "calendar": "personal"}, via=via)}
        if action == "update_event":
            fields = {k: v for k, v in p.items() if k != "event_id"}
            ev = s.get_event(user_id, p["event_id"])
            if ev["workspace_id"] != ws:
                raise Forbidden("Event belongs to another workspace.")
            return {"event": s.update_event(user_id, p["event_id"], fields, via=via)}
        if action == "delete_event":
            ev = s.get_event(user_id, p["event_id"])
            if ev["workspace_id"] != ws:
                raise Forbidden("Event belongs to another workspace.")
            return s.delete_event(user_id, p["event_id"], via=via)
        if action == "create_journal_entry":
            return {"entry": s.create_entry(user_id, ws, p, via=via)}
        if action == "propose_memory":
            companion_id = p.get("companion_id") or self._default_companion(user_id, ws)
            mem = s.propose_memory(user_id, ws, companion_id, p.get("category") or "observation", p.get("content", ""),
                                   journal_entry_id=p.get("journal_entry_id"), event_id=p.get("event_id"))
            return {"memory": mem}
        if action == "schedule_companion_activity":
            companions = {c["name"].upper(): c for c in s.list_companions(user_id, ws)}
            parts = [str(n).upper() for n in p.get("participants") or []]
            if len(parts) < 1 or any(n not in companions for n in parts):
                raise Invalid("Participants must be companions in this workspace.")
            for n in parts:
                if not s.companion_may(ws, companions[n]["id"], "companion_calendar", "propose"):
                    raise Forbidden(f"{n} is not permitted on the companion calendar.")
            ev = s.create_event(user_id, ws, {**p, "calendar": "companion", "kind": "event",
                                              "participants": parts}, via=via)
            return {"event": ev}
        raise Invalid(f"Unknown action {action}")

    # -------------------------------------------------- agent tool calls
    def decide_tool_call(self, user_id: str, approval_id: str, approve: bool,
                         edited_input: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Approve or reject one tool call an agent asked for.

        Planner, journal and memory tools run through `approve` above (the same
        whitelist, edit locks and executor as typed requests). post_message
        posts the agent's text into the other channel. Either way the
        `approvals` row and its message's approval_status are updated after.
        """
        s = self.store
        ap = s.get_approval(user_id, approval_id)
        s.require_approver(user_id, ap)
        if ap["status"] != "pending":
            raise Invalid(f"Request is already {ap['status']}.")
        if not approve:
            if ap["proposal_id"]:
                self.reject(user_id, ap["proposal_id"], via_harness=True)
            s.finish_approval(approval_id, "rejected", user_id)
            return s.get_approval(user_id, approval_id)
        if s.get_agent(user_id, ap["agent_id"])["status"] == "archived":
            raise Invalid("This agent is archived; reject the request instead.")
        if ap["proposal_id"]:
            if edited_input and edited_input.get("companion_id") not in (None, ap["tool_input"].get("companion_id")):
                raise Forbidden("'companion_id' cannot be changed in the preview.")
            try:
                prop = self.approve(user_id, ap["proposal_id"], edited_input, via_harness=True)
            except (Invalid, ValueError, NotFound, Forbidden):
                # Edit-lock refusals leave the proposal PENDING, so the card stays open.
                if self.get(user_id, ap["proposal_id"])["status"] == "FAILED":
                    s.finish_approval(approval_id, "failed", user_id,
                                      self.get(user_id, ap["proposal_id"])["result"])
                raise
            s.finish_approval(approval_id, "approved", user_id, prop["result"], prop["payload"])
            return s.get_approval(user_id, approval_id)
        # post_message: only the text may be edited.
        tool_input = dict(ap["tool_input"])
        if edited_input:
            if set(edited_input) - {"content"}:
                raise Forbidden("Only the message text can be edited.")
            tool_input["content"] = str(edited_input.get("content") or "").strip()
            if not tool_input["content"]:
                raise Invalid("The message text can't be empty.")
        try:
            msg = s.post_agent_message(user_id, ap["agent_id"], tool_input["channel_id"], tool_input["content"],
                                       thread_id=tool_input.get("thread_id"), trigger_message_id=ap["message_id"])
        except (Invalid, NotFound, Forbidden) as exc:
            s.finish_approval(approval_id, "failed", user_id, {"error": str(exc)}, tool_input)
            raise
        s.finish_approval(approval_id, "approved", user_id, {"message_id": msg["id"]}, tool_input)
        return s.get_approval(user_id, approval_id)

    def _default_companion(self, user_id: str, ws: str) -> str:
        comps = self.store.list_companions(user_id, ws)
        if not comps:
            raise NotFound("No companion in this workspace.")
        patch = [c for c in comps if c["name"] == "PATCH"]
        return (patch or comps)[0]["id"]


# ---------------------------------------------------------------- sandbox
CHALLENGES = [
    ("paper-bridge", "build a bridge out of folded paper that holds a bottle cap",
     ["{a} folded the deck while {b} tested the load one coin at a time.",
      "The first span sagged; {b} suggested a triangle truss and it held."]),
    ("gear-maze", "route a marble through a maze of cardboard gears",
     ["{a} sketched the route; {b} cut the gears.",
      "On the third try the marble reached the exit and {a} logged the path."]),
    ("signal-lamps", "send a three-word message across the table using only a flashlight",
     ["{b} invented a blink code; {a} kept the codebook.",
      "They got two of three words right and agreed the code needs a 'repeat' signal."]),
    ("seed-sort", "sort a jar of mixed seeds by shape before the timer ends",
     ["{a} sorted by size, {b} by colour.",
      "They swapped methods halfway and finished with nine seconds left."]),
]
OUTCOMES = ["completed", "completed", "partly completed", "completed with a new rule"]


def run_sandbox_activity(store: JournalStore, user_id: str, event_id: str) -> Dict[str, Any]:
    """Deterministic fictional simulation of a scheduled companion activity.

    Reads only the companions' authored names (never user memories), writes a
    fictional journal entry + marks the companion-calendar event done. It cannot
    touch the personal calendar.
    """
    ev = store.get_event(user_id, event_id)
    ws = ev["workspace_id"]
    store.require_role(user_id, ws, "editor")
    if ev["calendar"] != "companion":
        raise Forbidden("Sandbox activities only run from the companion calendar.")
    if ev["completed"]:
        raise Invalid("This activity already ran.")
    names = ev["participants"] or ["PATCH"]
    seed = int(hashlib.sha256(event_id.encode()).hexdigest(), 16)
    key, goal, beats = CHALLENGES[seed % len(CHALLENGES)]
    outcome = OUTCOMES[(seed // 7) % len(OUTCOMES)]
    a, b = names[0], names[1] if len(names) > 1 else names[0]
    body = "\n".join([
        f"FICTIONAL SANDBOX LOG — generated by a deterministic simulation, not a real-world event.",
        "",
        f"Challenge: {goal}.",
        *[beat.format(a=a, b=b) for beat in beats],
        f"Outcome: {outcome}.",
        "",
        "Discovery: " + {
            "paper-bridge": "triangles spread the load better than flat folds.",
            "gear-maze": "a smaller gear makes the marble slower but steadier.",
            "signal-lamps": "short codes need a way to say 'say that again'.",
            "seed-sort": "switching methods mid-task can be faster than perfecting one.",
        }[key],
    ])
    entry = store.create_entry(
        user_id, ws,
        {"title": f"Discovery: {ev['title']}", "body": body, "event_id": event_id,
         "tags": ["fictional", "sandbox", "discovery", *[n.lower() for n in names]]},
        via="sandbox", origin="companion_sandbox",
    )
    store.update_event(user_id, event_id, {"completed": True}, via="sandbox")
    store.audit(ws, user_id, "sandbox.run", "event", event_id, {"challenge": key, "outcome": outcome,
                                                                  "entry_id": entry["id"]})
    store.conn.commit()
    return {"entry": entry, "challenge": key, "outcome": outcome}
