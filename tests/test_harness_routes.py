"""Channel, message, approval and live-update routes (agent harness, Prompt 2).

Most tests drive JournalOSApp.handle exactly as the browser's requests do.
LiveServerTests starts the real server process to check the streaming
endpoint, that other requests still run while a stream is open, and that
messages and decisions survive a restart.
"""

from __future__ import annotations

import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

from journal_os.server import JournalOSApp

REPO = pathlib.Path(__file__).resolve().parent.parent
NOW = "2026-11-12T09:00"
SCHEDULE = "@patch schedule a robotics build session tomorrow at 11 for 90 minutes"


def sse_events(text: str):
    """Parse an SSE body into (event, data) pairs."""
    out = []
    for frame in text.split("\n\n"):
        event, data = "message", ""
        for line in frame.splitlines():
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: "):
                data += line[6:]
        if data:
            out.append((event, json.loads(data)))
    return out


class RouteBase(unittest.TestCase):
    def setUp(self) -> None:
        self.app = JournalOSApp(db_path=":memory:")
        self.token, self.uid, self.ws = self.sign_in("kj")
        status, boot = self.call("POST", f"/api/os/w/{self.ws}/harness/bootstrap", {})
        self.assertEqual(status, 200, boot)
        self.general = boot["channel"]["id"]
        self.patch = boot["agent"]

    def tearDown(self) -> None:
        self.app.close()

    def sign_in(self, handle: str):
        status, _, body = self.app.handle("POST", "/api/os/session", json.dumps({"handle": handle}))
        data = json.loads(body)
        return data["token"], data["user"]["id"], data["workspaces"][0]["id"]

    def call(self, method: str, path: str, body=None, token: str | None = "default"):
        token = self.token if token == "default" else token
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        status, hdrs, text = self.app.handle(method, path, json.dumps(body) if body is not None else None, headers)
        if hdrs.get("Content-Type", "").startswith("application/json"):
            return status, json.loads(text)
        return status, text

    def post(self, content: str, channel: str | None = None, token: str | None = "default", **extra):
        return self.call("POST", f"/api/os/channels/{channel or self.general}/messages",
                         {"content": content, "now": NOW, **extra}, token)

    def events(self):
        return self.call("GET", f"/api/os/w/{self.ws}/events")[1]

    def add_people(self):
        """sam joins kj's workspace as editor, vee as viewer."""
        sam_token, _, _ = self.sign_in("sam")
        vee_token, _, _ = self.sign_in("vee")
        self.call("POST", f"/api/os/w/{self.ws}/members", {"handle": "sam", "role": "editor"})
        self.call("POST", f"/api/os/w/{self.ws}/members", {"handle": "vee", "role": "viewer"})
        return sam_token, vee_token


