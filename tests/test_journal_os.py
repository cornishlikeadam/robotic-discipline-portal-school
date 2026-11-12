"""Journal OS tests: calendar, interpreter, approval pipeline, memories,
authorization, companion sandbox, and persistence across a real restart."""

from __future__ import annotations

import datetime as dt
import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

from journal_os import interpreter
from journal_os.actions import ActionService, run_sandbox_activity
from journal_os.server import JournalOSApp
from journal_os.store import Forbidden, Invalid, JournalStore

REPO = pathlib.Path(__file__).resolve().parent.parent
NOW = "2026-11-11T09:00"


class Base(unittest.TestCase):
    def setUp(self) -> None:
        self.store = JournalStore(":memory:")
        self.actions = ActionService(self.store)
        s = self.store.sign_in("kj", "KJ")
        self.uid = s["user"]["id"]
        self.ws = s["workspaces"][0]["id"]

    def tearDown(self) -> None:
        self.store.close()

    def command(self, text: str, now: str = NOW, **edits):
        prop = self.actions.propose(self.uid, self.ws, text, now)
        self.assertTrue(prop["ok"], prop)
        self.assertEqual(prop["status"], "PENDING")
        return self.actions.approve(self.uid, prop["id"], edits or None)


class CalendarTests(Base):
    def test_create_update_complete_delete(self):
        ev = self.store.create_event(self.uid, self.ws, {"title": "Study", "start_at": "2026-11-12T14:00",
                                                         "duration_minutes": 90})
        self.assertEqual(ev["end_at"], "2026-11-12T15:30")
        moved = self.store.update_event(self.uid, ev["id"], {"start_at": "2026-11-13T10:00"})
        self.assertEqual((moved["start_at"], moved["end_at"]), ("2026-11-13T10:00", "2026-11-13T11:30"))
        done = self.store.update_event(self.uid, ev["id"], {"completed": True})
        self.assertTrue(done["completed"])
        self.store.delete_event(self.uid, ev["id"])
        self.assertEqual(self.store.list_events(self.uid, self.ws), [])

    def test_validation(self):
        with self.assertRaises(Invalid):
            self.store.create_event(self.uid, self.ws, {"title": "", "start_at": "2026-11-12T14:00"})
        with self.assertRaises(Invalid):
            self.store.create_event(self.uid, self.ws, {"title": "x", "start_at": "2026-11-12T14:00",
                                                        "end_at": "2026-11-12T13:00"})
        with self.assertRaises(Invalid):
            self.store.create_event(self.uid, self.ws, {"title": "x", "start_at": "nope"})

    def test_recurrence_expands_in_range(self):
        self.store.create_event(self.uid, self.ws, {"title": "Gym", "start_at": "2026-11-02T07:00",
                                                    "recurrence": "daily", "kind": "routine"})
        week = self.store.list_events(self.uid, self.ws, "2026-11-09T00:00", "2026-11-16T00:00")
        self.assertEqual([e["start_at"][:10] for e in week],
                         [f"2026-11-{d:02d}" for d in range(9, 16)])

    def test_companion_calendar_is_separate(self):
        self.store.create_event(self.uid, self.ws, {"title": "Mine", "start_at": "2026-11-12T09:00"})
        self.store.create_event(self.uid, self.ws, {"title": "Play", "start_at": "2026-11-12T19:00",
                                                    "calendar": "companion", "participants": ["MOSS", "PIP"]})
        self.assertEqual([e["title"] for e in self.store.list_events(self.uid, self.ws, calendar="personal")],
                         ["Mine"])

    def test_export_import_roundtrip(self):
        ev = self.store.create_event(self.uid, self.ws, {"title": "Build", "start_at": "2026-11-12T11:00"})
        self.store.create_entry(self.uid, self.ws, {"title": "Log", "body": "b", "event_id": ev["id"]})
        dump = json.loads(json.dumps(self.store.export_planner(self.uid, self.ws)))
        other = self.store.sign_in("guest")
        ows = other["workspaces"][0]["id"]
        result = self.store.import_planner(other["user"]["id"], ows, dump)
        self.assertEqual(result, {"imported_events": 1, "imported_entries": 1})
        entry = self.store.list_entries(other["user"]["id"], ows)[0]
        self.assertEqual(entry["event"]["title"], "Build")


