# Channels: the agent harness inside Journal OS

Channels is a Slack-style space inside Journal OS: channels, direct messages and threads, where you and your agents talk. An agent can reply freely, but every change it asks for (a planner event, a journal entry, a memory, a post in another channel) arrives as an **approval card**. The change runs only when someone with the right role presses **Approve**.

Agents answer with **any OpenAI-compatible model** you point the server at: OpenRouter's free router by default, or OpenCode Zen, Groq, Gemini, a local Ollama or Claude (see [Connect a model](#connect-a-model)). With no model configured, or whenever a model call fails, a **rule-based stand-in** answers instead. It understands the same requests as the command bar, which is enough to exercise the whole loop end to end: message → agent reply → approval card → decision → saved data.

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

## Connect a model

One driver (`ModelRuntime` in `journal_os/harness.py`) speaks the OpenAI chat-completions API, so switching provider means changing settings, not code. It uses only the standard library (`urllib`).

| Variable | What | Default |
|---|---|---|
| `JOURNAL_OS_LLM_API_KEY` | The provider's API key. Stays on the server: it is sent only to the provider and never appears in replies, agent records, errors or logs. | none |
| `JOURNAL_OS_LLM_BASE_URL` | The provider's OpenAI-compatible base URL (the part before `/chat/completions`). | `https://openrouter.ai/api/v1` |
| `JOURNAL_OS_LLM_MODEL` | The model id. `none` or `off` switches the model off. | `openrouter/free` when the base URL is OpenRouter's; required otherwise |
| `JOURNAL_OS_LLM_TIMEOUT` (optional) | Seconds before giving up on one model call. | `20` |
| `JOURNAL_OS_LLM_ALLOWED_MODELS` (optional) | Comma-separated model ids that an agent's own `model` field may pick. | empty: every agent uses `JOURNAL_OS_LLM_MODEL` |
| `JOURNAL_OS_LLM_AUTOMATIONS` (optional) | `off` keeps the morning brief and weekly review in their template wording. | on |

A model is used when the API key or the base URL is set. Setting only the key gives you OpenRouter's free router.

### Providers

| Provider | `JOURNAL_OS_LLM_BASE_URL` | `JOURNAL_OS_LLM_MODEL` | Key from |
|---|---|---|---|
| **OpenRouter, free router (default)** | *(leave unset)* | *(leave unset)* → `openrouter/free` | openrouter.ai → Keys |
| OpenCode Zen | `https://opencode.ai/zen/v1` | a model id from `https://opencode.ai/zen/v1/models`. The free ones change often; several end in `-free`. Claude and GPT models on Zen use other endpoints, so pick one served on chat completions. | opencode.ai → Zen |
| Groq | `https://api.groq.com/openai/v1` | a tool-calling model from Groq's model list, e.g. `llama-3.3-70b-versatile` | console.groq.com → API Keys |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | e.g. `gemini-2.5-flash` | aistudio.google.com → API key |
| Ollama (on your machine) | `http://localhost:11434/v1` | a pulled model that supports tools, e.g. `qwen3:8b` | none needed |
| Claude (paid) | `https://api.anthropic.com/v1` | e.g. `claude-haiku-5-5` or `claude-sonnet-5-5` | console.anthropic.com → API Keys |

Free tiers have daily limits, and free models call tools less reliably than Claude. Both are fine here: a refused or garbled call falls back to the stand-in, and the approval gate stops anything a weak model gets wrong. OpenRouter's free router picks a free model per request, filtered for tool support; the chat shows which model answered.

### Run it locally

```bash
export JOURNAL_OS_LLM_API_KEY=sk-or-...   # OpenRouter key; the defaults do the rest
python3 -m journal_os.server
```

For Ollama, set `JOURNAL_OS_LLM_BASE_URL=http://localhost:11434/v1` and `JOURNAL_OS_LLM_MODEL=qwen3:8b` instead, with no key. Unset the variables before running the test suite; the tests start their own fake provider.

