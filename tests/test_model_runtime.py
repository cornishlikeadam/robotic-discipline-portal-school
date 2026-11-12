"""The OpenAI-compatible model driver (journal_os/harness.py, ModelRuntime).

A fake provider on a local port plays the model: it records each request and
answers with whatever the test scripts. The tests check that a tool call only
ever becomes a pending approval card, that plain replies post as text, that a
timeout, HTTP error, bad JSON or invalid tool call falls back to the stand-in
and says so, and that the API key never leaves the server.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from journal_os import harness
from journal_os.harness import ModelConfig
from journal_os.server import JournalOSApp

NOW = "2026-11-12T09:00"
KEY = "sk-test-SECRET-7f3a9c1e5b"
SCHEDULE = "@patch schedule a robotics build session tomorrow at 11 for 90 minutes"
LLM_VARS = ("JOURNAL_OS_LLM_BASE_URL", "JOURNAL_OS_LLM_API_KEY", "JOURNAL_OS_LLM_MODEL", "JOURNAL_OS_LLM_TIMEOUT",
            "JOURNAL_OS_LLM_ALLOWED_MODELS", "JOURNAL_OS_LLM_AUTOMATIONS")


def completion(content=None, tool_calls=None, model="acme/llama-free"):
    message = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = [{"id": f"call_{i}", "type": "function",
                                  "function": {"name": name, "arguments": args if isinstance(args, str) else json.dumps(args)}}
                                 for i, (name, args) in enumerate(tool_calls)]
    return {"id": "cmpl-1", "object": "chat.completion", "model": model,
            "choices": [{"index": 0, "message": message, "finish_reason": "tool_calls" if tool_calls else "stop"}]}


class FakeProvider:
    """A tiny OpenAI-compatible /chat/completions server with scripted answers."""

    def __init__(self) -> None:
        self.requests = []
        self.responses = []
        provider = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802 - http.server API
                body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                provider.requests.append({"path": self.path, "headers": dict(self.headers), "json": json.loads(body)})
                spec = provider.responses.pop(0) if provider.responses else {"json": completion("Hello.")}
                time.sleep(spec.get("delay", 0))
                raw = spec["raw"] if "raw" in spec else json.dumps(spec["json"]).encode()
                try:
                    self.send_response(spec.get("status", 200))
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(raw)))
                    self.end_headers()
                    self.wfile.write(raw)
                except (BrokenPipeError, ConnectionResetError):
                    pass  # the client gave up (timeout test)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}/v1"

    def reply(self, **spec) -> None:
        self.responses.append(spec)

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


class ModelBase(unittest.TestCase):
    env_extra: dict = {}

    def setUp(self) -> None:
        self.provider = FakeProvider()
        self.addCleanup(self.provider.close)
        env = {k: v for k, v in os.environ.items() if k not in LLM_VARS}
        env.update({"JOURNAL_OS_LLM_BASE_URL": self.provider.base_url, "JOURNAL_OS_LLM_API_KEY": KEY,
                    "JOURNAL_OS_LLM_MODEL": "test-model", "JOURNAL_OS_QUIET": "1",
                    "no_proxy": "127.0.0.1,localhost", "NO_PROXY": "127.0.0.1,localhost", **self.env_extra})
        patcher = mock.patch.dict(os.environ, env, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.app = JournalOSApp(db_path=":memory:")
        self.addCleanup(self.app.close)
        data = json.loads(self.app.handle("POST", "/api/os/session", json.dumps({"handle": "kj"}))[2])
        self.token, self.ws = data["token"], data["workspaces"][0]["id"]
        boot = self.call("POST", f"/api/os/w/{self.ws}/harness/bootstrap", {"now": "2026-11-12T07:00"})[1]
        self.general, self.patch = boot["channel"]["id"], boot["agent"]
        self.assertEqual(self.provider.requests, [], "setting up must not call the model")

    def call(self, method, path, body=None):
        status, _, text = self.app.handle(method, path, json.dumps(body) if body is not None else None,
                                          {"Authorization": f"Bearer {self.token}"})
        return status, json.loads(text)

    def raw(self, method, path, body=None) -> str:
        return self.app.handle(method, path, json.dumps(body) if body is not None else None,
                               {"Authorization": f"Bearer {self.token}"})[2]

    def say(self, content, channel=None, **extra):
        status, out = self.call("POST", f"/api/os/channels/{channel or self.general}/messages",
                                {"content": content, "now": NOW, **extra})
        self.assertEqual(status, 201, out)
        self.assertEqual(len(out["replies"]), 1, out)
        return out["replies"][0]

    def events(self):
        return self.call("GET", f"/api/os/w/{self.ws}/events")[1]

    def pending(self):
        return self.call("GET", f"/api/os/w/{self.ws}/approvals")[1]


class ToolCallTests(ModelBase):
    def test_tool_call_becomes_a_pending_card_and_saves_nothing(self):
        before = len(self.events())
        self.provider.reply(json=completion("I'll send that for your approval.", [
            ("create_event", {"title": "Robotics build session", "start_at": "2026-11-13 11:00:00",
                              "duration_minutes": "90", "calendar": "personal", "notes": None})]))
        reply = self.say(SCHEDULE)
        self.assertEqual(reply["content"], "I'll send that for your approval.")
        self.assertEqual(reply["runtime"], "acme/llama-free")  # the model the provider says it used
        self.assertEqual(reply["approval_status"], "pending")
        [call] = reply["tool_calls"]
        self.assertEqual(call["tool"], "create_event")
        # Tidied: time normalised, duration an integer, unknown and null fields dropped.
        self.assertEqual(call["input"], {"title": "Robotics build session", "start_at": "2026-11-13T11:00",
                                         "duration_minutes": 90})
        self.assertEqual(len(self.events()), before, "nothing is saved before approval")
        self.assertEqual(len(self.pending()), 1)
        status, decided = self.call("POST", f"/api/os/approvals/{call['approval_id']}/approve", {})
        self.assertEqual((status, decided["status"]), (200, "approved"), decided)
        self.assertEqual(len(self.events()), before + 1)

    def test_request_carries_instructions_memory_history_tools_and_key(self):
        _, ch = self.call("POST", f"/api/os/w/{self.ws}/channels",
                          {"name": "build-log", "type": "public", "instructions": "Answer in one sentence.",
                           "agent_ids": [self.patch["id"]]})
        self.call("POST", f"/api/os/agents/{self.patch['id']}", {"system_prompt": "Speak like a workshop foreman."})
        self.provider.reply(json=completion("First."))
        self.say("@patch hello", channel=ch["id"])
        self.provider.reply(json=completion("Second."))
        self.say("@patch what did I just say?", channel=ch["id"])
        req = self.provider.requests[-1]
        self.assertEqual(req["path"], "/v1/chat/completions")
        self.assertEqual(req["headers"]["Authorization"], f"Bearer {KEY}")
        body = req["json"]
        self.assertEqual(body["model"], "test-model")
        system = body["messages"][0]["content"]
        for expected in ("Answer in one sentence.", "Speak like a workshop foreman.", "# PATCH — memory",
                         "It is now 2026-11-12T09:00 (Thursday)", f"#general: {self.general}"):
            self.assertIn(expected, system)
        self.assertEqual([m["role"] for m in body["messages"][1:]], ["user", "assistant", "user"])
        self.assertIn("hello", body["messages"][1]["content"])
        self.assertEqual(body["messages"][2]["content"], "First.")
        self.assertIn("what did I just say?", body["messages"][-1]["content"])
        tools = {t["function"]["name"] for t in body["tools"]}
        self.assertEqual(tools, {"create_event", "update_event", "delete_event", "create_journal_entry",
                                 "propose_memory", "post_message"})  # no companion_calendar grant

    def test_barnacle_page_context_reaches_the_model(self):
        _, entry = self.call("POST", f"/api/os/w/{self.ws}/journal",
                             {"title": "Gearbox notes", "body": "The second stage slips under load."})
        _, dm = self.call("POST", f"/api/os/w/{self.ws}/dms", {"member_id": self.patch["id"], "member_type": "agent"})
        self.provider.reply(json=completion("It slips under load."))
        self.say("summarise this", channel=dm["id"],
                 context={"view": "journal", "kind": "journal_entry", "id": entry["id"], "selection": "second stage"})
        system = self.provider.requests[-1]["json"]["messages"][0]["content"]
        self.assertIn("Journal entry “Gearbox notes”", system)
        self.assertIn("The second stage slips under load.", system)
        self.assertIn("Selected text: “second stage”", system)

    def test_memory_tool_targets_the_agents_own_ledger(self):
        self.provider.reply(json=completion(None, [("propose_memory", {"content": "Prefers short check-ins",
                                                                         "companion_id": "cmp-someone-else"})]))
        reply = self.say("@patch remember I prefer short check-ins")
        self.assertTrue(reply["content"].startswith(harness.LEAD_IN["propose_memory"]))
        self.assertEqual(reply["tool_calls"][0]["input"]["companion_id"], self.patch["companion_id"])
        self.assertEqual(reply["approval_status"], "pending")


class PlainReplyTests(ModelBase):
    def test_plain_reply_posts_text_without_a_card(self):
        self.provider.reply(json=completion("<think>They want a pep talk.</think>You've got this. Start small."))
        reply = self.say("@patch I'm stuck on the gearbox")
        self.assertEqual(reply["content"], "You've got this. Start small.")
        self.assertEqual((reply["tool_calls"], reply["approval_status"]), ([], "none"))
        self.assertEqual(self.pending(), [])

    def test_agents_show_the_model_instead_of_the_stand_in(self):
        _, agents = self.call("GET", f"/api/os/w/{self.ws}/agents")
        self.assertEqual(agents[0]["runtime"], {"kind": "model", "model": "test-model", "provider": "127.0.0.1"})
        _, agent = self.call("POST", f"/api/os/agents/{self.patch['id']}", {"model": "stand-in"})
        self.assertEqual(agent["runtime"]["kind"], "stand-in")
        reply = self.say(SCHEDULE)
        self.assertEqual(reply["runtime"], "stand-in")
        self.assertEqual(self.provider.requests, [], "an agent set to stand-in never calls the model")

    def test_agent_model_override_needs_the_allowlist(self):
        _, agent = self.call("POST", f"/api/os/agents/{self.patch['id']}", {"model": "pricey/model-x"})
        self.assertEqual(agent["runtime"]["model"], "test-model")
        with mock.patch.dict(os.environ, {"JOURNAL_OS_LLM_ALLOWED_MODELS": "cheap/a, pricey/model-x"}):
            _, agent = self.call("GET", f"/api/os/agents/{self.patch['id']}")
            self.assertEqual(agent["runtime"]["model"], "pricey/model-x")
            self.say("@patch hi")
            self.assertEqual(self.provider.requests[-1]["json"]["model"], "pricey/model-x")


class FallbackTests(ModelBase):
    env_extra = {"JOURNAL_OS_LLM_TIMEOUT": "0.5"}

    def assert_stand_in_fallback(self, reply, reason):
        self.assertTrue(reply["content"].startswith("(test-model couldn't answer:"), reply["content"])
        self.assertIn(reason, reply["content"])
        self.assertIn("The rule-based stand-in answered instead.", reply["content"])
        self.assertEqual(reply["runtime"], "stand-in")
        # The stand-in understood the request, so its card is the only one, and it is pending.
        self.assertEqual([c["tool"] for c in reply["tool_calls"]], ["create_event"])
        self.assertEqual(reply["approval_status"], "pending")

    def test_timeout_falls_back_quickly(self):
        self.provider.reply(json=completion("too late"), delay=3)
        started = time.monotonic()
        reply = self.say(SCHEDULE)
        self.assertLess(time.monotonic() - started, 2.0)
        self.assert_stand_in_fallback(reply, "it took longer than 0.5 seconds")

    def test_http_errors_fall_back(self):
        for status, reason in ((429, "daily free quota is used up (HTTP 429)"), (500, "server error (HTTP 500)"),
                               (404, "doesn't offer the model “test-model” (HTTP 404)")):
            self.provider.reply(status=status, json={"error": {"message": "nope"}})
            self.assert_stand_in_fallback(self.say(SCHEDULE), reason)

    def test_bad_json_falls_back(self):
        self.provider.reply(raw=b"<html>Bad gateway</html>")
        self.assert_stand_in_fallback(self.say(SCHEDULE), "its response wasn't valid JSON")
        self.provider.reply(json={"choices": []})
        self.assert_stand_in_fallback(self.say(SCHEDULE), "its response had no reply in it")

    def test_invalid_tool_calls_fall_back_and_write_nothing_of_theirs(self):
        cases = [
            (("drop_database", {}), "a tool it doesn't have (drop_database)"),
            (("create_event", "{not json"), "its create_event request wasn't valid JSON"),
            (("create_event", {"title": "Build"}), "its create_event request left out start_at"),
            (("create_event", {"title": "Build", "start_at": "tomorrow-ish"}), "an unreadable time"),
            (("create_event", {"title": "Build", "start_at": "2026-11-13T11:00", "kind": "party"}), "an invalid kind"),
            (("delete_event", {"event_id": "evt-not-here"}), "the harness refused what it asked for"),
        ]
        for call, reason in cases:
            with self.subTest(reason=reason):
                self.provider.reply(json=completion("Done!", [call]))
                reply = self.say(SCHEDULE)
                self.assert_stand_in_fallback(reply, reason)
        self.assertEqual({p["tool_name"] for p in self.pending()}, {"create_event"})
        self.assertEqual(len(self.pending()), len(cases), "only the stand-in's own cards exist")

    def test_unknown_request_fallback_explains_the_stand_in(self):
        self.provider.reply(status=503, json={})
        reply = self.say("@patch what's the meaning of life?")
        self.assertIn("The rule-based stand-in only understands planner, journal and memory requests.", reply["content"])
        self.assertEqual(reply["tool_calls"], [])


class SecretTests(ModelBase):
    def test_key_never_appears_in_responses_or_logs(self):
        self.provider.reply(status=401, json={"error": {"message": f"Incorrect API key provided: {KEY}"}})
        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {"JOURNAL_OS_QUIET": ""}), contextlib.redirect_stderr(stderr):
            reply = self.say(SCHEDULE)
        self.assertIn("the provider refused the API key (HTTP 401)", reply["content"])
        self.assertIn("[redacted]", stderr.getvalue())
        self.assertNotIn(KEY, stderr.getvalue())
        bodies = [json.dumps(reply),
                  self.raw("GET", f"/api/os/channels/{self.general}/messages"),
                  self.raw("GET", f"/api/os/w/{self.ws}/agents"),
                  self.raw("GET", f"/api/os/agents/{self.patch['id']}"),
                  self.raw("POST", f"/api/os/w/{self.ws}/harness/bootstrap", {"now": NOW}),
                  self.raw("GET", f"/api/os/w/{self.ws}/approvals?status=all"),
                  self.raw("GET", f"/api/os/w/{self.ws}/stream")]
        for body in bodies:
            self.assertNotIn(KEY, body)
            self.assertNotIn(KEY[-10:], body)
        self.assertNotIn(KEY, repr(ModelConfig.from_env()))


class ConcurrencyTests(ModelBase):
    env_extra = {"JOURNAL_OS_LLM_TIMEOUT": "5"}

    def test_other_requests_run_while_the_model_thinks(self):
        self.provider.reply(json=completion("Thought about it."), delay=1.5)
        out = {}
        worker = threading.Thread(target=lambda: out.update(reply=self.say("@patch think hard")))
        worker.start()
        while not self.provider.requests:  # wait until the model call is in flight
            time.sleep(0.02)
        started = time.monotonic()
        status, _ = self.call("GET", f"/api/os/w/{self.ws}/agents")
        self.assertEqual(status, 200)
        self.assertLess(time.monotonic() - started, 0.5, "the database lock is released during the model call")
        worker.join(5)
        self.assertEqual(out["reply"]["content"], "Thought about it.")


class AutomationTests(ModelBase):
    def automation(self, kind):
        _, autos = self.call("GET", f"/api/os/w/{self.ws}/automations?now={NOW}")
        return next(a for a in autos if a["kind"] == kind)

    def setUp(self) -> None:
        super().setUp()
        self.call("POST", f"/api/os/w/{self.ws}/events",
                  {"title": "Robotics build session", "start_at": "2026-11-12T11:00", "duration_minutes": 90})

    def run_now(self, kind):
        status, out = self.call("POST", f"/api/os/automations/{self.automation(kind)['id']}/run", {"now": NOW})
        self.assertEqual(status, 200, out)
        return out["message"]

    def test_model_words_the_morning_brief(self):
        self.provider.reply(json=completion("Morning! One thing today:\n• 11:00 Robotics build session (90 min)"))
        msg = self.run_now("morning_brief")
        self.assertEqual(msg["content"], "☀️ Morning brief · Thursday, Nov 12\n\nMorning! One thing today:\n"
                                         "• 11:00 Robotics build session (90 min)")
        self.assertEqual(msg["runtime"], "acme/llama-free")
        req = self.provider.requests[-1]["json"]
        self.assertNotIn("tools", req)
        self.assertIn("11:00 Robotics build session", req["messages"][1]["content"])

    def test_rewrite_that_drops_a_time_keeps_the_template(self):
        self.provider.reply(json=completion("Morning! You have a build session today."))
        msg = self.run_now("morning_brief")
        self.assertIn("• 11:00 Robotics build session (90 min)", msg["content"])
        self.assertEqual(msg["runtime"], "stand-in")

    def test_failure_keeps_the_template_and_evening_prompt_is_never_reworded(self):
        self.provider.reply(status=429, json={})
        brief = self.run_now("morning_brief")
        self.assertIn("Today you have 1 thing on the planner:", brief["content"])
        calls = len(self.provider.requests)
        evening = self.run_now("evening_prompt")
        self.assertEqual(len(self.provider.requests), calls)
        self.assertEqual((evening["runtime"], evening["approval_status"]), ("stand-in", "pending"))

    def test_automations_off_switch(self):
        with mock.patch.dict(os.environ, {"JOURNAL_OS_LLM_AUTOMATIONS": "off"}):
            self.run_now("weekly_review")
        self.assertEqual(self.provider.requests, [])


class ConfigTests(unittest.TestCase):
    def test_settings(self):
        self.assertIsNone(ModelConfig.from_env({}))
        only_key = ModelConfig.from_env({"JOURNAL_OS_LLM_API_KEY": "k"})
        self.assertEqual((only_key.base_url, only_key.model, only_key.timeout),
                         ("https://openrouter.ai/api/v1", "openrouter/free", 20.0))
        ollama = {"JOURNAL_OS_LLM_BASE_URL": "http://localhost:11434/v1/"}
        self.assertIsNone(ModelConfig.from_env(ollama), "a custom base URL needs a model")
        local = ModelConfig.from_env({**ollama, "JOURNAL_OS_LLM_MODEL": "qwen3:8b"})
        self.assertEqual((local.base_url, local.model, local.api_key), ("http://localhost:11434/v1", "qwen3:8b", ""))
        self.assertIsNone(ModelConfig.from_env({"JOURNAL_OS_LLM_API_KEY": "k", "JOURNAL_OS_LLM_MODEL": "none"}))
        self.assertIsNone(ModelConfig.from_env({"JOURNAL_OS_LLM_API_KEY": "k", "JOURNAL_OS_LLM_MODEL": "m",
                                                "JOURNAL_OS_LLM_BASE_URL": "http://example.com/v1"}),
                          "a key is never sent over plain HTTP to another machine")
        self.assertEqual(ModelConfig.from_env({"JOURNAL_OS_LLM_API_KEY": "k", "JOURNAL_OS_LLM_TIMEOUT": "999"}).timeout, 60.0)

    def test_tool_specs_cover_exactly_the_agent_tools(self):
        self.assertEqual(set(harness.TOOL_SPECS), set(harness.AGENT_TOOLS))


if __name__ == "__main__":
    unittest.main()