class InterpreterTests(unittest.TestCase):
    now = dt.datetime(2026, 11, 11, 9, 0)  # a Wednesday
    events = [{"id": "e1", "title": "Robotics build session", "start_at": "2026-11-12T11:00"},
              {"id": "e2", "title": "Afternoon study session", "start_at": "2026-11-12T14:00"}]
    comps = [{"id": "c1", "name": "MOSS"}, {"id": "c2", "name": "PIP"}, {"id": "c3", "name": "PATCH"}]

    def run_(self, text):
        return interpreter.interpret(text, self.now, self.events, self.comps)

    def test_brief_example(self):
        r = self.run_("Schedule a robotics build session tomorrow at 11 for 90 minutes")
        self.assertEqual(r["action"], "create_event")
        self.assertEqual(r["payload"]["title"], "Robotics build session")
        self.assertEqual(r["payload"]["start_at"], "2026-11-12T11:00")
        self.assertEqual(r["payload"]["duration_minutes"], 90)

    def test_cases(self):
        cases = {
            "Schedule robotics research tomorrow at 11 AM": ("create_event", "start_at", "2026-11-12T11:00"),
            "Move my afternoon study session to Friday": ("update_event", "start_at", "2026-11-13T14:00"),
            "Create a journal entry for my robotics build session": ("create_journal_entry", "event_id", "e1"),
            "Plan a play session for MOSS and PIP tonight": ("schedule_companion_activity", "calendar", "companion"),
            "Remember that I prefer short check-ins": ("propose_memory", "category", "interest"),
            "Cancel my robotics build session": ("delete_event", "event_id", "e1"),
            "Add dentist on Nov 20 at 3:30pm": ("create_event", "start_at", "2026-11-20T15:30"),
            "Schedule gym every day at 7am for 45 minutes": ("create_event", "recurrence", "daily"),
            "Remind me to call home tomorrow at noon": ("create_event", "kind", "reminder"),
        }
        for text, (action, key, value) in cases.items():
            with self.subTest(text=text):
                r = self.run_(text)
                self.assertTrue(r["ok"], r)
                self.assertEqual(r["action"], action)
                self.assertEqual(r["payload"][key], value)

    def test_unknown_is_not_faked(self):
        r = self.run_("make me a sandwich")
        self.assertFalse(r["ok"])
        self.assertTrue(r["examples"])
        self.assertFalse(self.run_("Move my dentist to Friday")["ok"])  # no such event

    def test_validate_rejects_unlisted_actions_and_fields(self):
        with self.assertRaises(ValueError):
            interpreter.validate_action("run_sql", {})
        with self.assertRaises(ValueError):
            interpreter.validate_action("create_event", {"title": "x", "sql": "DROP TABLE events"})
        with self.assertRaises(ValueError):
            interpreter.validate_action("create_event", {"title": "x", "calendar": "companion"})