class ChannelRouteTests(RouteBase):
    def test_list_and_create(self):
        status, channels = self.call("GET", f"/api/os/w/{self.ws}/channels")
        # Setup also opens the DM with PATCH, where the evening journal prompt is posted.
        self.assertEqual((status, [(c["type"], c.get("dm_with", {}).get("name")) if c["type"] == "dm" else c["name"]
                                   for c in channels]), (200, ["general", ("dm", "PATCH")]))
        status, ch = self.call("POST", f"/api/os/w/{self.ws}/channels",
                               {"name": "Build Log", "type": "private", "description": "notes",
                                "agent_ids": [self.patch["id"]]})
        self.assertEqual(status, 201, ch)
        self.assertEqual((ch["name"], ch["type"]), ("build-log", "private"))
        self.assertIn(self.patch["id"], [m["member_id"] for m in ch["members"]])
        status, err = self.call("POST", f"/api/os/w/{self.ws}/channels", {"name": "ghost", "agent_ids": ["agt-nope"]})
        self.assertEqual(status, 400, err)
        names = [c["name"] for c in self.call("GET", f"/api/os/w/{self.ws}/channels")[1]]
        self.assertNotIn("ghost", names)  # nothing half-created

    def test_roles_and_outsiders(self):
        sam, vee = self.add_people()
        self.assertEqual(self.call("POST", f"/api/os/w/{self.ws}/channels", {"name": "vee-room"}, vee)[0], 403)
        self.assertEqual(self.call("POST", f"/api/os/w/{self.ws}/channels", {"name": "sam-room"}, sam)[0], 201)
        outsider, _, _ = self.sign_in("zed")
        self.assertEqual(self.call("GET", f"/api/os/w/{self.ws}/channels", token=outsider)[0], 403)
        self.assertEqual(self.call("GET", f"/api/os/channels/{self.general}", token=outsider)[0], 403)
        self.assertEqual(self.call("GET", f"/api/os/w/{self.ws}/channels", token=None)[0], 401)

    def test_members_and_dm_routes(self):
        status, scout = self.call("POST", f"/api/os/w/{self.ws}/agents", {"name": "Scout"})
        self.assertEqual(status, 201, scout)
        status, added = self.call("POST", f"/api/os/channels/{self.general}/members",
                                  {"member_id": scout["id"], "member_type": "agent", "role": "observer"})
        self.assertEqual((status, added["role"]), (200, "observer"))
        status, _ = self.call("DELETE", f"/api/os/channels/{self.general}/members", {"member_id": scout["id"]})
        self.assertEqual(status, 200)
        status, dm = self.call("POST", f"/api/os/w/{self.ws}/dms", {"member_id": self.patch["id"], "member_type": "agent"})
        self.assertEqual((status, dm["type"], dm["dm_with"]["name"]), (200, "dm", "PATCH"))
        self.assertEqual(self.call("POST", f"/api/os/w/{self.ws}/dms",
                                   {"member_id": self.patch["id"], "member_type": "agent"})[1]["id"], dm["id"])


class MessageRouteTests(RouteBase):
    def test_mention_gets_a_pending_card_and_saves_nothing(self):
        status, res = self.post(SCHEDULE)
        self.assertEqual(status, 201, res)
        self.assertEqual(res["message"]["mentions"], [self.patch["id"]])
        [reply] = res["replies"]
        self.assertEqual((reply["author_type"], reply["author_id"]), ("agent", self.patch["id"]))
        [card] = reply["approvals"]
        self.assertEqual((card["status"], card["tool_name"]), ("pending", "create_event"))
        self.assertEqual(card["tool_input"]["start_at"], "2026-11-13T11:00")
        self.assertEqual(self.events(), [])
        status, pending = self.call("GET", f"/api/os/w/{self.ws}/approvals")
        self.assertEqual([p["id"] for p in pending], [card["id"]])
        self.assertEqual(pending[0]["channel_id"], self.general)

    def test_unaddressed_messages_get_no_reply(self):
        self.assertEqual(self.post("hello team")[1]["replies"], [])

    def test_unknown_request_gets_help_text_not_a_card(self):
        [reply] = self.post("@patch what's the weather like?")[1]["replies"]
        self.assertIn("stand-in", reply["content"])
        self.assertEqual(reply["tool_calls"], [])

    def test_thread_replies_stay_in_the_thread(self):
        root = self.post("Planning the build week")[1]["message"]
        status, res = self.post(SCHEDULE, thread_id=root["id"])
        self.assertEqual(status, 201, res)
        self.assertEqual(res["replies"][0]["thread_id"], root["id"])
        thread = self.call("GET", f"/api/os/channels/{self.general}/messages?thread={root['id']}")[1]
        self.assertEqual(len(thread), 3)
        top = self.call("GET", f"/api/os/channels/{self.general}/messages")[1]
        self.assertEqual([(m["id"], m["reply_count"]) for m in top], [(root["id"], 2)])

    def test_dm_agent_answers_without_a_mention(self):
        dm = self.call("POST", f"/api/os/w/{self.ws}/dms", {"member_id": self.patch["id"], "member_type": "agent"})[1]
        [reply] = self.post("Create a journal entry for my robotics build session", channel=dm["id"])[1]["replies"]
        self.assertEqual(reply["approvals"][0]["tool_name"], "create_journal_entry")

    def test_memory_request_targets_the_agents_own_ledger(self):
        [reply] = self.post("@patch remember that I print on Thursdays")[1]["replies"]
        card = reply["approvals"][0]
        self.assertEqual(card["tool_input"]["companion_id"], self.patch["companion_id"])
        status, done = self.call("POST", f"/api/os/approvals/{card['id']}/approve", {})
        self.assertEqual(status, 200, done)
        self.assertEqual(done["result"]["memory"]["status"], "PROPOSED")  # still needs the ledger

    def test_agent_without_a_grant_explains_instead_of_asking(self):
        scout = self.call("POST", f"/api/os/w/{self.ws}/agents", {"name": "Scout", "resources": ["journal"]})[1]
        self.call("POST", f"/api/os/channels/{self.general}/members", {"member_id": scout["id"], "member_type": "agent"})
        [reply] = self.post("@scout schedule a robotics build session tomorrow at 11")[1]["replies"]
        self.assertEqual(reply["tool_calls"], [])
        self.assertIn("can't propose", reply["content"])
        self.assertEqual(self.call("GET", f"/api/os/w/{self.ws}/approvals")[1], [])


