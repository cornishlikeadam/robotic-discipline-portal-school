"""Automations: agents that post on a schedule.

Three kinds, all posted by an agent (PATCH by default):

* **Morning brief** (daily, 08:00, #general): today's plan, unfinished tasks
  from the past week, and how many requests are waiting for approval.
* **Evening journal prompt** (daily, 20:00, the DM with the agent, which is
  also Barnacle's conversation): asks how the day went and attaches a draft
  reflection entry as a *pending approval*. Nothing reaches the journal until
  someone presses Approve.
* **Weekly review** (Sundays, 18:00, #general): the week's events, journal
  entries, memories and decisions.

No automation writes planner, journal or memory data directly. Posting chat
text is the only thing it does without asking, exactly like an agent reply.

There is no always-on scheduler. `run_due` is idempotent per period (a day,
or an ISO week), so anything may call it as often as it likes: the local
server's ticker thread does every minute, and the browser does when the app
opens and every few minutes while it stays open. A run missed while nothing
was running catches up once, later in the same day (or week), never for an
earlier one. Times are local wall-clock time, like the rest of the planner;
the browser sends its own clock so a server in another timezone (Vercel runs
in UTC) still posts the morning brief in the person's morning.

When a model is configured (see harness.ModelConfig), the morning brief and
weekly review are reworded by it in the agent's voice. The facts still come
from the code below; if the model fails, or its rewrite drops a time, the
template text is posted as before. The evening prompt is never reworded.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import re
from typing import Any, Callable, ContextManager, Dict, List, Optional, Tuple

from journal_os import harness
from journal_os.store import Forbidden, Invalid, JournalStore, NotFound, _id, utc_now

KINDS: Dict[str, Dict[str, Any]] = {
    "morning_brief": {"name": "Morning brief", "time": "08:00", "weekday": None, "where": "general",
                      "about": "Today's plan, unfinished tasks and anything waiting for approval."},
    "evening_prompt": {"name": "Evening journal prompt", "time": "20:00", "weekday": None, "where": "dm",
                       "about": "Asks how the day went and drafts a reflection entry for you to approve."},
    "weekly_review": {"name": "Weekly review", "time": "18:00", "weekday": 6, "where": "general",
                      "about": "The week's events, journal entries, memories and decisions."},
}
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_TIME = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
_NOW = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}")


def parse_now(value: Any) -> dt.datetime:
    """The caller's local wall-clock time ('YYYY-MM-DDTHH:MM'), or this machine's."""
    if value:
        text = str(value)
        if not _NOW.match(text):
            raise Invalid("now must look like 2026-11-12T08:00.")
        return dt.datetime.fromisoformat(text[:16])
    return dt.datetime.now().replace(second=0, microsecond=0)


def _hhmm(value: str) -> dt.time:
    h, m = value.split(":")
    return dt.time(int(h), int(m))


def period_of(auto: Dict[str, Any], now: dt.datetime) -> Tuple[str, dt.datetime]:
    """(period key, when this period's run is scheduled) for the period containing `now`."""
    at = _hhmm(auto["time_of_day"])
    if auto["weekday"] is None:
        return now.date().isoformat(), dt.datetime.combine(now.date(), at)
    year, week, _ = now.isocalendar()
    monday = now.date() - dt.timedelta(days=now.weekday())
    return f"{year}-W{week:02d}", dt.datetime.combine(monday + dt.timedelta(days=auto["weekday"]), at)


def is_due(auto: Dict[str, Any], now: dt.datetime) -> bool:
    if not auto["enabled"]:
        return False
    period, scheduled = period_of(auto, now)
    return now >= scheduled and auto["last_period"] != period


def next_run(auto: Dict[str, Any], now: dt.datetime) -> Optional[str]:
    if not auto["enabled"]:
        return None
    period, scheduled = period_of(auto, now)
    if auto["last_period"] != period:
        return max(scheduled, now).isoformat(timespec="minutes")
    step = dt.timedelta(days=1 if auto["weekday"] is None else 7)
    return (scheduled + step).isoformat(timespec="minutes")


def _clock(iso: str) -> str:
    return iso[11:16]


def _day_label(day: dt.date) -> str:
    return f"{WEEKDAY_NAMES[day.weekday()]}, {day.strftime('%b')} {day.day}"


def _minutes(ev: Dict[str, Any]) -> int:
    start, end = dt.datetime.fromisoformat(ev["start_at"]), dt.datetime.fromisoformat(ev["end_at"])
    return max(0, int((end - start).total_seconds() // 60))


def _event_line(ev: Dict[str, Any]) -> str:
    kind = "" if ev["kind"] == "event" else f"{ev['kind']}: "
    mins = _minutes(ev)
    length = f" ({mins} min)" if mins and ev["kind"] == "event" else ""
    done = " ✓" if ev.get("completed") else ""
    return f"• {_clock(ev['start_at'])} {kind}{ev['title']}{length}{done}"


class AutomationService:
    def __init__(self, store: JournalStore,
                 unlocked: Callable[[], ContextManager[Any]] = contextlib.nullcontext) -> None:
        self.store = store
        self.unlocked = unlocked  # lets other requests run while a model rewords a message

    # ------------------------------------------------------------ records
    def _row(self, automation_id: str) -> Dict[str, Any]:
        row = self.store._one("SELECT * FROM automations WHERE id = ?", (automation_id,))
        if not row:
            raise NotFound("Automation not found.")
        return row

    def _out(self, row: Dict[str, Any], now: Optional[dt.datetime] = None) -> Dict[str, Any]:
        out = dict(row)
        out["enabled"] = bool(out["enabled"])
        meta = KINDS[out["kind"]]
        out["name"], out["about"] = meta["name"], meta["about"]
        agent = self.store._one("SELECT name, handle FROM agents WHERE id = ?", (out["agent_id"],))
        channel = self.store._one("SELECT name, type FROM channels WHERE id = ?", (out["channel_id"],))
        out["agent_name"] = agent["name"] if agent else "(removed agent)"
        out["where"] = (f"DM with {out['agent_name']}" if channel and channel["type"] == "dm"
                        else f"#{channel['name']}" if channel else "(removed channel)")
        out["schedule"] = (f"Every day at {out['time_of_day']}" if out["weekday"] is None
                           else f"{WEEKDAY_NAMES[out['weekday']]}s at {out['time_of_day']}")
        out["next_run"] = next_run(out, now or parse_now(None))
        return out

    def ensure_defaults(self, user_id: str, workspace_id: str, agent_id: str, general_id: str,
                        now: Any = None) -> None:
        """Create the three default automations once per workspace (called by bootstrap_harness).

        A run whose time has already passed today (or this week) is skipped,
        so setting up at 21:00 doesn't post a morning brief at night. Run now
        shows one straight away.
        """
        s = self.store
        s.require_role(user_id, workspace_id, "owner")
        have = {r["kind"] for r in s._all("SELECT kind FROM automations WHERE workspace_id = ?", (workspace_id,))}
        missing = [k for k in KINDS if k not in have]
        if not missing:
            return
        dm_id = s.open_dm(user_id, workspace_id, agent_id, "agent")["id"] if "evening_prompt" in missing else None
        when, stamp = parse_now(now), utc_now()
        for kind in missing:
            meta = KINDS[kind]
            row = {"id": _id("aut"), "workspace_id": workspace_id, "kind": kind, "agent_id": agent_id,
                   "channel_id": dm_id if meta["where"] == "dm" else general_id, "time_of_day": meta["time"],
                   "weekday": meta["weekday"], "enabled": 1, "owner_id": user_id, "last_period": None,
                   "created_at": stamp, "updated_at": stamp}
            period, scheduled = period_of(row, when)
            if when >= scheduled:
                row["last_period"] = period
            s.conn.execute(
                "INSERT INTO automations (id, workspace_id, kind, agent_id, channel_id, time_of_day, weekday,"
                " enabled, owner_id, last_period, created_at, updated_at) VALUES (:id, :workspace_id, :kind,"
                " :agent_id, :channel_id, :time_of_day, :weekday, :enabled, :owner_id, :last_period, :created_at,"
                " :updated_at)", row)
            s.audit(workspace_id, user_id, "automation.create", "automation", row["id"], {"kind": kind})
        s.conn.commit()

    def list(self, user_id: str, workspace_id: str, now: Any = None) -> List[Dict[str, Any]]:
        self.store.require_role(user_id, workspace_id, "viewer")
        when = parse_now(now)
        order = {k: i for i, k in enumerate(KINDS)}
        rows = self.store._all("SELECT * FROM automations WHERE workspace_id = ?", (workspace_id,))
        return [self._out(r, when) for r in sorted(rows, key=lambda r: order[r["kind"]])]

    def update(self, user_id: str, automation_id: str, data: Dict[str, Any], now: Any = None) -> Dict[str, Any]:
        row = self._row(automation_id)
        self.store.require_role(user_id, row["workspace_id"], "owner")
        sets: Dict[str, Any] = {}
        if "enabled" in data:
            if not isinstance(data["enabled"], bool):
                raise Invalid("enabled must be true or false.")
            sets["enabled"] = int(data["enabled"])
        if "time_of_day" in data:
            if not isinstance(data["time_of_day"], str) or not _TIME.match(data["time_of_day"]):
                raise Invalid("time_of_day must look like 08:00.")
            sets["time_of_day"] = data["time_of_day"]
        if "weekday" in data:
            if row["weekday"] is None:
                raise Invalid("Only the weekly review has a weekday.")
            if not isinstance(data["weekday"], int) or isinstance(data["weekday"], bool) or not 0 <= data["weekday"] <= 6:
                raise Invalid("weekday must be 0 (Monday) to 6 (Sunday).")
            sets["weekday"] = data["weekday"]
        if sets:
            sets["updated_at"] = utc_now()
            cols = ", ".join(f"{k} = :{k}" for k in sets)
            self.store.conn.execute(f"UPDATE automations SET {cols} WHERE id = :id", {**sets, "id": automation_id})
            self.store.audit(row["workspace_id"], user_id, "automation.update", "automation", automation_id,
                             {k: v for k, v in sets.items() if k != "updated_at"})
            self.store.conn.commit()
        return self._out(self._row(automation_id), parse_now(now))

    # -------------------------------------------------------------- runs
    def run_now(self, user_id: str, automation_id: str, now: Any = None) -> Dict[str, Any]:
        """Post this automation's message straight away. It counts as this period's run."""
        row = self._row(automation_id)
        self.store.require_role(user_id, row["workspace_id"], "owner")
        return self._run(row, parse_now(now), manual=True)

    def run_due(self, now: Any = None, workspace_id: Optional[str] = None,
                owner_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Run every enabled automation whose time has come and that hasn't run this period."""
        when = parse_now(now)
        sql, args = "SELECT * FROM automations WHERE enabled = 1", []
        if workspace_id:
            sql += " AND workspace_id = ?"
            args.append(workspace_id)
        if owner_id:
            sql += " AND owner_id = ?"
            args.append(owner_id)
        ran = [self._run(r, when) for r in self.store._all(sql + " ORDER BY created_at", tuple(args))
               if is_due(r, when)]
        return [r for r in ran if r]

    def _run(self, row: Dict[str, Any], now: dt.datetime, manual: bool = False) -> Optional[Dict[str, Any]]:
        s = self.store
        period, _ = period_of(row, now)
        # Re-read and claim this period before any slow model call, so a tick
        # that runs meanwhile (the lock is released while the model works)
        # sees it as done and can't post it twice. Run now always runs.
        row = self._row(row["id"])
        if not manual and not is_due(row, now):
            return None
        s.conn.execute("UPDATE automations SET last_period = ? WHERE id = ?", (period, row["id"]))
        s.conn.commit()
        message, error = None, None
        try:
            content, calls = self._compose(row, now)
            runtime = harness.STAND_IN
            if row["kind"] in harness.WORDED_AUTOMATIONS:
                agent = s.get_agent(row["owner_id"], row["agent_id"])
                content, runtime = harness.word_automation(agent, row["kind"], content, self.unlocked)
            message = s.post_agent_message(row["owner_id"], row["agent_id"], row["channel_id"], content, calls,
                                           runtime=runtime)
        except (Forbidden, Invalid, NotFound) as exc:
            s.conn.rollback()
            error = str(exc)
        s.conn.execute(
            "UPDATE automations SET last_period = ?, last_run_at = ?, last_message_id = ?, last_error = ?,"
            " updated_at = ? WHERE id = ?",
            (period, now.isoformat(timespec="minutes"), message["id"] if message else row["last_message_id"],
             error, utc_now(), row["id"]))
        s.audit(row["workspace_id"], row["owner_id"], "automation.run", "automation", row["id"],
                {"kind": row["kind"], "period": period, "manual": manual, "message_id": message and message["id"],
                 "error": error})
        s.conn.commit()
        return {"automation": self._out(self._row(row["id"]), now), "message": message, "error": error}

    # ----------------------------------------------------------- content
    def _personal_events(self, row: Dict[str, Any], start: dt.date, days: int) -> List[Dict[str, Any]]:
        end = start + dt.timedelta(days=days)
        events = self.store.list_events(row["owner_id"], row["workspace_id"], f"{start}T00:00", f"{end}T00:00",
                                        calendar="personal")
        return sorted(events, key=lambda e: e["start_at"])

    def _compose(self, row: Dict[str, Any], now: dt.datetime) -> Tuple[str, List[Dict[str, Any]]]:
        return getattr(self, "_" + row["kind"])(row, now)

    def _morning_brief(self, row: Dict[str, Any], now: dt.datetime) -> Tuple[str, List[Dict[str, Any]]]:
        s, today = self.store, now.date()
        events = self._personal_events(row, today, 1)
        week_ago = today - dt.timedelta(days=7)
        carried = s._all(
            "SELECT title, start_at FROM events WHERE workspace_id = ? AND calendar = 'personal' AND completed = 0"
            " AND recurrence = 'none' AND kind IN ('task', 'reminder') AND start_at >= ? AND start_at < ?"
            " ORDER BY start_at", (row["workspace_id"], f"{week_ago}T00:00", f"{today}T00:00"))
        waiting = len(s.list_approvals(row["owner_id"], row["workspace_id"], "pending"))
        greeting = "Good morning" if now.hour < 12 else "Here's your day"
        lines = [f"☀️ Morning brief · {_day_label(today)}", "", f"{greeting}. "
                 + (f"Today you have {len(events)} thing{'s' if len(events) != 1 else ''} on the planner:"
                    if events else "Nothing is on the planner today.")]
        lines += [_event_line(e) for e in events[:12]]
        if len(events) > 12:
            lines.append(f"…and {len(events) - 12} more in the planner.")
        if carried:
            lines += ["", "Still open from earlier this week:"]
            lines += [f"• {c['title']} ({_day_label(dt.date.fromisoformat(c['start_at'][:10]))})" for c in carried[:5]]
        lines.append("")
        if waiting:
            lines.append(f"{waiting} request{'s are' if waiting != 1 else ' is'} waiting for your approval.")
        lines.append("Ask me to schedule, move or cancel anything; I'll send each change for approval.")
        return "\n".join(lines), []

    def _evening_prompt(self, row: Dict[str, Any], now: dt.datetime) -> Tuple[str, List[Dict[str, Any]]]:
        today = now.date()
        events = self._personal_events(row, today, 1)
        lines = [f"🌙 Evening check-in · {_day_label(today)}", "", "How did today go?"]
        if events:
            lines += ["", "On the planner today:"] + [_event_line(e) for e in events[:8]]
        lines += ["", "I drafted a reflection entry below. It's saved to your journal only if you approve it,"
                  " and you can edit it there afterwards."]
        plan = "; ".join(f"{_clock(e['start_at'])} {e['title']}" for e in events[:8]) or "nothing scheduled"
        body = ("What went well:\n\n\nWhat got in the way:\n\n\nFirst move tomorrow:\n\n\n"
                f"— Today's plan: {plan}.")
        draft: Dict[str, Any] = {"title": f"Evening reflection · {_day_label(today)}", "body": body,
                                 "tags": ["reflection"]}
        anchors = [e for e in events if e["kind"] == "event" and e["recurrence"] == "none"]
        if anchors:  # link the day's longest one-off event so the entry shows up on it
            draft["event_id"] = max(anchors, key=_minutes)["id"]
        return "\n".join(lines), [{"tool": "create_journal_entry", "input": draft}]

    def _weekly_review(self, row: Dict[str, Any], now: dt.datetime) -> Tuple[str, List[Dict[str, Any]]]:
        s, ws, uid = self.store, row["workspace_id"], row["owner_id"]
        monday = now.date() - dt.timedelta(days=now.weekday())
        sunday = monday + dt.timedelta(days=6)
        events = self._personal_events(row, monday, 7)
        done = sum(1 for e in events if e.get("completed"))
        lo, hi = f"{monday}T00:00", f"{sunday + dt.timedelta(days=1)}T00:00"
        entries = [e for e in s.list_entries(uid, ws) if lo <= e["created_at"][:16] < hi]
        approved = s._one(
            "SELECT COUNT(*) AS n FROM memory_records m JOIN memory_links l ON l.memory_id = m.id"
            " WHERE l.workspace_id = ? AND m.status = 'APPROVED' AND m.approved_at >= ? AND m.approved_at < ?",
            (ws, lo, hi))["n"]
        proposed = s._one(
            "SELECT COUNT(*) AS n FROM memory_records m JOIN memory_links l ON l.memory_id = m.id"
            " WHERE l.workspace_id = ? AND m.status = 'PROPOSED'", (ws,))["n"]
        decided = s._all("SELECT status FROM approvals WHERE workspace_id = ? AND decided_at >= ? AND decided_at < ?",
                         (ws, lo, hi))
        waiting = len(s.list_approvals(uid, ws, "pending"))
        next_week = self._personal_events(row, sunday + dt.timedelta(days=1), 7)
        span = (f"{monday.strftime('%b')} {monday.day}–{sunday.day}" if monday.month == sunday.month
                else f"{monday.strftime('%b')} {monday.day}–{sunday.strftime('%b')} {sunday.day}")
        lines = [f"🗓️ Weekly review · {span}", ""]
        if events:
            per_day: Dict[str, int] = {}
            for e in events:
                per_day[e["start_at"][:10]] = per_day.get(e["start_at"][:10], 0) + 1
            busiest = max(per_day.items(), key=lambda kv: kv[1])
            lines.append(f"Planner: {len(events)} item{'s' if len(events) != 1 else ''}, {done} marked done."
                         f" Busiest day: {WEEKDAY_NAMES[dt.date.fromisoformat(busiest[0]).weekday()]}"
                         f" ({busiest[1]}).")
        else:
            lines.append("Planner: nothing was scheduled this week.")
        if entries:
            titles = ", ".join(f"“{e['title']}”" for e in entries[:5]) + ("…" if len(entries) > 5 else "")
            lines.append(f"Journal: {len(entries)} entr{'ies' if len(entries) != 1 else 'y'}: {titles}.")
        else:
            lines.append("Journal: no entries this week.")
        lines.append(f"Memories: {approved} approved this week, {proposed} waiting in the ledger.")
        yes = sum(1 for d in decided if d["status"] == "approved")
        no = sum(1 for d in decided if d["status"] == "rejected")
        lines.append(f"Agent requests: {yes} approved, {no} rejected, {waiting} still waiting.")
        lines += ["", f"Next week has {len(next_week)} item{'s' if len(next_week) != 1 else ''} so far."
                  " Tell me what matters most and I'll draft the plan for your approval."]
        return "\n".join(lines), []
