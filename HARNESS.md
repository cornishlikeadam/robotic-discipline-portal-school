# Channels: the agent harness inside Journal OS

Channels is a Slack-style space inside Journal OS: channels, direct messages and threads, where you and your agents talk. An agent can reply freely, but every change it asks for (a planner event, a journal entry, a memory, a post in another channel) arrives as an **approval card**. The change runs only when someone with the right role presses **Approve**.

No AI model is connected yet. Agents answer with a **rule-based stand-in** that understands the same requests as the command bar. That is enough to exercise the whole loop end to end: message → agent reply → approval card → decision → saved data.

The data layer underneath (tables, store methods, the approval gate) is described in [JOURNAL_OS.md → Agent harness](JOURNAL_OS.md#agent-harness-foundation).

## Try it

```bash
python3 -m journal_os.server
```

1. Open http://127.0.0.1:8090/os/#channels and sign in.
2. Click **Create #general with PATCH**.
3. Send `@patch schedule a robotics build session tomorrow at 11 for 90 minutes`. As you type `@pa`, a list of agents in the channel appears; press Enter to pick one.
4. PATCH replies with an approval card marked **Waiting for approval · nothing saved yet**. An amber banner and a count next to the channel name show that something is waiting.
5. Press **Approve & run**. The card turns green, and **Show in planner** opens the new event. **Reject** leaves everything unchanged.

Open the same page in a second tab: messages and decisions appear there without a reload.

## What works

| Feature | Notes |
|---|---|
| Channels: public, private, agent room | Private channels are invisible to non-members everywhere, including the live feed. |
| Direct messages with an agent | Click an agent in the sidebar. In a DM the agent answers every message; no @mention is needed. |
| Threads | One level deep, like Slack. **Reply in thread** opens a side panel. Agents reply where they were asked: in the channel or in the thread. |
| Agent members | Shown in the channel header and the members dialog. Add an agent as a *member* (it replies and can ask for changes) or an *observer* (it reads only). |
| @mentions | An autocomplete list of the channel's active agents; mentions are highlighted in messages. |
| Approval cards | Pending, approved, rejected and failed states. Each card shows the request's fields and, once approved, a link to the result. |
| Live updates | A Server-Sent Events stream (see below), with an indicator in the view header. |
| Persistence | Messages, approvals and their linked proposals are in SQLite and survive a restart. |
| Creating agents | Owners can add agents: name, job, which memory ledger they use, and which kinds of change they may ask for. |

## How a message flows

1. You post. `POST /api/os/channels/{id}/messages` stores the message with the agents it mentions.
2. `journal_os/harness.py` (`respond_to`) wakes each mentioned agent, or the agent in a DM. Messages from agents never wake other agents, so the stand-in cannot loop.
3. The stand-in strips the @mention and reads the rest with the command bar's interpreter.
   - If it recognises a request, it replies with one tool call, which becomes a **pending** approval.
   - Otherwise it replies with plain text and a few example requests.
4. The approval card waits. Nothing has been written to the planner, journal or memory ledger.
5. `POST /api/os/approvals/{id}/approve` runs the tool through the same validator and executor as typed commands (`ActionService.decide_tool_call`). `…/reject` records the decision and changes nothing.
6. Each write lands in the audit log. Open streams pick it up and every tab refreshes the affected channel.

If an agent isn't allowed to ask for something (for example it has no planner grant), it says so in plain text instead of raising a card.

## Endpoints

All need `Authorization: Bearer <token>` from `POST /api/os/session`.

| Method and path | Who | What |
|---|---|---|
| `GET /api/os/w/{ws}/channels` | viewer | Channels you can see (`?archived=1` includes archived ones). |
| `POST /api/os/w/{ws}/channels` | editor | Create a channel: `{name, type, description, instructions, agent_ids}`. `type` is `public`, `private` or `agent-room`. |
| `POST /api/os/w/{ws}/dms` | editor | Open (or reuse) a DM: `{member_id, member_type}`. |
| `GET /api/os/channels/{id}` | viewer | One channel with its members. |
| `POST /api/os/channels/{id}/members` | editor | Add a member: `{member_id, member_type, role}`. Making someone an owner needs the channel or workspace owner. |
| `DELETE /api/os/channels/{id}/members` | editor | Remove `{member_id}`. Removing someone other than yourself needs the channel or workspace owner. |
| `POST /api/os/channels/{id}/archive` | channel or workspace owner | Archive the channel. |
| `GET /api/os/channels/{id}/messages` | viewer | Top-level messages, oldest first (`?limit=`, up to 500), or one thread with `?thread={root_id}`. Messages with tool calls include their `approvals`. |
| `POST /api/os/channels/{id}/messages` | editor | Post `{content, thread_id?, now?, context?}`. Returns `{message, replies}`, where `replies` are the agents' answers. `context` is `{view, kind: "journal_entry" or "event", id, selection}`; the server looks the title up itself, refuses items from other workspaces, and stores the result on the message. Barnacle sends it. |
| `GET /api/os/messages/{id}` | viewer | One message. |
| `GET /api/os/w/{ws}/agents` | viewer | Agents in the workspace. |
| `POST /api/os/w/{ws}/agents` | owner | Create an agent: `{name, handle?, role, system_prompt, model, companion_id, resources}`. |
| `GET` / `POST /api/os/agents/{id}` | viewer / owner | Read or update an agent. |
| `GET /api/os/agents/{id}/memory` | viewer | The agent's `MEMORY.md`, rebuilt from approved memories. |
| `POST /api/os/w/{ws}/harness/bootstrap` | owner | Create `#general`, the PATCH agent, its DM and the three default automations. Safe to call again. Send `{now}` (local time) so automations whose time has passed today don't post. |
| `GET /api/os/w/{ws}/approvals` | viewer | Pending approvals in channels you can see (`?status=approved`, `rejected`, `failed` or `all`). |
| `GET /api/os/approvals/{id}` | viewer | One approval. |
| `POST /api/os/approvals/{id}/approve` | workspace owner or the agent's owner | Run it. An optional `{input: {...}}` edits values but can't switch the target event or companion. |
| `POST /api/os/approvals/{id}/reject` | workspace owner or the agent's owner | Reject it. |
| `GET /api/os/w/{ws}/stream?after={cursor}` | viewer | The live feed (below). |
| `GET /api/os/w/{ws}/automations?now=` | viewer | The workspace's automations with `next_run`, `where` and the last run. |
| `POST /api/os/w/{ws}/automations/tick` | viewer | `{now}`. Runs the caller's own automations that are due and haven't run this day or week. Returns what ran. |
| `POST /api/os/automations/{id}` | owner | Change `{enabled, time_of_day, weekday}`. |
| `POST /api/os/automations/{id}/run` | owner | `{now}`. Post it now; this counts as this period's run. |

`POST /api/os/actions/{id}/approve` (the command bar's route) refuses agent proposals with 403. They can only be decided from their card, so the card and the proposal never disagree.

## Barnacle

The floating companion described in [JOURNAL_OS.md](JOURNAL_OS.md#barnacle-the-floating-companion) is a DM with an agent in this system. It shares the tab's single live stream with the Channels view (`LiveFeed` in `os/harness.js`), which runs only while one of them is open.

## Live updates (Server-Sent Events)

`GET /api/os/w/{ws}/stream?after={cursor}` returns `text/event-stream`:

```
retry: 1000

id: 42
event: change
data: {"id": 42, "type": "approval", "channel_id": "chn-…", "message_id": "msg-…", "approval_id": "apv-…", "status": "approved"}

id: 42
event: cursor
data: {"cursor": 42}
```

- `type` is `message`, `approval`, `channel`, `agent` or `automation`. The client refetches what changed; events carry ids, not content.
- Every batch ends with a `cursor` event. Without `after`, the stream starts from now.
- The feed reads the existing `audit_log`, which already records every write in order, so no new table was needed. Rows from channels you can't see are skipped.
- **Local server:** each stream stays open for 25 seconds. It checks for changes every half second, sends a keepalive comment every 15 seconds, and the browser reconnects after 1 second.
- **Hosts that answer each request with a single response (Vercel):** the endpoint returns one batch with `retry: 3000`, so the browser effectively polls every 3 seconds. The header says "Live · checks every 3s".
- The browser reads the stream with `fetch` rather than `EventSource`. That keeps the session token in the `Authorization` header instead of the URL, where it would end up in server logs.

To support this, the local server now handles each request on its own thread, so an open stream doesn't block anything else. Journal OS requests take turns on one SQLite connection behind a lock. The older Portal School apps keep connections that only work on the thread that opened them, so all their requests run on one dedicated worker thread.

## Tests

- **`tests/test_harness_routes.py`** (19 tests):
  - creating and listing channels, roles, outsiders, members and DMs;
  - mentions get a pending card while nothing is saved, unaddressed messages get no reply, unknown requests get help text, thread replies stay in the thread, DM agents answer without a mention, memory requests target the agent's own ledger, and an agent without a grant explains itself;
  - approve runs once, reject changes nothing, edits apply, only the owner decides, viewers can't post, and the command bar can't approve agent proposals;
  - the stream's cursor and changes, private channels in the stream, and the stream requiring sign-in;
  - a real server process whose stream delivers while other requests (including a legacy route) still answer, with messages and decisions intact after a restart.
- **`tests/test_automations.py`** (18 tests): scheduling, content, the evening draft's approval, permissions and the local ticker. See [JOURNAL_OS.md → Automations](JOURNAL_OS.md#automations).
- **`scripts/automations_demo.py`**: moves the browser's clock to 8:05 and 20:05 and checks the brief, the evening draft in Barnacle, Run now and turning one off (10/10 checks).
- **`scripts/harness_demo.py`**: a two-tab browser run in headless Chromium.
  - It covers @mention autocomplete, the pending card, the second tab updating live, approving there, the planner link, rejecting a card in a thread, the members dialog, a server restart, phone width and page errors.
  - It passed 14/14 checks on 2026-11-12.

```bash
python3 -m unittest discover -s tests
python3 scripts/harness_demo.py --out demo-output/harness
```

## Known limitations

1. **Agents are stand-ins.** They understand only the command bar's planner, journal and memory requests. Channel instructions, agent instructions and `model` are stored but unused until a model runtime exists.
2. **Agents reply inside the request.** The stand-in answers instantly, so it runs synchronously. A real model will need a background run queue so slow replies don't hold the request open.
3. **Vercel is a demo only.** Each serverless instance has its own temporary database, so live updates there are 3-second polling and only see changes on the same instance. Use the local server for anything real.
4. **Cards can't be edited in the UI yet.** The approve endpoint accepts edited `input`, but the card only offers Approve and Reject.
5. **Missing messaging basics.** There is no editing or deleting messages, no reactions, uploads or search, and @mentions list agents only, not people.
6. **Unread dots are kept per tab.** They live in the open tab only and reset when it reloads.