### Set it up on Vercel

1. Open the project on vercel.com → **Settings → Environment Variables**.
2. Add `JOURNAL_OS_LLM_API_KEY` with your key. Tick **Production** (and Preview if you use it), and mark it **Sensitive** so it can't be read back from the dashboard.
3. For a provider other than OpenRouter, also add `JOURNAL_OS_LLM_BASE_URL` and `JOURNAL_OS_LLM_MODEL` from the table above. Ollama on your laptop can't be reached from Vercel.
4. Redeploy (**Deployments → ⋯ → Redeploy**). Environment variables only reach new deployments.
5. Open `/os/#channels`. The sidebar note and each agent show the model's name instead of "stand-in", and every model reply carries a chip with the model that wrote it.

Each Vercel request is a single serverless run, so the model call happens inside the request that posted your message and gives up after `JOURNAL_OS_LLM_TIMEOUT` seconds (20 by default). `vercel.json` raises the function's time limit to 30 seconds so the timeout, not Vercel, ends a slow call, and the stand-in still answers. On a plan whose limit is lower, set `JOURNAL_OS_LLM_TIMEOUT` below it.

### What the model gets, and what it can do

- **Context:** the agent's name, job and `system_prompt`; the channel's `instructions`; the agent's `MEMORY.md` from `render_agent_memory` (approved memories only); the planner for yesterday through the next two weeks, with event ids; the last 12 messages of the channel or thread, including how earlier approval cards were decided; and Barnacle's page context (the open journal entry's text or the event's notes, plus any selected text). Workspace data is marked as data, not instructions.
- **Tools:** the tools in `AGENT_TOOLS` that the agent has a grant for, as function definitions. `propose_memory` appears only for an agent with a memory ledger, `post_message` only when there is another channel it can post in.
- **Tool calls never run.** Each one is tidied (times normalised, unknown fields dropped, types checked) and passed to `post_agent_message`, which applies the same whitelist and permission checks as before and records a **pending** approval. Nothing reaches the planner, journal or memory ledger until someone presses Approve.
- **Plain text** posts as the agent's reply. `<think>` blocks some free models emit are removed.

### When the model fails

The stand-in answers instead, and the reply starts with a note saying why, for example *"(openrouter/free couldn't answer: the provider's rate limit or daily free quota is used up (HTTP 429). The rule-based stand-in answered instead.)"*. That happens on:

- a timeout (`JOURNAL_OS_LLM_TIMEOUT` is one deadline for the whole call);
- an HTTP error (401/403 bad key, 402 no credit, 404 unknown model, 429 limits, 5xx);
- a response that isn't JSON or has no reply in it;
- an invalid tool call: a tool the agent doesn't have, arguments that aren't JSON, a missing required field, an unreadable time, a wrong value, or anything the store refuses (such as an event id from elsewhere).

The provider's error text goes only to the server log (with the key redacted), never into the chat.

### Per-agent settings

An agent's `model` field (set in **+ New** agent, or `POST /api/os/agents/{id}`):

- `none` (the default) uses `JOURNAL_OS_LLM_MODEL`.
- `stand-in` always uses the rule-based stand-in, even when a model is configured.
- Any other id is used only if it is listed in `JOURNAL_OS_LLM_ALLOWED_MODELS`. Without the allowlist, an owner on the public demo could point the server's key at an expensive model.

`GET /api/os/w/{ws}/agents` (and the other agent routes) include `runtime: {kind: "model" | "stand-in", model, provider}` for the UI. It never contains the key.

### While the model thinks

Journal OS requests share one SQLite connection behind a lock. During the model call the request lets go of the lock, so other tabs, the live stream and the automation ticker keep working, and takes it back before writing the reply. Automations claim their day (or week) before calling the model, so two ticks can't post the same brief twice.

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
2. `journal_os/harness.py` (`respond_to`) wakes each mentioned agent, or the agent in a DM. Messages from agents never wake other agents, so replies cannot loop.
3. With a model configured, `ModelRuntime` sends the conversation and the agent's tools to it (see [Connect a model](#connect-a-model)). The reply's text is posted, and each tool call becomes a **pending** approval. If the call fails, the stand-in answers instead.
4. Without a model, the stand-in strips the @mention and reads the rest with the command bar's interpreter.
   - If it recognises a request, it replies with one tool call, which becomes a **pending** approval.
   - Otherwise it replies with plain text and a few example requests.
