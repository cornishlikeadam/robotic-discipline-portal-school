# Journal OS — MVP

**Live demo (resets):** https://robotic-discipline-portal-school.vercel.app/os/ · **Durable:** run locally (below).

Journal OS is a local-first planner, living journal and companion memory ledger added on top of the existing Portal School app. The map, zine, studio, workspace, data room and their backend are unchanged. The existing Animal Scrypt kernel (`skeleton/interfaces.py`) still owns companion identity and memory records.

**The journey that works end to end, and is tested:**
natural-language request → editable preview → approval → saved calendar event → linked journal entry → companion memory proposal → owner approval → companion sandbox session → fictional discovery entry → server restart → everything is still there.

---

## Run it

```bash
python3 -m journal_os.server --port 8090
```

Open <http://127.0.0.1:8090/os/>. Data is stored in `data/journal_os.db` (gitignored). The same server also serves the existing app (`/gamified`, `/studio`, `/zine`), so the Zine, School and Studio cards open the real modules.

Options: `--db path/to/file.db` picks a different database, and `--host 0.0.0.0` exposes it on your LAN (use that only on a network you trust; see Limitations).

Python 3.10+ standard library only. No pip install is needed to run it.

### Connect a model (optional)

Agents answer with a rule-based stand-in until you give the server a model. Any OpenAI-compatible provider works; the free default is OpenRouter's free router:

```bash
export JOURNAL_OS_LLM_API_KEY=sk-or-...   # from openrouter.ai → Keys
python3 -m journal_os.server --port 8090
```

