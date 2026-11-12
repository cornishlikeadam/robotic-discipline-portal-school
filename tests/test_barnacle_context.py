"""Barnacle: page context on messages and how the stand-in agent uses it.

Barnacle sends what the person is looking at (a journal entry or event, and
any selected text) with each message. These tests check that the server
re-reads titles itself, keeps context inside the workspace, records it on the
message, and that every resulting change is still only a pending approval.
"""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import unittest

from journal_os.server import JournalOSApp
from journal_os.store import JournalStore

NOW = "2026-11-12T09:00"


class ContextBase(unittest.TestCase):
    def setUp(self) -> None:
        self.app = JournalOSApp(db_path=":memory:")
        self.token, self.ws = self.sign_in("kj")
        boot = self.call("POST", f"/api/os/w/{self.ws}/harness/bootstrap", {})[1]
        self.patch = boot["agent"]
        self.dm = self.call("POST", f"/api/os/w/{self.ws}/dms", {"member_id": self.patch["id"], "member_type": "agent"})[1]
        self.event = self.call("POST", f"/api/os/w/{self.ws}/events",
                               {"title": "Robotics build session", "start_at": "2026-11-13T11:00", "duration_minutes": 90})[1]
        self.entry = self.call("POST", f"/api/os/w/{self.ws}/journal",
                               {"title": "Shell v2 print", "body": "Neck joint wobbles; try brass inserts."})[1]

    def tearDown(self) -> None:
        self.app.close()

    def sign_in(self, handle):
        data = json.loads(self.app.handle("POST", "/api/os/session", json.dumps({"handle": handle}))[2])
        return data["token"], data["workspaces"][0]["id"]

    def call(self, method, path, body=None, token="default"):
        token = self.token if token == "default" else token
        status, _, text = self.app.handle(method, path, json.dumps(body) if body is not None else None,
                                          {"Authorization": f"Bearer {token}"})
        return status, json.loads(text)

    def say(self, content, context=None, token="default"):
        return self.call("POST", f"/api/os/channels/{self.dm['id']}/messages",
                         {"content": content, "now": NOW, "context": context}, token)


class ContextStorageTests(ContextBase):
    def test_title_comes_from_the_database_not_the_client(self):
        status, res = self.say("hello", {"view": "planner", "kind": "event", "id": self.event["id"], "title": "Fake title"})
        self.assertEqual(status, 201, res)
        ctx = res["message"]["context"]
        self.assertEqual((ctx["view"], ctx["kind"], ctx["title"]), ("planner", "event", "Robotics build session"))
        stored = self.call("GET", f"/api/os/messages/{res['message']['id']}")[1]
        self.assertEqual(stored["context"], ctx)

    def test_selection_is_trimmed_and_capped(self):
        res = self.say("hi", {"selection": "  lots   of\n\nspace " + "x" * 900})[1]
        sel = res["message"]["context"]["selection"]
        self.assertTrue(sel.startswith("lots of space x"))
        self.assertEqual(len(sel), 500)

    def test_bad_or_foreign_context_is_refused_and_nothing_posted(self):
        other_token, other_ws = self.sign_in("sam")
        theirs = self.call("POST", f"/api/os/w/{other_ws}/journal", {"title": "Sam's private note"}, other_token)[1]
        cases = [({"kind": "journal_entry", "id": theirs["id"]}, 403), ({"kind": "password", "id": "x"}, 400),
                 ("journal", 400), ({"kind": "event", "id": "evt-missing"}, 404)]
        for context, status in cases:
            with self.subTest(context=context):
                self.assertEqual(self.say("look at this", context)[0], status)
        self.assertEqual(self.call("GET", f"/api/os/channels/{self.dm['id']}/messages")[1], [])

    def test_unknown_views_are_dropped(self):
        self.assertEqual(self.say("hi", {"view": "admin"})[1]["message"]["context"], {})