class ApprovalRouteTests(RouteBase):
    def card(self):
        return self.post(SCHEDULE)[1]["replies"][0]["approvals"][0]

    def test_approve_runs_once(self):
        card = self.card()
        status, done = self.call("POST", f"/api/os/approvals/{card['id']}/approve", {})
        self.assertEqual((status, done["status"], done["decided_by_name"]), (200, "approved", "kj"))
        self.assertEqual([e["title"] for e in self.events()], ["Robotics build session"])
        msg = self.call("GET", f"/api/os/messages/{card['message_id']}")[1]
        self.assertEqual(msg["approval_status"], "approved")
        self.assertEqual(self.call("POST", f"/api/os/approvals/{card['id']}/approve", {})[0], 400)
        self.assertEqual(len(self.events()), 1)

    def test_reject_changes_nothing(self):
        card = self.card()
        status, done = self.call("POST", f"/api/os/approvals/{card['id']}/reject", {})
        self.assertEqual((status, done["status"]), (200, "rejected"))
        self.assertEqual(self.events(), [])

    def test_edits_on_approval(self):
        card = self.card()
        status, done = self.call("POST", f"/api/os/approvals/{card['id']}/approve", {"input": {"title": "Shell v3 build"}})
        self.assertEqual(status, 200, done)
        self.assertEqual([e["title"] for e in self.events()], ["Shell v3 build"])

    def test_only_owner_decides_and_viewers_cannot_post(self):
        sam, vee = self.add_people()
        card = self.card()
        self.assertEqual(self.call("POST", f"/api/os/approvals/{card['id']}/approve", {}, sam)[0], 403)
        self.assertEqual(self.post("@patch hi", token=vee)[0], 403)
        outsider, _, _ = self.sign_in("zed")
        self.assertEqual(self.call("GET", f"/api/os/approvals/{card['id']}", token=outsider)[0], 403)
        self.assertEqual(self.call("GET", f"/api/os/approvals/{card['id']}")[1]["status"], "pending")
        self.assertEqual(self.events(), [])

    def test_command_bar_route_cannot_approve_an_agent_proposal(self):
        card = self.card()
        status, err = self.call("POST", f"/api/os/actions/{card['proposal_id']}/approve", {})
        self.assertEqual(status, 403, err)
        self.assertEqual(self.call("GET", f"/api/os/approvals/{card['id']}")[1]["status"], "pending")
        self.assertEqual(self.events(), [])