class ApprovalPipelineTests(Base):
    def test_nothing_saved_until_approved(self):
        prop = self.actions.propose(self.uid, self.ws, "Schedule a robotics build session tomorrow at 11 for 90 minutes",
                                    NOW)
        self.assertEqual(self.store.list_events(self.uid, self.ws), [])
        self.actions.reject(self.uid, prop["id"])
        self.assertEqual(self.store.list_events(self.uid, self.ws), [])
        with self.assertRaises(Invalid):
            self.actions.approve(self.uid, prop["id"])  # cannot approve after rejecting

    def test_nl_event_lands_in_same_calendar_as_manual(self):
        self.store.create_event(self.uid, self.ws, {"title": "Manual", "start_at": "2026-11-12T09:00"})
        done = self.command("Schedule a robotics build session tomorrow at 11 for 90 minutes")
        self.assertEqual(done["status"], "EXECUTED")
        titles = [e["title"] for e in self.store.list_events(self.uid, self.ws, calendar="personal")]
        self.assertEqual(titles, ["Manual", "Robotics build session"])

    def test_preview_edits_apply_but_cannot_retarget(self):
        done = self.command("Schedule a robotics build session tomorrow at 11 for 90 minutes",
                            title="Robot build", duration_minutes=120)
        self.assertEqual(done["result"]["event"]["title"], "Robot build")
        self.assertEqual(done["result"]["event"]["end_at"], "2026-11-12T13:00")
        other = self.store.create_event(self.uid, self.ws, {"title": "Other", "start_at": "2026-11-14T09:00"})
        prop = self.actions.propose(self.uid, self.ws, "Move my robot build to Friday", NOW)
        with self.assertRaises(Forbidden):
            self.actions.approve(self.uid, prop["id"], {"event_id": other["id"]})

    def test_move_and_journal_link(self):
        self.command("Schedule a robotics build session tomorrow at 11 for 90 minutes")
        moved = self.command("Move my robotics build session to Friday at 3pm")
        self.assertEqual(moved["result"]["event"]["start_at"], "2026-11-13T15:00")
        self.assertEqual(moved["result"]["event"]["end_at"], "2026-11-13T16:30")
        entry = self.command("Create a journal entry for my robotics build session", body="Printed shell v2.")
        self.assertEqual(entry["result"]["entry"]["event"]["title"], "Robotics build session")
        history = self.actions.history(self.uid, self.ws)
        self.assertEqual([h["status"] for h in history], ["EXECUTED"] * 3)


class MemoryTests(Base):
    def test_propose_approve_reject_forget_export(self):
        comp = self.store.list_companions(self.uid, self.ws)[0]
        m1 = self.store.propose_memory(self.uid, self.ws, comp["id"], "project", "Shell wall is 2.4mm")
        m2 = self.store.propose_memory(self.uid, self.ws, comp["id"], "interest", "Likes brass inserts")
        self.assertEqual(self.store.export_companion(self.uid, self.ws, comp["id"])["approved_private_memories"], [])
        self.store.review_memory(self.uid, m1["id"], True, "Shell wall is 2.4mm (PLA)")
        self.store.review_memory(self.uid, m2["id"], False)
        bundle = self.store.export_companion(self.uid, self.ws, comp["id"])
        self.assertEqual([m["content"] for m in bundle["approved_private_memories"]], ["Shell wall is 2.4mm (PLA)"])
        with self.assertRaises(Invalid):
            self.store.review_memory(self.uid, m1["id"], True)  # already decided
        self.store.forget_memory(self.uid, m1["id"])
        self.assertEqual(self.store.export_companion(self.uid, self.ws, comp["id"])["approved_private_memories"], [])

    def test_nl_memory_is_only_a_proposal(self):
        done = self.command("Remember that I test prints on Thursdays")
        self.assertEqual(done["result"]["memory"]["status"], "PROPOSED")


class AuthorizationTests(Base):
    def setUp(self):
        super().setUp()
        g = self.store.sign_in("guest")
        self.gid = g["user"]["id"]
        self.ev = self.store.create_event(self.uid, self.ws, {"title": "Private", "start_at": "2026-11-12T09:00"})

    def test_other_users_cannot_read_or_write(self):
        with self.assertRaises(Forbidden):
            self.store.list_events(self.gid, self.ws)
        with self.assertRaises(Forbidden):
            self.store.get_event(self.gid, self.ev["id"])
        with self.assertRaises(Forbidden):
            self.store.delete_event(self.gid, self.ev["id"])
        with self.assertRaises(Forbidden):
            self.actions.propose(self.gid, self.ws, "Cancel my private", NOW)
        comp = self.store.list_companions(self.uid, self.ws)[0]
        with self.assertRaises(Forbidden):
            self.store.export_companion(self.gid, self.ws, comp["id"])

    def test_viewer_role_reads_but_cannot_write_or_approve_memories(self):
        self.store.add_member(self.uid, self.ws, "guest", "viewer")
        self.assertEqual(len(self.store.list_events(self.gid, self.ws)), 1)
        with self.assertRaises(Forbidden):
            self.store.create_event(self.gid, self.ws, {"title": "x", "start_at": "2026-11-12T09:00"})
        comp = self.store.list_companions(self.uid, self.ws)[0]
        mem = self.store.propose_memory(self.uid, self.ws, comp["id"], "project", "x")
        self.store.add_member(self.uid, self.ws, "guest", "editor")
        with self.assertRaises(Forbidden):
            self.store.review_memory(self.gid, mem["id"], True)  # only owner approves memories

    def test_http_requires_token(self):
        app = JournalOSApp(db_path=":memory:")
        try:
            status, _, _ = app.handle("GET", "/api/os/me")
            self.assertEqual(status, 401)
            status, _, _ = app.handle("GET", "/api/os/me", headers={"Authorization": "Bearer forged"})
            self.assertEqual(status, 401)
        finally:
            app.close()