class StandInContextTests(ContextBase):
    def reply(self, content, context=None):
        status, res = self.say(content, context)
        self.assertEqual(status, 201, res)
        return res["replies"][0]

    def test_remember_this_proposes_the_selection_linked_to_the_entry(self):
        rep = self.reply("Remember this", {"kind": "journal_entry", "id": self.entry["id"], "selection": "try brass inserts"})
        card = rep["approvals"][0]
        self.assertEqual(card["tool_name"], "propose_memory")
        self.assertEqual(card["tool_input"]["content"], "try brass inserts")
        self.assertEqual(card["tool_input"]["journal_entry_id"], self.entry["id"])
        self.assertEqual(self.call("GET", f"/api/os/w/{self.ws}/memories")[1], [])  # nothing yet
        done = self.call("POST", f"/api/os/approvals/{card['id']}/approve", {})[1]
        memory = done["result"]["memory"]
        self.assertEqual((memory["status"], memory["journal_entry_id"]), ("PROPOSED", self.entry["id"]))

    def test_remember_this_without_a_selection_asks_for_one(self):
        rep = self.reply("remember this", {"kind": "journal_entry", "id": self.entry["id"]})
        self.assertEqual(rep["tool_calls"], [])
        self.assertIn("Select", rep["content"])

    def test_this_means_the_open_event(self):
        rep = self.reply("Move this to Friday at 3pm", {"kind": "event", "id": self.event["id"]})
        card = rep["approvals"][0]
        self.assertEqual((card["tool_name"], card["tool_input"]["event_id"]), ("update_event", self.event["id"]))
        self.assertEqual(self.call("GET", f"/api/os/events/{self.event['id']}")[1]["start_at"], "2026-11-13T11:00")
        self.call("POST", f"/api/os/approvals/{card['id']}/approve", {})
        self.assertEqual(self.call("GET", f"/api/os/events/{self.event['id']}")[1]["start_at"], "2026-11-13T15:00")

    def test_journal_entry_for_this_links_the_event(self):
        card = self.reply("Create a journal entry for this", {"kind": "event", "id": self.event["id"]})["approvals"][0]
        self.assertEqual((card["tool_name"], card["tool_input"]["event_id"]), ("create_journal_entry", self.event["id"]))

    def test_unknown_request_with_context_suggests_what_it_can_do(self):
        rep = self.reply("Summarise this for me", {"kind": "journal_entry", "id": self.entry["id"]})
        self.assertEqual(rep["tool_calls"], [])
        self.assertIn("Shell v2 print", rep["content"])
        self.assertIn("Remember this", rep["content"])

    def test_context_never_bypasses_approval_for_a_viewer(self):
        _, _ = self.sign_in("vee")
        self.call("POST", f"/api/os/w/{self.ws}/members", {"handle": "vee", "role": "viewer"})
        vee_token, _ = self.sign_in("vee")
        status, _ = self.say("Remember this", {"selection": "anything"}, token=vee_token)
        self.assertEqual(status, 403)


class ContextMigrationTest(unittest.TestCase):
    def test_existing_messages_table_gains_the_column(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "journal_os.db")
            store = JournalStore(path)
            s = store.sign_in("kj")
            uid, ws = s["user"]["id"], s["workspaces"][0]["id"]
            boot = store.bootstrap_harness(uid, ws)
            msg = store.post_message(uid, boot["channel"]["id"], "from before Barnacle")
            store.close()
            conn = sqlite3.connect(path)  # simulate a database from before this column existed
            conn.execute("ALTER TABLE messages DROP COLUMN context_json")
            conn.commit()
            conn.close()
            store = JournalStore(path)
            self.assertEqual(store.get_message(uid, msg["id"])["context"], {})
            later = store.post_message(uid, boot["channel"]["id"], "after", context={"view": "journal"})
            self.assertEqual(later["context"], {"view": "journal"})
            store.close()


if __name__ == "__main__":
    unittest.main()
