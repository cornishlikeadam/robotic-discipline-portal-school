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
        self.store.conn.execute(
            "INSERT INTO action_proposals (id, workspace_id, user_id, source, input_text, action, payload_json,"
            " summary, status, created_at) VALUES (:id, :workspace_id, :user_id, :source, :input_text, :action,"
            " :payload_json, :summary, :status, :created_at)",
            proposal,
        )
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

    def reject(self, user_id: str, proposal_id: str) -> Dict[str, Any]:
        prop = self.get(user_id, proposal_id)
        self.store.require_role(user_id, prop["workspace_id"], "editor")
        if prop["status"] != "PENDING":
            raise Invalid(f"Proposal is already {prop['status']}.")
        self._finish(prop, "REJECTED", None)
        return self.get(user_id, proposal_id)

    def approve(self, user_id: str, proposal_id: str, edited_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        prop = self.get(user_id, proposal_id)
        ws = prop["workspace_id"]
        self.store.require_role(user_id, ws, "editor")
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
            result = self._execute(user_id, ws, prop["action"], payload)
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

    def _execute(self, user_id: str, ws: str, action: str, p: Dict[str, Any]) -> Dict[str, Any]:
        s = self.store
        if action == "create_event":
            return {"event": s.create_event(user_id, ws, {**p, "calendar": "personal"}, via="command")}
        if action == "update_event":
            fields = {k: v for k, v in p.items() if k != "event_id"}
            ev = s.get_event(user_id, p["event_id"])
            if ev["workspace_id"] != ws:
                raise Forbidden("Event belongs to another workspace.")
            return {"event": s.update_event(user_id, p["event_id"], fields, via="command")}
        if action == "delete_event":
            ev = s.get_event(user_id, p["event_id"])
            if ev["workspace_id"] != ws:
                raise Forbidden("Event belongs to another workspace.")
            return s.delete_event(user_id, p["event_id"], via="command")
        if action == "create_journal_entry":
            return {"entry": s.create_entry(user_id, ws, p, via="command")}
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
                                              "participants": parts}, via="command")
            return {"event": ev}
        raise Invalid(f"Unknown action {action}")

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