class StreamRouteTests(RouteBase):
    def stream(self, after=None, token="default"):
        path = f"/api/os/w/{self.ws}/stream" + (f"?after={after}" if after is not None else "")
        return self.call("GET", path, token=token)

    def test_cursor_then_changes(self):
        status, body = self.stream()
        self.assertEqual(status, 200)
        self.assertTrue(body.startswith("retry: 3000"))
        cursor = sse_events(body)[-1][1]["cursor"]
        self.post(SCHEDULE)
        changes = sse_events(self.stream(cursor)[1])
        kinds = [(e, d.get("type")) for e, d in changes if e == "change"]
        self.assertEqual(kinds, [("change", "message"), ("change", "message"), ("change", "approval")])
        self.assertTrue(all(d["channel_id"] == self.general for e, d in changes if e == "change"))
        self.assertGreater(changes[-1][1]["cursor"], cursor)

    def test_private_channels_stay_private(self):
        sam, _ = self.add_people()
        cursor = sse_events(self.stream(token=sam)[1])[-1][1]["cursor"]
        ch = self.call("POST", f"/api/os/w/{self.ws}/channels",
                       {"name": "secret", "type": "private", "agent_ids": [self.patch["id"]]})[1]
        self.post(SCHEDULE, channel=ch["id"])
        sam_sees = [d for e, d in sse_events(self.stream(cursor, token=sam)[1]) if e == "change"]
        kj_sees = [d for e, d in sse_events(self.stream(cursor)[1]) if e == "change"]
        self.assertEqual([d for d in sam_sees if d.get("channel_id") == ch["id"]], [])
        self.assertTrue(any(d.get("channel_id") == ch["id"] for d in kj_sees))

    def test_requires_sign_in(self):
        self.assertEqual(self.stream(token=None)[0], 401)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class LiveServerTests(unittest.TestCase):
    """The real server: a stream stays open while other requests run, and data survives a restart."""

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

    def http(self, port, method, path, body=None, token=None):
        req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Content-Type": "application/json",
                                              **({"Authorization": f"Bearer {token}"} if token else {})})
        with urllib.request.urlopen(req, timeout=10) as res:
            return res.status, json.loads(res.read() or b"null")

    def test_stream_delivers_while_other_requests_run_and_data_persists(self):
        with tempfile.TemporaryDirectory() as tmp:
            db, port = os.path.join(tmp, "journal_os.db"), _free_port()
            proc = self.start(db, port)
            try:
                _, s = self.http(port, "POST", "/api/os/session", {"handle": "kj"})
                token, ws = s["token"], s["workspaces"][0]["id"]
                _, boot = self.http(port, "POST", f"/api/os/w/{ws}/harness/bootstrap", {}, token)
                general = boot["channel"]["id"]

                lines: list[str] = []
                req = urllib.request.Request(f"http://127.0.0.1:{port}/api/os/w/{ws}/stream",
                                             headers={"Authorization": f"Bearer {token}"})

                def read_stream():
                    with urllib.request.urlopen(req, timeout=15) as res:
                        deadline = time.time() + 12
                        while time.time() < deadline:
                            line = res.readline().decode()
                            if not line:
                                return
                            lines.append(line)
                            if '"type": "approval"' in line:
                                return

                reader = threading.Thread(target=read_stream, daemon=True)
                reader.start()
                for _ in range(100):  # wait for the stream's first batch
                    if any(line.startswith("retry:") for line in lines):
                        break
                    time.sleep(0.05)
                self.assertTrue(lines, "stream did not open")

                # While the stream is open, other requests (including a legacy route) still answer.
                started = time.time()
                status, res = self.http(port, "POST", f"/api/os/channels/{general}/messages",
                                        {"content": SCHEDULE, "now": NOW}, token)
                self.assertEqual(status, 201)
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/style.css", timeout=5) as legacy:
                    self.assertEqual(legacy.status, 200)
                self.assertLess(time.time() - started, 5)
                reader.join(timeout=8)
                stream_text = "".join(lines)
                self.assertIn('"type": "message"', stream_text)
                self.assertIn('"type": "approval"', stream_text)

                approval_id = res["replies"][0]["approvals"][0]["id"]
                self.assertEqual(self.http(port, "POST", f"/api/os/approvals/{approval_id}/approve", {}, token)[0], 200)
            finally:
                proc.terminate()
                proc.wait(5)

            proc = self.start(db, port)  # restart on the same file
            try:
                _, msgs = self.http(port, "GET", f"/api/os/channels/{general}/messages", None, token)
                self.assertEqual([m["author_type"] for m in msgs], ["human", "agent"])
                self.assertEqual(msgs[1]["approvals"][0]["status"], "approved")
                _, events = self.http(port, "GET", f"/api/os/w/{ws}/events", None, token)
                self.assertEqual([e["title"] for e in events], ["Robotics build session"])
            finally:
                proc.terminate()
                proc.wait(5)


if __name__ == "__main__":
    unittest.main()
