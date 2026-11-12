"""Deterministic natural-language interpreter for Journal OS.

Turns a sentence into ONE structured action from a fixed whitelist. It never
executes anything: the result is a proposal that the user previews, edits and
approves. An optional language-model adapter can be plugged in later, but its
output must pass the same whitelist + validation (see `validate_action`).
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Any, Callable, Dict, List, Optional

ACTIONS = ("create_event", "update_event", "delete_event", "create_journal_entry", "propose_memory",
           "schedule_companion_activity")

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
          "november", "december"]
WORD_NUMS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
             "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "an": 1, "a": 1, "half": 0.5}

HELP = [
    "Schedule a robotics build session tomorrow at 11 for 90 minutes",
    "Move my robotics build session to Friday at 3pm",
    "Cancel my robotics build session",
    "Create a journal entry for my robotics build session",
    "Remember that I prefer short check-ins before critiques",
    "Plan a play session for MOSS and PIP tonight",
]


class Interpretation(dict):
    """{ok, action, payload, summary, notes[]} or {ok: False, reason, examples}."""


def _fail(reason: str) -> Interpretation:
    return Interpretation(ok=False, reason=reason, examples=HELP)


# --------------------------------------------------------------- dates/times
def _parse_date(text: str, now: dt.datetime) -> tuple[Optional[dt.date], str]:
    """Return (date, matched_text). Date is None when nothing matched."""
    t = text.lower()
    today = now.date()
    patterns: List[tuple[str, Callable[[re.Match], Optional[dt.date]]]] = [
        (r"\bday after tomorrow\b", lambda m: today + dt.timedelta(days=2)),
        (r"\btomorrow\b", lambda m: today + dt.timedelta(days=1)),
        (r"\b(today|tonight|this (?:morning|afternoon|evening))\b", lambda m: today),
        (r"\bin (\d+|a|one|two|three|four|five|six|seven) (day|week)s?\b",
         lambda m: today + dt.timedelta(days=_num(m.group(1)) * (7 if m.group(2) == "week" else 1))),
        (r"\b(?:on |this |next )?(" + "|".join(WEEKDAYS) + r")\b", None),
        (r"\b(?:on )?(" + "|".join(MONTHS) + r"|" + "|".join(m[:3] for m in MONTHS) + r")\.? (\d{1,2})(?:st|nd|rd|th)?\b",
         None),
        (r"\b(?:on )?(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", None),
        (r"\b(\d{4})-(\d{2})-(\d{2})\b", lambda m: dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))),
    ]
    for pattern, fn in patterns:
        m = re.search(pattern, t)
        if not m:
            continue
        try:
            if fn is not None:
                return fn(m), m.group(0)
            if m.group(1) in WEEKDAYS:
                target = WEEKDAYS.index(m.group(1))
                delta = (target - today.weekday()) % 7
                if delta == 0 or "next" in m.group(0):
                    delta = delta or 7
                return today + dt.timedelta(days=delta), m.group(0)
            if m.group(1).isalpha():
                month = [mm[:3] for mm in MONTHS].index(m.group(1)[:3]) + 1
                d = dt.date(today.year, month, int(m.group(2)))
                if d < today:
                    d = d.replace(year=today.year + 1)
                return d, m.group(0)
            month, day = int(m.group(1)), int(m.group(2))
            year = int(m.group(3)) if m.group(3) else today.year
            if year < 100:
                year += 2000
            d = dt.date(year, month, day)
            if not m.group(3) and d < today:
                d = d.replace(year=today.year + 1)
            return d, m.group(0)
        except ValueError:
            continue
    return None, ""


def _num(token: str) -> float:
    token = token.lower()
    if token in WORD_NUMS:
        return WORD_NUMS[token]
    return float(token)


def _parse_time(text: str, default_period: Optional[str] = None) -> tuple[Optional[dt.time], str]:
    t = text.lower()
    m = re.search(r"\b(noon|midday)\b", t)
    if m:
        return dt.time(12, 0), m.group(0)
    m = re.search(r"\bmidnight\b", t)
    if m:
        return dt.time(0, 0), m.group(0)
    m = re.search(r"\b(?:at|@|from)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?!\s*(?:min|hour|hr|h\b|day|week))",
                  t)
    if not m:
        m = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)", t)
    if not m:
        m = re.search(r"\b(\d{1,2}):(\d{2})()\b", t)
    if not m:
        return None, ""
    hour, minute = int(m.group(1)), int(m.group(2) or 0)
    period = (m.group(3) or "").replace(".", "")
    if hour > 23 or minute > 59:
        return None, ""
    if period == "pm" and hour < 12:
        hour += 12
    elif period == "am" and hour == 12:
        hour = 0
    elif not period and hour <= 12:
        if default_period == "pm" and hour < 12:
            hour += 12
        elif default_period is None and 1 <= hour <= 6:
            hour += 12  # "at 3" almost always means 3 PM for a daily planner
    return dt.time(hour, minute), m.group(0)


def _parse_duration(text: str) -> tuple[Optional[int], str]:
    t = text.lower()
    m = re.search(r"\bfor (\d+(?:\.\d+)?|an?|one|two|three|four|five|half an?) ?(hours?|hrs?|h|minutes?|mins?|m)\b", t)
    if m:
        qty_token = m.group(1)
        qty = 0.5 if qty_token.startswith("half") else _num(qty_token)
        unit = m.group(2)
        minutes = qty * 60 if unit.startswith("h") else qty
        return int(minutes), m.group(0)
    m = re.search(r"\bfor (an? )?hour and a half\b", t)
    if m:
        return 90, m.group(0)
    return None, ""


def _strip(text: str, *parts: str) -> str:
    for p in parts:
        if p:
            text = re.sub(re.escape(p), " ", text, count=1, flags=re.I)
    return re.sub(r"\s+", " ", text).strip(" ,.!?")


def _clean_title(raw: str) -> str:
    title = re.sub(r"^(?:a|an|the|my|me|some)\s+", "", raw.strip(), flags=re.I)
    title = re.sub(r"\b(?:on|at|for|from|this|next|in)\s*$", "", title, flags=re.I).strip(" ,.")
    return title[:1].upper() + title[1:] if title else ""


# ----------------------------------------------------------------- interpret
def interpret(text: str, now: dt.datetime, events: List[Dict[str, Any]],
              companions: List[Dict[str, Any]]) -> Interpretation:
    """Map a sentence to a whitelisted action. `events` are the user's events
    (for matching "move my X"), `companions` are [{id, name}]."""
    raw = (text or "").strip()
    if not raw:
        return _fail("Type a request first.")
    low = raw.lower()
    notes: List[str] = []

    # 1. Companion play/activity sessions (sandbox calendar, never personal).
    names = [c for c in companions if re.search(r"\b" + re.escape(c["name"].lower()) + r"\b", low)]
    if names and re.search(r"\b(play|activity|adventure|challenge|game|session|quest)\b", low) and \
            re.search(r"\b(plan|schedule|set up|start|run|book)\b", low):
        date, dtxt = _parse_date(raw, now)
        evening = bool(re.search(r"\btonight|evening\b", low))
        time, ttxt = _parse_time(raw, "pm" if evening else None)
        if date is None:
            date = now.date()
            notes.append("No day given — using today.")
        if time is None:
            time = dt.time(19, 0) if evening or date == now.date() else dt.time(16, 0)
            notes.append(f"No time given — using {time.strftime('%-I:%M %p')}.")
        dur, _ = _parse_duration(raw)
        kind = "challenge" if "challenge" in low else "play session"
        participants = [c["name"] for c in names]
        title = f"{' & '.join(participants)} {kind}"
        start = dt.datetime.combine(date, time)
        payload = {"title": title, "start_at": start.strftime("%Y-%m-%dT%H:%M"), "duration_minutes": dur or 45,
                   "participants": participants, "calendar": "companion", "kind": "event"}
        return Interpretation(ok=True, action="schedule_companion_activity", payload=payload, notes=notes,
                              summary=f"Add '{title}' to the companion sandbox calendar on "
                                      f"{start.strftime('%a %b %-d at %-I:%M %p')}. Your personal calendar is not touched.")

    # 2. Memory proposals.
    m = re.match(r"^(?:please )?(?:remember|note|keep in mind)(?: that)?\s+(.+)$", raw, re.I)
    if m:
        content = m.group(1).strip().rstrip(".")
        content = content[:1].upper() + content[1:]
        category = "routine" if re.search(r"\b(every|usually|always|routine|each)\b", low) else \
            "interest" if re.search(r"\b(like|love|enjoy|prefer|interested)\b", low) else "observation"
        return Interpretation(ok=True, action="propose_memory",
                              payload={"content": content, "category": category}, notes=notes,
                              summary=f"Propose a {category} memory: “{content}”. "
                                      "It stays PROPOSED until you approve it in the Companion ledger.")

    # 3. Journal entries.
    m = re.match(r"^(?:please )?(?:create|write|start|make|add|open|new)\s+(?:a |an |my )?(?:new )?"
                 r"(?:journal(?: entry)?|entry|note|log)\s*(?:for|about|on|re:?)?\s*(.*)$", raw, re.I)
    if m:
        subject = _clean_title(m.group(1)) or "Untitled entry"
        linked = _match_event(subject, events)
        payload = {"title": subject,
                   "body": "", "tags": [], "event_id": linked["id"] if linked else None}
        if linked:
            notes.append(f"Linked to event '{linked['title']}' ({linked['start_at'].replace('T', ' ')}).")
        return Interpretation(ok=True, action="create_journal_entry", payload=payload, notes=notes,
                              summary=f"Create journal entry “{payload['title']}”"
                                      + (f" linked to “{linked['title']}”." if linked else "."))

    # 4. Delete / cancel.
    m = re.match(r"^(?:please )?(?:cancel|delete|remove|drop|clear)\s+(.+)$", raw, re.I)
    if m:
        target = _match_event(m.group(1), events)
        if not target:
            return _fail(f"I couldn't find an event matching “{_clean_title(m.group(1))}”.")
        return Interpretation(ok=True, action="delete_event", payload={"event_id": target["id"]}, notes=notes,
                              summary=f"Delete “{target['title']}” on {_human(target['start_at'])}.")

    # 5. Move / reschedule.
    m = re.match(r"^(?:please )?(?:move|reschedule|push|shift|change)\s+(.+?)\s+(?:to|until|for)\s+(.+)$", raw, re.I)
    if m:
        target = _match_event(m.group(1), events)
        if not target:
            return _fail(f"I couldn't find an event matching “{_clean_title(m.group(1))}”.")
        when = m.group(2)
        old = dt.datetime.fromisoformat(target["start_at"])
        date, _ = _parse_date(when, now)
        time, _ = _parse_time(when if re.search(r"\d|noon|midnight", when) else "")
        if date is None and time is None:
            return _fail("I understood which event, but not the new day or time.")
        new_start = dt.datetime.combine(date or old.date(), time or old.time())
        return Interpretation(ok=True, action="update_event",
                              payload={"event_id": target["id"], "start_at": new_start.strftime("%Y-%m-%dT%H:%M")},
                              notes=notes,
                              summary=f"Move “{target['title']}” from {_human(target['start_at'])} to "
                                      f"{new_start.strftime('%a %b %-d at %-I:%M %p')} (same length).")

    # 6. Create events / tasks / reminders.
    m = re.match(r"^(?:please )?(?:schedule|add|book|create|plan|put|set up|block(?: out)?|remind me to|remind me about)"
                 r"\s+(.+)$", raw, re.I)
    if m:
        body = m.group(1)
        kind = "reminder" if low.startswith("remind") else "task" if re.match(r"^(?:a )?task\b", body, re.I) else "event"
        recurrence = "daily" if re.search(r"\b(every day|daily|each day)\b", low) else \
            "weekly" if re.search(r"\b(every week|weekly|each week|every (?:" + "|".join(WEEKDAYS) + r"))\b", low) else "none"
        if recurrence != "none":
            kind = "routine" if kind == "event" else kind
        date, dtxt = _parse_date(body, now)
        evening = bool(re.search(r"\btonight|evening\b", low))
        time, ttxt = _parse_time(body, "pm" if evening else None)
        dur, durtxt = _parse_duration(body)
        title = _clean_title(_strip(body, dtxt, ttxt, durtxt,
                                    *(re.findall(r"\b(?:every day|daily|each day|every week|weekly|each week)\b",
                                                 body, re.I))))
        title = re.sub(r"^(?:task|reminder|event)\s*(?:to|for|:)?\s*", "", title, flags=re.I)
        title = _clean_title(title)
        if not title:
            return _fail("I need a name for what to schedule.")
        if date is None:
            date = now.date()
            notes.append("No day given — using today.")
        if time is None:
            time = dt.time(19, 0) if evening else dt.time(9, 0)
            notes.append(f"No time given — using {time.strftime('%-I:%M %p')}. Edit it below if needed.")
        start = dt.datetime.combine(date, time)
        if start < now and not dtxt:
            start += dt.timedelta(days=1)
            notes.append("That time already passed today — moved to tomorrow.")
        payload = {"title": title, "start_at": start.strftime("%Y-%m-%dT%H:%M"),
                   "duration_minutes": dur or (15 if kind == "reminder" else 60), "kind": kind,
                   "recurrence": recurrence, "calendar": "personal"}
        if not dur and kind != "reminder":
            notes.append("No length given — using 60 minutes.")
        return Interpretation(ok=True, action="create_event", payload=payload, notes=notes,
                              summary=f"Add {kind} “{title}” on {start.strftime('%a %b %-d at %-I:%M %p')} "
                                      f"for {payload['duration_minutes']} min"
                                      + (f", repeating {recurrence}" if recurrence != "none" else "") + ".")

    return _fail("I didn't recognise that request. Try one of these:")


def _human(local_iso: str) -> str:
    return dt.datetime.fromisoformat(local_iso).strftime("%a %b %-d at %-I:%M %p")


STOP = {"my", "the", "a", "an", "session", "event", "for", "on", "to", "at", "this", "that", "with", "and", "of"}


def _match_event(phrase: str, events: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    words = {w for w in re.findall(r"[a-z0-9]+", phrase.lower()) if w not in STOP}
    if not words or not events:
        return None
    best, best_score = None, 0.0
    for ev in events:
        tw = {w for w in re.findall(r"[a-z0-9]+", ev["title"].lower()) if w not in STOP}
        if not tw:
            continue
        overlap = len(words & tw)
        score = overlap / len(tw | words)
        if overlap and score > best_score:
            best, best_score = ev, score
    return best if best_score >= 0.25 else None


# --------------------------------------------------------------- validation
def validate_action(action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Whitelist + shape check applied to every proposal before execution,
    whether it came from this interpreter, an LLM adapter, or an edited preview."""
    if action not in ACTIONS:
        raise ValueError(f"Action '{action}' is not permitted.")
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    allowed = {
        "create_event": {"title", "start_at", "end_at", "duration_minutes", "kind", "recurrence", "notes", "calendar"},
        "update_event": {"event_id", "title", "start_at", "end_at", "duration_minutes", "kind", "recurrence",
                         "notes", "completed"},
        "delete_event": {"event_id"},
        "create_journal_entry": {"title", "body", "tags", "event_id"},
        "propose_memory": {"content", "category", "companion_id", "journal_entry_id", "event_id"},
        "schedule_companion_activity": {"title", "start_at", "duration_minutes", "participants", "calendar", "kind"},
    }[action]
    extra = set(payload) - allowed
    if extra:
        raise ValueError(f"Unexpected fields for {action}: {sorted(extra)}")
    if action == "create_event" and payload.get("calendar", "personal") != "personal":
        raise ValueError("create_event only writes to the personal calendar")
    if action == "schedule_companion_activity" and payload.get("calendar", "companion") != "companion":
        raise ValueError("Companion activities only write to the companion calendar")
    return payload


class LanguageModelAdapter:
    """Interface for an optional local/remote LLM. Not wired to a provider in
    this release. Implementations must return {action, payload, summary}; the
    result is always passed through `validate_action` and user approval."""

    def interpret(self, text: str, context: Dict[str, Any]) -> Dict[str, Any]:  # pragma: no cover
        raise NotImplementedError