**On Vercel:** project → **Settings → Environment Variables** → add `JOURNAL_OS_LLM_API_KEY` (Production, marked Sensitive), then **Redeploy**; variables only reach new deployments. To use OpenCode Zen, Groq, Gemini or Claude instead, also add `JOURNAL_OS_LLM_BASE_URL` and `JOURNAL_OS_LLM_MODEL`. [HARNESS.md → Connect a model](HARNESS.md#connect-a-model) has the value for each provider, the optional settings, and what happens when a call fails (the stand-in answers, with a note). The key stays on the server. Every change a model asks for is still an approval card.

## Test it

```bash
python3 -m unittest discover -s tests -v
```

Result on 2026-11-12: **141 tests, all passing** (24 in `tests/test_journal_os.py`, 28 in `tests/test_agent_harness.py`, 19 in `tests/test_harness_routes.py`, 11 in `tests/test_barnacle_context.py`, 18 in `tests/test_automations.py`, 20 in `tests/test_model_runtime.py`, 21 for the older modules). Unset any `JOURNAL_OS_LLM_*` variables first, or the older tests will call your real model.

| Area | Tests |
|---|---|
| Calendar | create / move / complete / delete; validation; daily recurrence expansion; companion calendar kept separate; export → import round trip |
| Interpreter | the brief's example sentence; 9 other phrasings; unknown input is refused, not faked; whitelist rejects unknown actions, extra fields and wrong calendars |
| Approval pipeline | nothing is saved before approval; rejected proposals can't be approved later; NL events land in the same calendar as manual ones; preview edits apply but can't retarget another event; move + journal-link flow with history |
| Memory | propose → approve (with edit) / reject → forget → export; a sentence typed as a request only creates a *proposal* |
| Authorization | another user gets 403 on read, write, command and export; viewer role can read but not write; only the owner approves memories; missing or forged token gets 401 |
| Sandbox | session runs from the companion calendar, writes a fictional entry, leaves personal events unchanged, never includes approved memory text, runs once; refuses personal events |
| Restart persistence | starts the real server process, completes the whole journey over HTTP, kills the process, starts a new one on the same file, and checks events, the journal link and body, the sandbox entry, the approved memory and the session token |
| Agent harness: schema | the five tables exist; a database from before the harness gains them on open and keeps its data; agent tools match the existing action whitelist |
| Agent harness: channels | slug names, duplicates and the reserved `dm-` prefix refused; private channels and DMs hidden from non-members; DMs reused and closed to third members; archive and last-owner rules; viewers read but can't post; members must belong to the workspace |
| Agent harness: agents | defaults (handle, `memory_path`, model `none`, grants); 11 invalid inputs refused with nothing half-created; only the owner creates or edits; grants are `propose` only and can be revoked; bootstrap is idempotent; `MEMORY.md` shows approved memories only |
| Agent harness: messages | @mentions resolve only to agents in the channel; threads stay one level deep; listing and limits; agents must be active posting members; reply chains stop after 4 hops |
| Automations | setup creates three once; no backfill when set up late; runs once per day or week and catches up later the same day; missed days aren't replayed; Sunday-only weekly review; off and time changes; brief lists today and open tasks; the evening draft saves nothing until approved and links today's event; reject changes nothing; only the owner edits or runs; a member's clock never runs the owner's; a paused agent records an error; the local ticker reaches the live feed |
| Model driver | against a fake provider: a tool call becomes a pending card; plain replies post as text; a timeout, HTTP errors, bad JSON and six kinds of invalid tool call fall back to the stand-in with a note; the key never appears in responses or logs; other requests run while the model thinks; automations reworded only when every time survives |
| Agent harness: approvals | a tool call saves nothing until approved; approve runs it, reject doesn't; mixed outcomes; agent proposals can't be approved from the command bar; 6 kinds of bad tool call write nothing; memory tools need a ledger and still need ledger approval; only the owner decides; edits can't retarget; failures are recorded; `post_message` posts only after approval; other workspaces and private channels stay closed; a pending approval survives a restart |

**Browser end-to-end and recording:** `scripts/record_demo.py` drives the real UI in headless Chromium, restarts the server partway through, and saves `journey.webm` and screenshots. On 2026-11-12 it passed 11/11 checks with no page errors. `scripts/harness_demo.py` does the same for Channels with two tabs (14/14 checks; see [HARNESS.md](HARNESS.md)), `scripts/barnacle_demo.py` for the Barnacle companion (12/12 checks), and `scripts/automations_demo.py` for the automations, moving the browser's clock to 8:05 and 20:05 (10/10 checks). They need `pip install playwright && python -m playwright install chromium`.

```bash
python3 scripts/record_demo.py --out demo-output
```

---

## Architecture

```
os/                     Journal OS front end (vanilla JS, no build step)
  index.html            shell: top bar, command bar + preview, app dock, view
  os.css                Robotic Discipline theme (pixel cards, zine panels)
  os.js                 planner (day/week/month, drag to move), journal, companion, together
  harness.js, harness.css  Channels: channels, DMs, threads, approval cards, live stream
  bubble.js, bubble.css    Barnacle: the floating companion on every view
journal_os/
  schema.sql            Journal OS tables (separate from the kernel's tables)
  store.py              data layer; every method checks workspace role first (now also channels, agents, messages, approvals)
  interpreter.py        deterministic NL → whitelisted action; LLM adapter interface
  actions.py            proposal → approve/reject → execute; agent tool-call decisions; sandbox simulation
  harness.py            agent reply path: OpenAI-compatible model driver, the rule-based stand-in fallback
  registry.py           shared app registry with honest status labels
  server.py             HTTP routes (/api/os/*) + local server
skeleton/interfaces.py  existing Animal Scrypt kernel (companions, memory ledger), reused as-is
api/index.py            existing Vercel gateway; now forwards /api/os/* to Journal OS
```

**Safety model**
- Typed requests never run directly. The interpreter outputs one of six whitelisted actions (`create_event`, `update_event`, `delete_event`, `create_journal_entry`, `propose_memory`, `schedule_companion_activity`). That output is stored as a `PENDING` proposal. On approval, `validate_action` checks the action name, the allowed fields and the target calendar again. The action then runs through the same store methods, with the same permission checks, as the manual UI. No generated text reaches SQL, which is fully parameterized, or the OS.
- The preview can edit values, but it cannot switch to a different event.
- Memories: a companion can only *propose*. Only the workspace **owner** can approve, reject or forget a memory. Exports contain approved memories only.
- Companions get `propose` grants on planner, journal, memory and companion calendar (`access_grants`). They never get `write`.
- The sandbox reads only companion names, never memories. It writes only companion-calendar events and journal entries tagged `fictional`, and it labels its output as simulated.
- Agents (see [Agent harness](#agent-harness-foundation)) can post text. Every tool call they make waits as a `pending` approval. Planner, journal and memory tools reuse the same proposal pipeline as typed requests.

**Database schema** (one SQLite file)

| Table | Purpose |
|---|---|
| `users`, `sessions` | local profiles. Session tokens are HMAC-signed and never stored, so the `sessions` table is unused. |
| `workspaces`, `workspace_memberships` | personal or shared spaces; roles owner, editor, viewer |
| `access_grants` | per-module permissions for companions and other grantees |
| `events` | personal **and** companion calendars (`calendar` column); kind event/task/reminder/routine; recurrence none/daily/weekly |
| `journal_entries` | title, body, tags, `event_id` link, origin `user` or `companion_sandbox` |
| `companions`, `memory_records` | **existing Animal Scrypt tables** (PROPOSED → APPROVED → DELETED) |
| `workspace_companions`, `memory_links` | tie kernel companions and memories to a workspace, journal entry and event |
| `action_proposals` | every interpreted request with its status (PENDING, EXECUTED, REJECTED, FAILED), payload and result. `source` is `command` for typed requests and `agent:<id>` for agent tool calls |
| `audit_log` | every write, including where it came from (manual, command, agent, sandbox, import) |
| `channels` | Slack-style rooms per workspace: `public`, `private`, `dm`, `agent-room`; shared `instructions` every agent in the room receives; `archived_at` |
| `channel_members` | who is in a channel: `human`, `agent` or `companion`; role `owner`, `member` or `observer` (observers read only) |
| `agents` | name, `@handle`, role, `system_prompt`, `model` (`none` = the server's model, `stand-in` = never call a model, or an allowed model id), owner, optional linked companion (whose memory ledger the agent uses), status `active`/`paused`/`archived`, `memory_path`, `monthly_budget_usd` |
| `messages` | channel posts and one-level threads (`thread_id` = root). `author_type` `human`, `agent` or `system`; `mentions_json`, `tool_calls_json`, `approval_status` (none, pending, approved, rejected, mixed), and `hop`, the agent reply depth |
| `approvals` | one row per agent tool call: `tool_name`, `tool_input_json`, status `pending` → `approved` / `rejected` / `failed`, `decided_by`, result, and `proposal_id` linking planner/journal/memory tools to `action_proposals` |

**API** (Bearer token from `POST /api/os/session`)
`GET/POST /api/os/w/{ws}/events` · `GET/POST/DELETE /api/os/events/{id}` · `POST /api/os/events/{id}/run-sandbox` · `GET/POST /api/os/w/{ws}/journal` · `POST/DELETE /api/os/journal/{id}` · `GET /api/os/w/{ws}/companions[/{cid}/export]` · `GET/POST /api/os/w/{ws}/memories` · `POST /api/os/memories/{id}/review|forget` · `POST /api/os/w/{ws}/commands` · `GET /api/os/w/{ws}/actions` · `POST /api/os/actions/{id}/approve|reject` · `GET /api/os/w/{ws}/audit|grants|export` · `POST /api/os/w/{ws}/import|members` · `GET /api/os/health|registry|me` · Channels, agents, approvals and the live stream: see [HARNESS.md](HARNESS.md#endpoints)

**Path to a personal device.** The server is a single Python process on the standard library, using one SQLite file. It doesn't need a network and runs unchanged on a Raspberry Pi-class machine. The `LanguageModelAdapter` interface in `interpreter.py` is where a local model would plug in, and its output would still go through `validate_action` and user approval.

---

## Agent harness (foundation)

The goal is a Slack-style space inside the journal, where you, your companions and AI agents work in channels. You @mention an agent, it does the work, and you approve anything that changes your data. This step adds only the data layer: tables, store methods and tests. The model runtime (Prompt 2) and the chat UI (Prompt 3) build on it. Nothing here changes the planner, journal or memory flows; the browser journey still passes 11/11.

**Where the design comes from**

| Source | What this layer takes from it |
|---|---|
| [OpenMausBot](https://github.com/milind-soni/OpenMausBot) ("maus bot"), the open-source Grok Bot alternative, Apache-2.0 | Every channel has its own instructions and agent roster. Risky actions become Allow/Deny cards (its "permission broker"). One harness owns all agents, and an unknown model driver shows as unavailable instead of crashing. Shared team packages never carry credentials, permissions or memory. |
| [agentes-chat](https://github.com/agentes-chat/agentes-chat), the open-source "team + agents in channels" workspace from the linked X post, AGPL-3.0 | Messages record the author type, the agents they mention, and a **hop** counter that stops agents from replying to each other forever. Agents have an owner and a monthly budget. A run can pause while it waits for approval. *Only the design was used. Copying its code would put this repo under the AGPL.* |
| Nick Vasilescu, "Grok Bot Cut My Limits… So I Built My Own" | An orchestrator agent can direct other agents. Each agent may later get its own computer. API keys stay on the server. |
| Code With Antonio, "Build Your Own Personal AI Agent From Scratch" | Telegram and iMessage are just more channels. Tool use runs as background jobs inside a sandbox. |
| Forward Pass, "I Built An LLM From Scratch in 30 Minutes" | A 31M-parameter model trained locally could fill `model` for an offline companion device. |
| Practical AI with Azou, "DeepSeek + REA To Clone Anything" | Reverse-engineering an existing app (REA) is how to study a bot's behaviour before rebuilding it. This data layer didn't need it. |

**How an agent will use the tables**

1. You post in `#build-log`: *"@scout book a build session tomorrow at 11"*. `post_message` saves it with `mentions = [scout]` and `hop = 0`.
2. The runtime (Prompt 2) sees the mention and builds the agent's context from:
   - the channel's `instructions`;
   - the agent's `system_prompt`;
   - recent messages;
   - `render_agent_memory`, which includes approved memories only.
3. The runtime calls `post_agent_message(user, agent, channel, text, tool_calls=[{"tool": "create_event", "input": {...}}], trigger_message_id=…)`. Before writing anything, the store checks:
   - the agent is active and a posting member of the channel;
   - the hop limit;
   - the tool whitelist;
   - the agent's `propose` grant;
   - the shape of the input.

   It then saves the message with `approval_status = pending`, one `approvals` row per tool call, and a linked `PENDING` row in `action_proposals` for planner, journal and memory tools.
4. The approval card shows the request's `summary`. The workspace owner or the agent's owner calls `ActionService.decide_tool_call(user, approval_id, approve, edited_input)`.
   - **Approve** runs the call through `ActionService.approve`, with the same validator, edit locks and executor as typed requests.
   - **Reject** marks both rows rejected.
   - If the call fails when it runs, it is recorded as `failed` along with the error.
5. The message's `approval_status` becomes approved, rejected or mixed. The audit log records the write as `via: agent`.

**Rules the tests enforce**
- Agents can write chat text freely, but every tool call they make waits for approval. Your own actions are not gated, just as manual planner edits aren't.
- An agent's proposal can't be approved or rejected from the command bar. That keeps the approval card and the proposal from drifting apart.
- `journal_entries` and `memory_records` stay the source of truth:
  - An agent can propose memories only to its linked companion's ledger.
  - Approving that tool call creates a *PROPOSED* memory, which the owner still has to approve in the ledger.
  - `memory_path` points to a readable `MEMORY.md` export rebuilt from the ledger. Nothing reads that file back.
- Agents only ever get `propose` grants (planner, journal, memory, companion_calendar, channels), never `write`. Grants can be revoked.
- Only the workspace owner creates agents. Only the workspace owner or the agent's owner decides their requests.
- Reply chains stop after 4 hops, and each message can carry at most 5 tool calls.
- Private channels and DMs are hidden from non-members, including in the approvals list.

**Store methods**

| Area | Methods |
|---|---|
| Channels | `create_channel`, `open_dm`, `get_channel`, `list_channels`, `archive_channel`, `add_channel_member`, `remove_channel_member`, `list_channel_members` |
| Agents | `create_agent`, `get_agent`, `list_agents`, `update_agent` (including `resources` grants), `agent_may`, `render_agent_memory`, `bootstrap_harness` (creates `#general` and a PATCH agent linked to the PATCH ledger; safe to call repeatedly) |
| Messages | `post_message` (people), `post_agent_message` (agents; tool calls become approvals), `get_message`, `list_messages` (top level or one thread) |
| Approvals | `get_approval`, `list_approvals`, `require_approver`, `finish_approval` (internal); deciding is `ActionService.decide_tool_call` |

**Built since:** Prompt 2 added the Channels view, its HTTP routes, a live stream and a rule-based stand-in agent. Prompt 3 added one OpenAI-compatible model driver for every provider (OpenRouter, OpenCode Zen, Groq, Gemini, Ollama, Claude), with the stand-in as fallback. See [HARNESS.md → Connect a model](HARNESS.md#connect-a-model).

**Still to build**
- An `agent_runs` queue with one run per agent per trigger message, so slow replies happen in the background.
- A usage ledger that enforces `monthly_budget_usd`.

---

## Barnacle, the floating companion

Barnacle is a gold bubble in the bottom-right corner of every Journal OS view (planner, journal, companion, Together, Channels). It stays put while you scroll and opens a compact chat panel; on a phone the panel is a bottom sheet. It talks through one agent: Chief of Staff if you have one (handle `chief-of-staff`, or "chief of staff" in its name or job), otherwise PATCH. If you have more than one agent, you can switch between them in the panel.

- **Same system, same gate.** The conversation is a DM in [Channels](HARNESS.md), so messages land in the `messages` table and every change the agent asks for is a normal approval card. Nothing in the journal, planner or memory ledger changes until you press Approve. The same conversation is visible under Channels → DMs.
- **Light context.** With each message Barnacle sends what you're looking at: the open journal entry, the event you last opened in the planner, and any text you've selected. The panel shows this as chips you can remove before sending. The server re-reads titles from the database and refuses anything outside your workspace, and the message records what was shared.
- **What a model does with it.** It reads the open entry's text (or the event's notes) and your selection, so "summarise this" works. Changes it suggests are still approval cards.
- **What the stand-in does with it.**
  - "Remember this" proposes the selected text as a memory, linked to the entry or event.
  - "Move this to Friday at 3pm", "Cancel this" and "Create a journal entry for this" target the open event.
  - Anything else gets suggestions based on what you're viewing.
- **Presence.** The bubble floats and pulses gently, and its badge shows how many approvals are waiting. When you select a sentence in the journal it offers "Want me to keep…?". On first visit it introduces itself; **Show me** (or **Demo** in the panel) types a sample request and sends it, producing a real approval card to approve or reject. If the workspace has no agent yet, the demo sets up PATCH first.
- **Motion** is turned off for people who ask their system for reduced motion.

### On a phone

Barnacle is built phone first. It behaves like a video that keeps playing in a corner while you browse:

- **The bubble** is a 56 px touch target in the bottom-right corner. Drag it to any corner and it snaps there and stays after a reload. **Move Barnacle to the left/right** in the chat does the same without dragging. A top corner sits below the top bar, so it never covers Sign out.
- **It keeps out of the way.** It tucks to the screen edge while you scroll down and comes back when you stop. It hides while you type anywhere else, because the keyboard has already taken half the screen.
- **The chat is a bottom sheet**: full width, rounded top, with the agent's name, Minimize and Close in the header. It rides above the on-screen keyboard, and the page doesn't scroll behind it.
- **The mini player.** Changing views while the sheet is open shrinks it to a small card with the agent's name, its latest line and a count of changes waiting. The card stays on every view; tap it to reopen the chat. Minimize does the same on demand, and the mode is remembered across reloads.
- **States.**
  - Empty: "No messages yet", with three example requests.
  - Thinking: your message appears at once, with "PATCH is thinking" under it.
  - Pending: a gold "1 waiting" pill in the header jumps to the first card; cards have a gold outline and 44 px buttons.
  - Failed send: your text is kept, with **Try again**.
  - Model failure: the stand-in answers, and the reply carries a quiet notice.
- **Gestures.**
  - Tap the bubble to open the chat. Swipe down on the sheet's header (the grab handle) to close it; a short drag springs back. Close and Escape do the same without a gesture.
  - Swipe left or right on the page to move between Planner, Living Journal, Companion and Channels. It stops at the ends rather than wrapping. A swipe that starts in a text box, a slider, a planner event, a sideways-scrolling area or a dialog is left alone.
  - A bottom nav with those four views appears under 640 px, for anyone who doesn't swipe. The bubble sits above it, and it hides while the keyboard is up.
  - In the planner's month view, tapping a day opens it in the day view, where events are big enough to tap.
- **Touch.** On touch screens, buttons, fields, channel rows and approval buttons are at least 44 px tall, taps have a visible pressed state, and `touch-action: manipulation` removes the tap delay. Bottom elements respect `env(safe-area-inset-bottom)`.
- **On a wider screen** the chat is a side panel on the bubble's side, and it stays open as you change views.
- **Limit.** A web page can't float over other apps or the home screen the way a picture-in-picture video does. Barnacle stays with you everywhere inside Journal OS.
- **Gesture checks.** `scripts/gestures_demo.py` runs 17 checks with real touch events: the bottom nav, swiping between views, ignored swipes, the sheet's spring-back and swipe-to-close, 44 px targets, the month-to-day tap, and an unchanged desktop.
- **Checks.** `scripts/barnacle_phone_demo.py` runs 17 checks at 390 × 844 with touch: drag and snap, the sheet, the mini player across views, each state, hiding while typing, tucking on a real touch swipe, reduced motion, and the desktop side panel.

---

## Automations

Setting up Channels (**Create #general with PATCH**, or **Turn on automations** in the Channels sidebar) adds three automations. PATCH posts them on its own:

| Automation | When | Where | What |
|---|---|---|---|
| ☀️ Morning brief | every day, 8:00 | #general | Today's plan, unfinished tasks from the past week, and how many requests are waiting for approval. |
| 🌙 Evening journal prompt | every day, 20:00 | the DM with PATCH, which is also Barnacle's conversation | Asks how the day went and attaches a draft "Evening reflection" entry, linked to the day's longest event, as an approval card. The bubble's badge counts it. |
| 🗓️ Weekly review | Sundays, 18:00 | #general | The week's events and how many were marked done, journal entries, memories, and agent requests approved, rejected or waiting. |

- **Nothing changes without you.** Posting a message is all an automation does by itself. The evening draft reaches your journal only if you press Approve, and you can edit it there afterwards.
- **Change or stop them.** Click one in the Channels sidebar to turn it off, change its time (and the weekly review's day), or **Run now**. Only the workspace owner can change or run them.
- **How they're scheduled.** Each automation runs at most once per day (or week); the server records the period it last ran for. Two things ask what is due:
  - the local server, every 30 seconds (`--no-automations` turns this off);
  - the browser, when the app opens, every 5 minutes while it is open, and when the tab comes back into view. It sends its own clock, so times follow your timezone even on Vercel, whose servers run on UTC.
- **Catching up.** If nothing was running at 8:00, the brief posts the next time the app or server checks that day. Missed days aren't replayed, and setting up at 21:00 doesn't post a morning brief at night.
- **Wording.** The messages are put together from your data by fixed rules. With a model connected, it rewords the morning brief and weekly review in the agent's voice, with no tools. If the call fails, or the rewrite drops a time, the template text is posted. The evening prompt and its draft are never reworded. `JOURNAL_OS_LLM_AUTOMATIONS=off` turns rewording off.
- **On Vercel** they only run while someone has the app open, and the demo database resets, so use **Run now** there.

Code: `journal_os/automations.py` and the `automations` table in `journal_os/schema.sql`. Endpoints are listed in [HARNESS.md](HARNESS.md#endpoints).

---

## Working vs. planned

| Feature | Status |
|---|---|
| Day / week / month planner; create, edit, move, complete and delete | **Working** |
| Tasks, reminders, routines, daily/weekly repeats | **Working** (editing a repeat edits the whole series) |
| Drag to reschedule (week, day and month views) | **Working** (mouse; keyboard users edit times in the dialog) |
| Separate companion activity calendar | **Working** |
| Import / export planner JSON | **Working** |
| Natural-language requests → preview → approve/reject | **Working** (rule-based, offline) |
| Action history + audit log | **Working** |
| Journal entries with tags and a linked event | **Working** (plain text; no images or rich formatting yet) |
| Companion identity (PATCH, MOSS, PIP) from the Animal Scrypt kernel | **Working** |
| Memory propose / approve / edit / reject / forget / export | **Working** |
| Companion-to-companion sandbox session → fictional discovery entry | **Working** (deterministic, 4 challenge templates) |
| Backend authorization, workspace roles, companion grants | **Working** (tested) |
| Zine, School, Studio cards | **Open the existing modules** |
| LLM interpretation | **Planned**: the adapter interface exists, but no provider is wired up |
| Suggested and Autonomous-Sandbox autonomy modes | **Planned** (only Manual mode exists) |
| Shared workspaces UI, invitations, mutual consent | **Planned** (backend memberships and roles exist; there is no UI) |
| Cross-account companion play | **Disabled** until identity verification ships |
| World module, device integration | **Planned** |
| Agent harness data layer: channels, members, agents, messages, approvals | **Working** (store + tests) |
| Channels view: channels, DMs, threads, @mentions, approval cards, live updates | **Working** ([HARNESS.md](HARNESS.md)); live updates are 3-second polling on Vercel |
| Agents answering in channels | **Working with a model** once `JOURNAL_OS_LLM_API_KEY` (or another provider) is set ([setup](HARNESS.md#connect-a-model)); otherwise, and whenever a call fails, the rule-based stand-in |
| Barnacle floating companion (every view, context chips, approval cards in the panel) | **Working**; replies come from the model, or the stand-in without one |
| Automations: morning brief, evening journal prompt, weekly review | **Working**; built from your data by fixed rules, and reworded by the model when one is connected |
| Model runtime (drivers, background runs, budgets) | **Planned** |
| Agent budgets | **Stored only**: `monthly_budget_usd` is saved but not enforced; free-tier daily caps are the only limit on model use |

## Pixel-world controls

Every switch and slider in Journal OS, plus the live indicator in Channels, is drawn as a small PATCH scene. This uses the [pixel-worlds](https://github.com/finktheartist/pixel-worlds) method (MIT): paint the scene, light it, then snap it to a fixed palette. It lives in `os/pixel-controls.js`, one file with no dependencies, and loads on every view. It is also inlined into the Companion Device teardown by `device/build.cjs`. To see them all on one page, open `/os/pixel-controls.html`.

| Control | Scene | Where it appears |
|---|---|---|
| Switch (checkbox) | PATCH's head slides across. When off, it is asleep and grey. When on, it is awake: lit lime ear panels, open eyes, a blush, and a rail of lit LEDs. | Automation On/Off, the event dialog's Completed checkbox, agent permissions, channel agent picks, and the teardown's Annotations and Fill |
| Slider (range) | A small PATCH stands at the value on a rail. The LEDs light up behind it, and it hops while moving. The hue slider gets a stepped rainbow rail, and PATCH's ears take the chosen hue. | Every slider in the teardown: part spacing, ear tilt, left-arm wave, battery capacity and line hue |
| Live indicator | A small antenna. Lime arcs mean live, blinking amber means reconnecting, and grey means connecting. | The Channels header |

- **It is still the real control.** The `<input>` stays in the page, on top of the art, so clicks, drags, the keyboard, forms and screen readers work exactly as before.
- **States in the art.** Focus shows as a lime outline drawn in the art. A pressed switch sits down onto its shadow, and disabled controls are dithered over.
- **Opting out.** Inputs with `.sr`, `.sr-only` or `data-pw="off"` are left alone.
- **Checks.** `scripts/pixel_controls_demo.py` runs 11 checks: a real mouse press and drag, the keyboard, form saving, 5 switches at 61 fps, the hue rail, phone width, and page errors.

## Known limitations

1. **Sign-in is device-trust, with no password.** Anyone who can reach the server can open any profile by name. That is fine on `127.0.0.1`, but do not expose it to the internet with real data. Real authentication (passkeys, or a password plus rate limiting) is the next security task.
2. **Vercel is not durable.** On Vercel, the API uses `/tmp/journal_os_demo.db`, reports `storage: ephemeral`, and the UI shows a red "Demo storage — resets" badge. A public demo there will lose data on cold starts. Durable cloud storage (Turso/libSQL, Postgres or a small VM with a disk) is not configured. The public demo at https://robotic-discipline-portal-school.vercel.app/os/ runs in this mode; Vercel may also run several instances, each with its own `/tmp`, so a sign-in can occasionally be lost.
3. **Times are local wall-clock time.** Times are stored without a timezone, which suits one device in one timezone.
4. **The interpreter is rule-based.** It handles the phrasings in the tests and close variants, and refuses anything else (it shows examples rather than guessing). "At 3" with no AM/PM is read as 3 PM; times from 7 to 11 are read as AM.
5. **Journal entries are plain text** with tags. There are no images or rich formatting yet.
6. **Recurring events** support only daily and weekly repeats, and edits apply to the whole series (no exceptions for single dates).
7. **Concurrency:** the local server handles requests on separate threads (so a live stream can stay open), but they take turns on one SQLite connection. That is fine for one person or a small group.

---

## Two-minute screen recording plan

Record at 1366×860 with the server running from a fresh database (`--db data/demo.db`). `scripts/record_demo.py` performs these same steps automatically and saves a `.webm` as a reference or backup take.

| Time | Show | Say |
|---|---|---|
| 0:00–0:10 | Sign in as `kj`. Pan across the pixel app cards and point out the Live, Existing and Planned chips. | "Journal OS: a planner-first home for the Robotic Discipline companions. Every card says honestly whether it works yet." |
| 0:10–0:25 | Click **+ New** and create "Studio critique prep" tomorrow at 9:00. Drag it to 10:00. | "The planner works without any AI: create, drag, edit." |
| 0:25–0:50 | Type *Schedule a robotics build session tomorrow at 11 for 90 minutes* and press **Preview**. Point at the "Nothing saved yet" tag, change the minutes, then press **Approve & save**. | "Typed requests become a preview I can edit. Nothing is saved until I approve it." |
| 0:50–1:10 | Type *Create a journal entry for my robotics build session*, approve it, then click **Open entry**. Write two lines and save. Go to Planner, then back to Journal. | "The entry is linked to the event and survives navigation." |
| 1:10–1:30 | Click **Ask companion to remember…** → **Propose**, open the ledger, edit the text and click **Approve**. Click **Export**. | "PATCH can only propose a memory. I decide what it keeps, and I can export or forget it." |
| 1:30–1:45 | Open Together, plan MOSS & PIP, approve, and click **Run in sandbox**. Show the pink **Fictional** tag. | "Companions play in a sandbox calendar. It never touches my schedule or reads my memories, and the log is marked fictional." |
| 1:45–2:00 | In the terminal, press Ctrl-C and restart the server. Reload the page: the planner and the approved memory are still there. | "Restarted, and everything I approved is still here, on my own machine." |