class SessionTokenTests(unittest.TestCase):
    """Serverless hosts run several instances with separate storage. A token from
    one must be accepted by another, which rebuilds the same workspace ids."""

    def test_token_works_on_a_second_instance(self):
        os.environ["JOURNAL_OS_SECRET"] = "test-secret"
        try:
            a, b = JournalStore(":memory:"), JournalStore(":memory:")
            s = a.sign_in("kj")
            user = b.user_for_token(s["token"])
            self.assertEqual(user["id"], s["user"]["id"])
            self.assertEqual(b.list_workspaces(user["id"])[0]["id"], s["workspaces"][0]["id"])
            self.assertEqual(sorted(c["id"] for c in a.list_companions(user["id"], s["workspaces"][0]["id"])),
                             sorted(c["id"] for c in b.list_companions(user["id"], s["workspaces"][0]["id"])))
            a.close(); b.close()
        finally:
            del os.environ["JOURNAL_OS_SECRET"]

    def test_tampered_or_expired_tokens_rejected(self):
        from journal_os.store import AuthError
        st = JournalStore(":memory:")
        tok = st.sign_in("kj")["token"]
        v, handle, exp, sig = tok.split(".")
        for bad in (f"{v}.guest.{exp}.{sig}", f"{v}.{handle}.{int(exp) + 1}.{sig}", tok[:-2] + "00", "nonsense"):
            with self.assertRaises(AuthError):
                st.user_for_token(bad)
        body = f"v1.kj.{int(time.time()) - 5}"
        with self.assertRaises(AuthError):
            st.user_for_token(f"{body}.{st._sign(body)}")
        st.close()


