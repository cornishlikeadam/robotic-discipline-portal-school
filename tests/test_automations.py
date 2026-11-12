"""Automations: the morning brief, evening journal prompt and weekly review.

They run on the caller's clock, at most once per day (or week), post only
chat text, and anything they suggest changing is a pending approval.
"""

from __future__ import annotations

import json
import unittest

from journal_os.automations import is_due, next_run, parse_now, period_of
from journal_os.server import JournalOSApp

SETUP = "2026-11-12T07:00"  # a Thursday, before the morning brief


class AutomationBase(unittest.TestCase):
    def setUp(self) -> None:
        self.app = JournalOSApp(db_path=":memory:")
        self.token, self.ws = self.sign_in("kj")
        self.event = self.call("POST", f"/api/os/w/{self.ws}/events",
                               {"title": "Robotics build session", "start_at": "2026-11-12T11:00",
                                "duration_minutes": 90})[1]
        self.call("POST", f"/api/os/w/{self.ws}/events",
                  {"title": "Order brass inserts", "kind": "task", "start_at": "2026-11-10T09:00",
                   "duration_minutes": 15})
        self.boot = self.call("POST", f"/api/os/w/{self.ws}/harness/bootstrap", {"now": SETUP})[1]
        self.autos = {a["kind"]: a for a in self.list()}

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

    def list(self, now=SETUP):
        return self.call("GET", f"/api/os/w/{self.ws}/automations?now={now}")[1]

    def tick(self, now, token="default"):
        status, ran = self.call("POST", f"/api/os/w/{self.ws}/automations/tick", {"now": now}, token)
        self.assertEqual(status, 200, ran)
        return ran

    def kinds(self, ran):
        return [r["automation"]["kind"] for r in ran]


class SetupTests(AutomationBase):
    def test_bootstrap_creates_three_automations_once(self):
        self.assertEqual(sorted(self.autos), ["evening_prompt", "morning_brief", "weekly_review"])
        brief, evening, weekly = self.autos["morning_brief"], self.autos["evening_prompt"], self.autos["weekly_review"]
        self.assertEqual((brief["where"], brief["time_of_day"], brief["agent_name"]), ("#general", "08:00", "PATCH"))
        self.assertEqual(evening["where"], "DM with PATCH")
        self.assertEqual((weekly["weekday"], weekly["schedule"]), (6, "Sundays at 18:00"))
        self.call("POST", f"/api/os/w/{self.ws}/harness/bootstrap", {"now": SETUP})
        self.assertEqual(len(self.list()), 3)

    def test_setting_up_late_does_not_backfill_today(self):
        app = JournalOSApp(db_path=":memory:")
        try:
            data = json.loads(app.handle("POST", "/api/os/session", json.dumps({"handle": "late"}))[2])
            auth = {"Authorization": f"Bearer {data['token']}"}
            ws = data["workspaces"][0]["id"]
            app.handle("POST", f"/api/os/w/{ws}/harness/bootstrap", json.dumps({"now": "2026-11-12T21:30"}), auth)
            ran = json.loads(app.handle("POST", f"/api/os/w/{ws}/automations/tick",
                                        json.dumps({"now": "2026-11-12T21:31"}), auth)[2])
            self.assertEqual(ran, [])  # no morning brief at night, no second evening prompt
            ran = json.loads(app.handle("POST", f"/api/os/w/{ws}/automations/tick",
                                        json.dumps({"now": "2026-11-13T08:00"}), auth)[2])
            self.assertEqual([r["automation"]["kind"] for r in ran], ["morning_brief"])
        finally:
            app.close()

    def test_next_run_is_reported(self):
        self.assertEqual(self.autos["morning_brief"]["next_run"], "2026-11-12T08:00")
        self.assertEqual(self.autos["weekly_review"]["next_run"], "2026-11-15T18:00")


class ScheduleTests(AutomationBase):
    def test_morning_brief_runs_once_per_day_and_catches_up(self):
        self.assertEqual(self.tick("2026-11-12T07:59"), [])
        ran = self.tick("2026-11-12T09:30")  # the app opened late: catch up once
        self.assertEqual(self.kinds(ran), ["morning_brief"])
        self.assertEqual(self.tick("2026-11-12T10:00"), [])
        self.assertEqual(self.kinds(self.tick("2026-11-13T08:00")), ["morning_brief"])

    def test_a_missed_day_is_not_backfilled(self):
        self.tick("2026-11-12T08:00")
        ran = self.tick("2026-11-14T09:00")  # nothing ran on the 13th
        self.assertEqual(self.kinds(ran), ["morning_brief"])  # one brief, for the 14th

    def test_weekly_review_runs_on_sunday_evening(self):
        self.tick("2026-11-14T23:00")  # Saturday: brief and evening only
        self.assertNotIn("weekly_review", self.kinds(self.tick("2026-11-15T17:59")))
        self.assertIn("weekly_review", self.kinds(self.tick("2026-11-15T18:00")))
        self.assertNotIn("weekly_review", self.kinds(self.tick("2026-11-15T22:00")))

    def test_disabled_automations_do_not_run(self):
        brief = self.autos["morning_brief"]
        status, out = self.call("POST", f"/api/os/automations/{brief['id']}", {"enabled": False, "now": SETUP})
        self.assertEqual((status, out["enabled"], out["next_run"]), (200, False, None))
        self.assertEqual(self.tick("2026-11-12T09:00"), [])

    def test_changing_the_time(self):
        brief = self.autos["morning_brief"]
        out = self.call("POST", f"/api/os/automations/{brief['id']}", {"time_of_day": "06:30", "now": SETUP})[1]
        self.assertEqual(out["time_of_day"], "06:30")
        self.assertEqual(self.kinds(self.tick("2026-11-12T07:01")), ["morning_brief"])
        for bad in ({"time_of_day": "25:00"}, {"time_of_day": "8am"}, {"weekday": 3}, {"enabled": "yes"}):
            with self.subTest(bad=bad):
                self.assertEqual(self.call("POST", f"/api/os/automations/{brief['id']}", bad)[0], 400)

    def test_period_helpers(self):
        weekly = {"time_of_day": "18:00", "weekday": 6, "enabled": True, "last_period": None}
        now = parse_now("2026-11-12T10:00")
        self.assertEqual(period_of(weekly, now), ("2026-W46", parse_now("2026-11-15T18:00")))
        self.assertFalse(is_due(weekly, now))
        self.assertEqual(next_run({**weekly, "last_period": "2026-W46"}, now), "2026-11-22T18:00")
        with self.assertRaises(Exception):
            parse_now("tomorrow")


