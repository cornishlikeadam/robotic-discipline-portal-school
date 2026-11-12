"""Agent harness tests: channels, members, agents, messages and approvals.

The rule under test throughout: an agent can talk, but nothing it asks to do
touches the planner, journal, memory ledger or another channel until a person
approves that one tool call.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest

from journal_os import interpreter
from journal_os.actions import ActionService
from journal_os.store import (AGENT_TOOLS, MAX_AGENT_HOP, Forbidden, Invalid, JournalStore, NotFound)

HARNESS_TABLES = ("channels", "channel_members", "agents", "messages", "approvals")


class Base(unittest.TestCase):
    def setUp(self) -> None:
        self.store = JournalStore(":memory:")
        self.actions = ActionService(self.store)
        kj = self.store.sign_in("kj", "KJ")
        self.uid, self.ws = kj["user"]["id"], kj["workspaces"][0]["id"]
        sam = self.store.sign_in("sam", "Sam")          # editor in kj's workspace
        self.sam, self.sam_ws = sam["user"]["id"], sam["workspaces"][0]["id"]
        self.store.add_member(self.uid, self.ws, "sam", "editor")
        vee = self.store.sign_in("vee", "Vee")          # viewer in kj's workspace
        self.vee = vee["user"]["id"]
        self.store.add_member(self.uid, self.ws, "vee", "viewer")
        self.channel = self.store.create_channel(self.uid, self.ws, "Build Log", "public", "Robot build notes")
        self.agent = self.store.create_agent(self.uid, self.ws, {"name": "Scout", "role": "researcher"})
        self.store.add_channel_member(self.uid, self.channel["id"], self.agent["id"], "agent")

    def tearDown(self) -> None:
        self.store.close()

    def count(self, table: str) -> int:
        return self.store._one(f"SELECT COUNT(*) AS n FROM {table}")["n"]

    def ask(self, *calls, content: str = "On it.", agent_id=None, channel_id=None, **kw):
        return self.store.post_agent_message(self.uid, agent_id or self.agent["id"], channel_id or self.channel["id"],
                                             content, tool_calls=list(calls), **kw)

    @staticmethod
    def call(tool: str, **tool_input):
        return {"tool": tool, "input": tool_input}


class SchemaTests(Base):
    def test_tables_exist_and_tools_match_whitelist(self):
        names = {r["name"] for r in self.store._all("SELECT name FROM sqlite_master WHERE type = 'table'")}
        self.assertTrue(set(HARNESS_TABLES) <= names)
        # Every planner/journal/memory tool is one the existing pipeline already validates and executes.
        self.assertEqual(set(AGENT_TOOLS) - {"post_message"}, set(interpreter.ACTIONS))

    def test_existing_database_gains_tables_without_losing_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "journal_os.db")
            store = JournalStore(path)
            s = store.sign_in("kj")
            ev = store.create_event(s["user"]["id"], s["workspaces"][0]["id"],
                                    {"title": "Kept", "start_at": "2026-11-12T10:00"})
            store.close()
            # Simulate a database created before the harness existed.
            conn = sqlite3.connect(path)
            for table in reversed(HARNESS_TABLES):
                conn.execute(f"DROP TABLE {table}")
            conn.commit()
            conn.close()
            store = JournalStore(path)
            names = {r["name"] for r in store._all("SELECT name FROM sqlite_master WHERE type = 'table'")}
            self.assertTrue(set(HARNESS_TABLES) <= names)
            self.assertEqual(store.get_event(s["user"]["id"], ev["id"])["title"], "Kept")
            store.close()


class ChannelTests(Base):
    def test_create_normalises_name_and_makes_creator_owner(self):
        self.assertEqual(self.channel["name"], "build-log")
        owner = [m for m in self.channel["members"] if m["member_type"] == "human"][0]
        self.assertEqual((owner["member_id"], owner["role"]), (self.uid, "owner"))
        with self.assertRaises(Invalid):
            self.store.create_channel(self.uid, self.ws, "build log")       # same slug
        with self.assertRaises(Invalid):
            self.store.create_channel(self.uid, self.ws, "dm-sneaky")       # reserved prefix
        with self.assertRaises(Invalid):
            self.store.create_channel(self.uid, self.ws, "x", "broadcast")  # unknown type
        with self.assertRaises(Forbidden):
            self.store.create_channel(self.vee, self.ws, "viewers-cant")

    def test_private_channel_is_invisible_to_non_members(self):
        secret = self.store.create_channel(self.uid, self.ws, "ideas", "private")
        self.assertNotIn("ideas", [c["name"] for c in self.store.list_channels(self.sam, self.ws)])
        with self.assertRaises(NotFound):
            self.store.get_channel(self.sam, secret["id"])
        with self.assertRaises(NotFound):
            self.store.post_message(self.sam, secret["id"], "let me in")
        self.store.add_channel_member(self.uid, secret["id"], self.sam, "human")
        self.assertIn("ideas", [c["name"] for c in self.store.list_channels(self.sam, self.ws)])

    def test_dm_with_agent_is_reused_and_closed_to_others(self):
        dm = self.store.open_dm(self.uid, self.ws, self.agent["id"], "agent")
        self.assertEqual(dm["type"], "dm")
        self.assertEqual(self.store.open_dm(self.uid, self.ws, self.agent["id"], "agent")["id"], dm["id"])
        with self.assertRaises(Invalid):
            self.store.add_channel_member(self.uid, dm["id"], self.sam, "human")
        with self.assertRaises(NotFound):
            self.store.get_channel(self.sam, dm["id"])

    def test_archive_and_ownership_rules(self):
        with self.assertRaises(Forbidden):
            self.store.archive_channel(self.sam, self.channel["id"])
        with self.assertRaises(Invalid):
            self.store.remove_channel_member(self.uid, self.channel["id"], self.uid)  # last owner
        with self.assertRaises(Invalid):
            self.store.add_channel_member(self.uid, self.channel["id"], self.agent["id"], "agent", "owner")
        self.store.archive_channel(self.uid, self.channel["id"])
        with self.assertRaises(Invalid):
            self.store.post_message(self.uid, self.channel["id"], "too late")
        self.assertNotIn("build-log", [c["name"] for c in self.store.list_channels(self.uid, self.ws)])

    def test_viewer_reads_but_cannot_post(self):
        self.store.post_message(self.uid, self.channel["id"], "hello")
        self.assertEqual(len(self.store.list_messages(self.vee, self.channel["id"])), 1)
        with self.assertRaises(Forbidden):
            self.store.post_message(self.vee, self.channel["id"], "hi")

    def test_members_must_belong_to_the_workspace(self):
        other_agent = self.store.create_agent(self.sam, self.sam_ws, {"name": "Elsewhere"})
        with self.assertRaises(NotFound):
            self.store.add_channel_member(self.uid, self.channel["id"], other_agent["id"], "agent")
        with self.assertRaises(Invalid):
            self.store.add_channel_member(self.uid, self.channel["id"], self.agent["id"], "robot")


class AgentTests(Base):
    def test_defaults(self):
        a = self.agent
        self.assertEqual((a["handle"], a["model"], a["status"]), ("scout", "none", "active"))
        self.assertEqual(a["memory_path"], f"agents/{a['id']}/MEMORY.md")
        self.assertEqual(a["resources"], ["channels", "journal", "memory", "planner"])
        self.assertEqual(a["owner_id"], self.uid)

    def test_validation(self):
        bad = [{"name": ""}, {"name": "A", "memory_path": "/etc/passwd.md"}, {"name": "B", "memory_path": "../x.md"},
               {"name": "C", "memory_path": "notes.txt"}, {"name": "D", "monthly_budget_usd": -1},
               {"name": "E", "monthly_budget_usd": "nan"}, {"name": "F", "model": "rm -rf /"},
               {"name": "Scout"},  # handle 'scout' taken
               {"name": "G", "resources": ["planner", "root"]}, {"name": "H", "status": "rogue"}]
        for data in bad:
            with self.subTest(data=data), self.assertRaises(Invalid):
                self.store.create_agent(self.uid, self.ws, data)
        sam_patch = self.store.find_companion(self.sam_ws, "PATCH")
        with self.assertRaises(Invalid):
            self.store.create_agent(self.uid, self.ws, {"name": "Thief", "companion_id": sam_patch["id"]})
        self.assertEqual(len(self.store.list_agents(self.uid, self.ws)), 1)  # nothing half-created

    def test_only_owner_creates_or_edits_agents(self):
        with self.assertRaises(Forbidden):
            self.store.create_agent(self.sam, self.ws, {"name": "Mine"})
        with self.assertRaises(Forbidden):
            self.store.update_agent(self.sam, self.agent["id"], {"status": "paused"})

    def test_grants_are_propose_only_and_revocable(self):
        self.store.update_agent(self.uid, self.agent["id"], {"resources": ["journal"]})
        self.assertFalse(self.store.agent_may(self.ws, self.agent["id"], "planner"))
        self.assertTrue(self.store.agent_may(self.ws, self.agent["id"], "journal"))
        perms = {r["permission"] for r in self.store._all("SELECT permission FROM access_grants WHERE grantee LIKE 'agent:%'")}
        self.assertEqual(perms, {"propose"})
        with self.assertRaises(Forbidden):
            self.ask(self.call("create_event", title="Blocked", start_at="2026-11-12T10:00"))

    def test_bootstrap_is_idempotent_and_links_patch_ledger(self):
        first = self.store.bootstrap_harness(self.uid, self.ws)
        second = self.store.bootstrap_harness(self.uid, self.ws)
        self.assertEqual(first["channel"]["id"], second["channel"]["id"])
        self.assertEqual(first["agent"]["id"], second["agent"]["id"])
        self.assertEqual(first["agent"]["companion_name"], "PATCH")
        self.assertIn(first["agent"]["id"], [m["member_id"] for m in second["channel"]["members"]])
        with self.assertRaises(Forbidden):
            self.store.bootstrap_harness(self.sam, self.ws)

    def test_memory_file_shows_only_approved_memories(self):
        patch = self.store.bootstrap_harness(self.uid, self.ws)["agent"]
        comp = patch["companion_id"]
        kept = self.store.propose_memory(self.uid, self.ws, comp, "project", "Building a rabbit chassis")
        self.store.review_memory(self.uid, kept["id"], approve=True)
        self.store.propose_memory(self.uid, self.ws, comp, "interest", "Unreviewed idea")
        md = self.store.render_agent_memory(self.uid, patch["id"])
        self.assertEqual(md["path"], patch["memory_path"])
        self.assertIn("Building a rabbit chassis", md["markdown"])
        self.assertNotIn("Unreviewed idea", md["markdown"])
        self.assertIn("keeps no memories", self.store.render_agent_memory(self.uid, self.agent["id"])["markdown"])


class MessageTests(Base):
    def test_mentions_threads_and_listing(self):
        outsider = self.store.create_agent(self.uid, self.ws, {"name": "Outsider"})
        root = self.store.post_message(self.uid, self.channel["id"], "@Scout and @outsider, look at this")
        self.assertEqual(root["mentions"], [self.agent["id"]])  # outsider isn't in the channel
        self.assertNotEqual(outsider["id"], self.agent["id"])
        reply = self.store.post_message(self.uid, self.channel["id"], "first reply", thread_id=root["id"])
        nested = self.store.post_message(self.uid, self.channel["id"], "reply to reply", thread_id=reply["id"])
        self.assertEqual(nested["thread_id"], root["id"])  # threads stay one level deep
        self.store.post_message(self.uid, self.channel["id"], "second top-level")
        top = self.store.list_messages(self.uid, self.channel["id"])
        self.assertEqual([m["content"][:5] for m in top], ["@Scou", "secon"])
        self.assertEqual(top[0]["reply_count"], 2)
        self.assertEqual(len(self.store.list_messages(self.uid, self.channel["id"], limit=1)), 1)
        self.assertEqual(len(self.store.list_messages(self.uid, self.channel["id"], thread_id=root["id"])), 3)

    def test_posting_in_public_channel_joins_it(self):
        self.store.post_message(self.sam, self.channel["id"], "hi all")
        self.assertTrue(self.store.get_channel(self.sam, self.channel["id"])["is_member"])

    def test_agent_must_be_active_member_and_say_something(self):
        loner = self.store.create_agent(self.uid, self.ws, {"name": "Loner"})
        with self.assertRaises(Forbidden):
            self.ask(content="hi", agent_id=loner["id"])
        with self.assertRaises(Invalid):
            self.ask(content="")
        self.store.update_agent(self.uid, self.agent["id"], {"status": "paused"})
        with self.assertRaises(Forbidden):
            self.ask(content="still here?")

    def test_agent_reply_chain_is_capped(self):
        msg = self.store.post_message(self.uid, self.channel["id"], "@scout go")
        for expected_hop in range(1, MAX_AGENT_HOP + 1):
            msg = self.ask(content=f"hop {expected_hop}", trigger_message_id=msg["id"])
            self.assertEqual(msg["hop"], expected_hop)
        with self.assertRaises(Invalid):
            self.ask(content="one too many", trigger_message_id=msg["id"])


class ApprovalTests(Base):
    EVENT = {"title": "Robotics build session", "start_at": "2026-11-12T11:00", "duration_minutes": 90}

    def test_tool_call_waits_for_approval_then_runs(self):
        msg = self.ask(self.call("create_event", **self.EVENT), content="I'll book the build session.")
        self.assertEqual(msg["approval_status"], "pending")
        approval_id = msg["tool_calls"][0]["approval_id"]
        ap = self.store.get_approval(self.uid, approval_id)
        self.assertEqual((ap["status"], ap["tool_name"]), ("pending", "create_event"))
        prop = self.actions.get(self.uid, ap["proposal_id"])
        self.assertEqual((prop["status"], prop["source"]), ("PENDING", f"agent:{self.agent['id']}"))
        self.assertEqual(self.store.list_events(self.uid, self.ws), [])  # nothing saved yet

        done = self.actions.decide_tool_call(self.uid, approval_id, approve=True)
        self.assertEqual(done["status"], "approved")
        events = self.store.list_events(self.uid, self.ws)
        self.assertEqual([e["title"] for e in events], ["Robotics build session"])
        self.assertEqual(done["result"]["event"]["id"], events[0]["id"])
        self.assertEqual(self.store.get_message(self.uid, msg["id"])["approval_status"], "approved")
        self.assertEqual(self.actions.get(self.uid, ap["proposal_id"])["status"], "EXECUTED")
        audit = self.store.list_audit(self.uid, self.ws)
        self.assertTrue(any(a["action"] == "event.create" and a["detail"]["via"] == "agent" for a in audit))
        with self.assertRaises(Invalid):
            self.actions.decide_tool_call(self.uid, approval_id, approve=True)  # can't run twice

    def test_reject_and_mixed(self):
        msg = self.ask(self.call("create_event", **self.EVENT),
                       self.call("create_journal_entry", title="Build notes", body="Shell v2"))
        first, second = [c["approval_id"] for c in msg["tool_calls"]]
        self.actions.decide_tool_call(self.uid, first, approve=False)
        self.assertEqual(self.store.get_message(self.uid, msg["id"])["approval_status"], "pending")
        self.actions.decide_tool_call(self.uid, second, approve=True)
        self.assertEqual(self.store.get_message(self.uid, msg["id"])["approval_status"], "mixed")
        self.assertEqual(self.store.list_events(self.uid, self.ws), [])
        self.assertEqual([e["title"] for e in self.store.list_entries(self.uid, self.ws)], ["Build notes"])
        self.assertEqual(self.actions.get(self.uid, self.store.get_approval(self.uid, first)["proposal_id"])["status"],
                         "REJECTED")

    def test_agent_proposals_cannot_be_decided_through_the_command_bar(self):
        msg = self.ask(self.call("create_event", **self.EVENT))
        proposal_id = self.store.get_approval(self.uid, msg["tool_calls"][0]["approval_id"])["proposal_id"]
        with self.assertRaises(Forbidden):
            self.actions.approve(self.uid, proposal_id)
        with self.assertRaises(Forbidden):
            self.actions.reject(self.uid, proposal_id)
        self.assertEqual(self.actions.get(self.uid, proposal_id)["status"], "PENDING")
        self.assertEqual(self.store.list_events(self.uid, self.ws), [])

    def test_bad_tool_calls_write_nothing(self):
        before = {t: self.count(t) for t in ("messages", "approvals", "action_proposals")}
        bad_calls = [
            self.call("run_shell", cmd="rm -rf /"),                                         # not a tool
            self.call("create_event", title="X", start_at="2026-11-12T10:00", owner="me"),  # extra field
            self.call("create_event", title="X", start_at="2026-11-12T10:00", calendar="companion"),
            self.call("delete_event", event_id="evt-nope"),                                 # unknown event
            {"tool": "create_event", "input": "title=X"},                                  # input not an object
        ]
        for bad in bad_calls:
            with self.subTest(call=bad), self.assertRaises(Invalid):
                self.ask(self.call("create_journal_entry", title="ok"), bad)
        with self.assertRaises(Invalid):
            self.ask(*[self.call("create_journal_entry", title=str(i)) for i in range(6)])  # too many
        self.assertEqual({t: self.count(t) for t in before}, before)

    def test_memory_tool_needs_a_ledger_and_still_needs_ledger_approval(self):
        with self.assertRaises(Forbidden):  # Scout has no companion ledger
            self.ask(self.call("propose_memory", content="KJ likes brass inserts", category="interest"))
        patch = self.store.bootstrap_harness(self.uid, self.ws)["agent"]
        general = self.store.bootstrap_harness(self.uid, self.ws)["channel"]
        moss = self.store.find_companion(self.ws, "MOSS")
        with self.assertRaises(Forbidden):
            self.ask(self.call("propose_memory", content="x", category="interest", companion_id=moss["id"]),
                     agent_id=patch["id"], channel_id=general["id"])
        msg = self.ask(self.call("propose_memory", content="KJ likes brass inserts", category="interest"),
                       agent_id=patch["id"], channel_id=general["id"])
        done = self.actions.decide_tool_call(self.uid, msg["tool_calls"][0]["approval_id"], approve=True)
        memory = done["result"]["memory"]
        self.assertEqual((memory["status"], memory["companion_id"]), ("PROPOSED", patch["companion_id"]))
        self.assertNotIn("brass", self.store.render_agent_memory(self.uid, patch["id"])["markdown"])

    def test_only_owner_decides_and_edits_cannot_retarget(self):
        ev = self.store.create_event(self.uid, self.ws, {"title": "Old", "start_at": "2026-11-12T09:00"})
        other = self.store.create_event(self.uid, self.ws, {"title": "Other", "start_at": "2026-11-13T09:00"})
        msg = self.ask(self.call("update_event", event_id=ev["id"], start_at="2026-11-12T15:00"))
        approval_id = msg["tool_calls"][0]["approval_id"]
        for user in (self.sam, self.vee):
            with self.subTest(user=user), self.assertRaises(Forbidden):
                self.actions.decide_tool_call(user, approval_id, approve=True)
        with self.assertRaises(Forbidden):
            self.actions.decide_tool_call(self.uid, approval_id, approve=True, edited_input={"event_id": other["id"]})
        self.assertEqual(self.store.get_approval(self.uid, approval_id)["status"], "pending")
        done = self.actions.decide_tool_call(self.uid, approval_id, approve=True,
                                             edited_input={"start_at": "2026-11-12T16:00"})
        self.assertEqual(done["tool_input"]["start_at"], "2026-11-12T16:00")
        self.assertEqual(self.store.get_event(self.uid, ev["id"])["start_at"], "2026-11-12T16:00")

    def test_execution_failure_is_recorded(self):
        ev = self.store.create_event(self.uid, self.ws, {"title": "Gone soon", "start_at": "2026-11-12T09:00"})
        msg = self.ask(self.call("delete_event", event_id=ev["id"]))
        self.store.delete_event(self.uid, ev["id"])  # the person deletes it first
        approval_id = msg["tool_calls"][0]["approval_id"]
        with self.assertRaises(Exception):
            self.actions.decide_tool_call(self.uid, approval_id, approve=True)
        ap = self.store.get_approval(self.uid, approval_id)
        self.assertEqual(ap["status"], "failed")
        self.assertIn("error", ap["result"])
        self.assertEqual(self.actions.get(self.uid, ap["proposal_id"])["status"], "FAILED")

    def test_post_message_tool_posts_after_approval(self):
        notes = self.store.create_channel(self.uid, self.ws, "notes", "agent-room")
        trigger = self.store.post_message(self.uid, self.channel["id"], "@scout summarise in #notes")
        with self.assertRaises(Forbidden):  # Scout isn't in #notes yet
            self.ask(self.call("post_message", channel_id=notes["id"], content="Summary"),
                     trigger_message_id=trigger["id"])
        self.store.add_channel_member(self.uid, notes["id"], self.agent["id"], "agent")
        msg = self.ask(self.call("post_message", channel_id=notes["id"], content="Summary draft"),
                       trigger_message_id=trigger["id"])
        self.assertEqual(self.store.list_messages(self.uid, notes["id"]), [])
        approval_id = msg["tool_calls"][0]["approval_id"]
        self.assertIsNone(self.store.get_approval(self.uid, approval_id)["proposal_id"])
        with self.assertRaises(Forbidden):
            self.actions.decide_tool_call(self.uid, approval_id, True, edited_input={"channel_id": self.channel["id"]})
        self.actions.decide_tool_call(self.uid, approval_id, True, edited_input={"content": "Summary, edited"})
        posted = self.store.list_messages(self.uid, notes["id"])
        self.assertEqual([(m["content"], m["author_type"], m["hop"]) for m in posted],
                         [("Summary, edited", "agent", msg["hop"] + 1)])

    def test_other_workspaces_and_private_channels_stay_closed(self):
        msg = self.ask(self.call("create_journal_entry", title="Private plan"))
        approval_id = msg["tool_calls"][0]["approval_id"]
        outsider = self.store.sign_in("zed")["user"]["id"]
        with self.assertRaises(Forbidden):
            self.store.get_approval(outsider, approval_id)
        with self.assertRaises(Forbidden):
            self.store.list_approvals(outsider, self.ws)
        with self.assertRaises(Forbidden):
            self.actions.decide_tool_call(outsider, approval_id, approve=True)
        theirs = self.store.create_agent(self.sam, self.sam_ws, {"name": "Visitor"})
        with self.assertRaises(Forbidden):
            self.store.post_agent_message(self.uid, theirs["id"], self.channel["id"], "hello")

        secret = self.store.create_channel(self.uid, self.ws, "secret", "private")
        self.store.add_channel_member(self.uid, secret["id"], self.agent["id"], "agent")
        self.ask(self.call("create_journal_entry", title="Hidden"), channel_id=secret["id"])
        self.assertEqual(len(self.store.list_approvals(self.uid, self.ws)), 2)
        self.assertEqual(len(self.store.list_approvals(self.sam, self.ws)), 1)  # sam can't see #secret

    def test_pending_approval_survives_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "journal_os.db")
            store = JournalStore(path)
            s = store.sign_in("kj")
            uid, ws = s["user"]["id"], s["workspaces"][0]["id"]
            boot = store.bootstrap_harness(uid, ws)
            msg = store.post_agent_message(uid, boot["agent"]["id"], boot["channel"]["id"], "Booking it",
                                           tool_calls=[self.call("create_event", **self.EVENT)])
            store.close()

            store = JournalStore(path)  # a fresh process would see the same file
            actions = ActionService(store)
            pending = store.list_approvals(uid, ws)
            self.assertEqual([p["id"] for p in pending], [msg["tool_calls"][0]["approval_id"]])
            actions.decide_tool_call(uid, pending[0]["id"], approve=True)
            self.assertEqual([e["title"] for e in store.list_events(uid, ws)], ["Robotics build session"])
            self.assertEqual(store.list_messages(uid, boot["channel"]["id"])[0]["approval_status"], "approved")
            store.close()


if __name__ == "__main__":
    unittest.main()