5. The approval card waits. Nothing has been written to the planner, journal or memory ledger.
6. `POST /api/os/approvals/{id}/approve` runs the tool through the same validator and executor as typed commands (`ActionService.decide_tool_call`). `…/reject` records the decision and changes nothing.
7. Each write lands in the audit log. Open streams pick it up and every tab refreshes the affected channel.

Each agent message records what wrote it (`runtime`: a model id, or `stand-in`), and the UI shows it as a chip next to the agent's name.

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
| `POST /api/os/channels/{id}/messages` | editor | Post `{content, thread_id?, now?, context?}`. Returns `{message, replies}`, where `replies` are the agents' answers (each with `runtime`). `context` is `{view, kind: "journal_entry" or "event", id, selection}`; the server looks the title up itself, refuses items from other workspaces, and stores the result on the message. Barnacle sends it. |
| `GET /api/os/messages/{id}` | viewer | One message. |
| `GET /api/os/w/{ws}/agents` | viewer | Agents in the workspace, each with `runtime` (the model that answers for it, or `stand-in`). |
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
- **`tests/test_model_runtime.py`** (20 tests), against a fake OpenAI-compatible provider on a local port:
  - a tool call becomes a pending card and saves nothing until approved; the request carries channel instructions, agent instructions, memory, history, Barnacle's page context, the agent's tools and the key in the `Authorization` header;
  - a plain reply posts as text; agents report the model in `runtime`; `stand-in` agents never call the model; per-agent models need the allowlist;
  - a timeout (it answers in under 2 seconds with a 0.5-second limit), HTTP 429/500/404, non-JSON and empty responses, and six kinds of invalid tool call all fall back to the stand-in with a note;
  - the key never appears in any response, the live feed or the log, even when the provider echoes it back;
  - other requests run while the model is thinking;
  - the model words the morning brief, a rewrite that drops a time keeps the template, a failure keeps the template, and the evening prompt is never reworded.
- **`scripts/automations_demo.py`**: moves the browser's clock to 8:05 and 20:05 and checks the brief, the evening draft in Barnacle, Run now and turning one off (10/10 checks).
- **`scripts/harness_demo.py`**: a two-tab browser run in headless Chromium.
  - It covers @mention autocomplete, the pending card, the second tab updating live, approving there, the planner link, rejecting a card in a thread, the members dialog, a server restart, phone width and page errors.
  - It passed 14/14 checks on 2026-11-12.

```bash
python3 -m unittest discover -s tests
python3 scripts/harness_demo.py --out demo-output/harness
```

## Known limitations

1. **Without a model, agents are stand-ins.** They understand only the command bar's planner, journal and memory requests. With a model, a free model's replies and tool calls are only as good as that model; the approval gate is what keeps a bad one harmless.
2. **Agents reply inside the request.** A model reply can take up to `JOURNAL_OS_LLM_TIMEOUT` seconds, and the browser waits for it. A background run queue would let the message appear at once and the reply follow. `monthly_budget_usd` is still not enforced, and free-tier daily caps are the only spending limit.
3. **Vercel is a demo only.** Each serverless instance has its own temporary database, so live updates there are 3-second polling and only see changes on the same instance. Use the local server for anything real.
4. **Cards can't be edited in the UI yet.** The approve endpoint accepts edited `input`, but the card only offers Approve and Reject.
5. **Missing messaging basics.** There is no editing or deleting messages, no reactions, uploads or search, and @mentions list agents only, not people.
6. **Unread dots are kept per tab.** They live in the open tab only and reset when it reloads.