class ContentTests(AutomationBase):
    def test_morning_brief_lists_today_and_open_tasks(self):
        message = self.tick("2026-11-12T08:00")[0]["message"]
        self.assertEqual(message["channel_id"], self.boot["channel"]["id"])
        self.assertEqual((message["author_type"], message["tool_calls"]), ("agent", []))
        self.assertIn("11:00 Robotics build session (90 min)", message["content"])
        self.assertIn("Order brass inserts", message["content"])

    def test_evening_prompt_drafts_an_entry_that_waits_for_approval(self):
        self.tick("2026-11-12T08:00")
        message = self.tick("2026-11-12T20:00")[0]["message"]
        channel = self.call("GET", f"/api/os/channels/{message['channel_id']}")[1]
        self.assertEqual(channel["type"], "dm")
        card = message["approvals"][0]
        self.assertEqual((card["tool_name"], card["status"]), ("create_journal_entry", "pending"))
        self.assertEqual(card["tool_input"]["event_id"], self.event["id"])
        self.assertEqual(self.call("GET", f"/api/os/w/{self.ws}/journal")[1], [])  # nothing saved yet
        done = self.call("POST", f"/api/os/approvals/{card['id']}/approve", {})[1]
        entry = done["result"]["entry"]
        self.assertEqual((entry["event_id"], entry["tags"]), (self.event["id"], ["reflection"]))

    def test_rejecting_the_draft_changes_nothing(self):
        card = self.call("POST", f"/api/os/automations/{self.autos['evening_prompt']['id']}/run",
                         {"now": "2026-11-12T20:00"})[1]["message"]["approvals"][0]
        self.call("POST", f"/api/os/approvals/{card['id']}/reject", {})
        self.assertEqual(self.call("GET", f"/api/os/w/{self.ws}/journal")[1], [])

    def test_weekly_review_counts_the_week(self):
        self.call("POST", f"/api/os/w/{self.ws}/journal", {"title": "Shell v2 print"})
        ran = self.call("POST", f"/api/os/automations/{self.autos['weekly_review']['id']}/run",
                        {"now": "2026-11-15T18:00"})[1]
        text = ran["message"]["content"]
        self.assertIn("Nov 9–15", text)
        self.assertIn("2 items", text)
        self.assertIn("“Shell v2 print”", text)


class PermissionTests(AutomationBase):
    def add_member(self, handle, role):
        self.sign_in(handle)
        self.call("POST", f"/api/os/w/{self.ws}/members", {"handle": handle, "role": role})
        return self.sign_in(handle)[0]

    def test_only_the_owner_changes_or_runs_automations(self):
        brief = self.autos["morning_brief"]
        for role in ("viewer", "editor"):
            token = self.add_member(f"{role}-person", role)
            with self.subTest(role=role):
                self.assertEqual(self.call("GET", f"/api/os/w/{self.ws}/automations", token=token)[0], 200)
                self.assertEqual(self.call("POST", f"/api/os/automations/{brief['id']}", {"enabled": False},
                                           token=token)[0], 403)
                self.assertEqual(self.call("POST", f"/api/os/automations/{brief['id']}/run", {}, token=token)[0], 403)

    def test_a_members_tick_never_runs_the_owners_automations(self):
        token = self.add_member("ed", "editor")
        self.assertEqual(self.tick("2026-11-12T09:00", token=token), [])
        self.assertEqual(self.kinds(self.tick("2026-11-12T09:00")), ["morning_brief"])

    def test_outsiders_cannot_see_or_tick(self):
        other, _ = self.sign_in("sam")
        self.assertEqual(self.call("GET", f"/api/os/w/{self.ws}/automations", token=other)[0], 403)
        self.assertEqual(self.call("POST", f"/api/os/w/{self.ws}/automations/tick", {"now": SETUP}, token=other)[0],
                         403)

    def test_a_paused_agent_records_an_error_instead_of_posting(self):
        self.call("POST", f"/api/os/agents/{self.boot['agent']['id']}", {"status": "paused"})
        run = self.tick("2026-11-12T08:00")[0]
        self.assertIsNone(run["message"])
        self.assertIn("paused", run["error"])
        self.assertEqual(self.tick("2026-11-12T09:00"), [])  # not retried every tick


class ServerTickerTests(AutomationBase):
    def test_local_ticker_runs_due_automations_and_shows_in_the_feed(self):
        self.assertEqual(self.app.tick_automations("2026-11-12T08:00"), 1)
        self.assertEqual(self.app.tick_automations("2026-11-12T08:01"), 0)
        changes = self.app.store.list_changes(self.app.store.user_for_token(self.token)["id"], self.ws, 0)["events"]
        types = {e["type"] for e in changes}
        self.assertTrue({"message", "automation"} <= types)


if __name__ == "__main__":
    unittest.main()