class SandboxTests(Base):
    def test_companion_session_runs_without_touching_personal_data(self):
        comp = self.store.list_companions(self.uid, self.ws)[0]
        mem = self.store.propose_memory(self.uid, self.ws, comp["id"], "observation", "SECRET-DETAIL")
        self.store.review_memory(self.uid, mem["id"], True)
        personal_before = self.store.list_events(self.uid, self.ws, calendar="personal")
        done = self.command("Plan a play session for MOSS and PIP tonight")
        ev = done["result"]["event"]
        self.assertEqual(ev["calendar"], "companion")
        result = run_sandbox_activity(self.store, self.uid, ev["id"])
        entry = result["entry"]
        self.assertEqual(entry["origin"], "companion_sandbox")
        self.assertIn("fictional", entry["tags"])
        self.assertIn("FICTIONAL", entry["body"])
        self.assertNotIn("SECRET-DETAIL", entry["body"])
        self.assertEqual(self.store.list_events(self.uid, self.ws, calendar="personal"), personal_before)
        self.assertTrue(self.store.get_event(self.uid, ev["id"])["completed"])
        with self.assertRaises(Invalid):
            run_sandbox_activity(self.store, self.uid, ev["id"])  # runs once

    def test_sandbox_refuses_personal_events(self):
        ev = self.store.create_event(self.uid, self.ws, {"title": "Mine", "start_at": "2026-11-12T09:00"})
        with self.assertRaises(Forbidden):
            run_sandbox_activity(self.store, self.uid, ev["id"])


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class RestartPersistenceTest(unittest.TestCase):
    """Full journey over real HTTP, then kill the server process and start a new one."""

    def start(self, db: str, port: int) -> subprocess.Popen:
        env = {**os.environ, "JOURNAL_OS_QUIET": "1"}
        proc = subprocess.Popen([sys.executable, "-m", "journal_os.server", "--port", str(port), "--db", db],
                                cwd=REPO, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{port}/api/os/health", timeout=0.5)
                return proc
            except (urllib.error.URLError, ConnectionError):
                time.sleep(0.05)
        proc.kill()
        raise RuntimeError("server did not start")

    def call(self, port, method, path, body=None, token=None):
        req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Content-Type": "application/json",
                                              **({"Authorization": f"Bearer {token}"} if token else {})})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_journey_survives_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = str(pathlib.Path(tmp) / "jos.db")
            port = _free_port()
            proc = self.start(db, port)
            try:
                _, s = self.call(port, "POST", "/api/os/session", {"handle": "kj"})
                tok, ws = s["token"], s["workspaces"][0]["id"]
                self.call(port, "POST", f"/api/os/w/{ws}/events", {"title": "Manual check-in",
                                                                   "start_at": "2026-11-12T09:00"}, tok)
                _, p = self.call(port, "POST", f"/api/os/w/{ws}/commands",
                                 {"text": "Schedule a robotics build session tomorrow at 11 for 90 minutes",
                                  "now": NOW}, tok)
                st, done = self.call(port, "POST", f"/api/os/actions/{p['id']}/approve", {}, tok)
                self.assertEqual(st, 200)
                ev_id = done["result"]["event"]["id"]
                _, p = self.call(port, "POST", f"/api/os/w/{ws}/commands",
                                 {"text": "Create a journal entry for my robotics build session", "now": NOW}, tok)
                _, done = self.call(port, "POST", f"/api/os/actions/{p['id']}/approve",
                                    {"payload": {"body": "Printed the shell."}}, tok)
                entry_id = done["result"]["entry"]["id"]
                _, comps = self.call(port, "GET", f"/api/os/w/{ws}/companions", token=tok)
                patch = next(c for c in comps if c["name"] == "PATCH")
                _, mem = self.call(port, "POST", f"/api/os/w/{ws}/memories",
                                   {"companion_id": patch["id"], "category": "project",
                                    "content": "Shell printed at 2.4mm", "journal_entry_id": entry_id}, tok)
                self.call(port, "POST", f"/api/os/memories/{mem['id']}/review", {"approve": True}, tok)
                _, p = self.call(port, "POST", f"/api/os/w/{ws}/commands",
                                 {"text": "Plan a play session for MOSS and PIP tonight", "now": NOW}, tok)
                _, done = self.call(port, "POST", f"/api/os/actions/{p['id']}/approve", {}, tok)
                self.call(port, "POST", f"/api/os/events/{done['result']['event']['id']}/run-sandbox", {}, tok)
            finally:
                proc.terminate()
                proc.wait(5)

            proc = self.start(db, port)  # brand new process, same file
            try:
                st, me = self.call(port, "GET", "/api/os/me", token=tok)
                self.assertEqual(st, 200)  # session survives restart too
                _, events = self.call(port, "GET", f"/api/os/w/{ws}/events?calendar=personal", token=tok)
                self.assertEqual([e["title"] for e in events], ["Manual check-in", "Robotics build session"])
                _, entries = self.call(port, "GET", f"/api/os/w/{ws}/journal", token=tok)
                linked = next(e for e in entries if e["id"] == entry_id)
                self.assertEqual(linked["event_id"], ev_id)
                self.assertEqual(linked["body"], "Printed the shell.")
                self.assertTrue(any(e["origin"] == "companion_sandbox" for e in entries))
                _, export = self.call(port, "GET", f"/api/os/w/{ws}/companions/{patch['id']}/export", token=tok)
                self.assertEqual([m["content"] for m in export["approved_private_memories"]],
                                 ["Shell printed at 2.4mm"])
                self.assertEqual(export["memory_links"][0]["journal_entry_id"], entry_id)
            finally:
                proc.terminate()
                proc.wait(5)


if __name__ == "__main__":
    unittest.main()
