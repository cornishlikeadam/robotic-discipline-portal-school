# Journal OS — MVP (branch `journal-os-mvp`)

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

## Test it

```bash
python3 -m unittest discover -s tests -v
```

Result on 2026-11-11: **42 tests, all passing** (21 existing + 21 new in `tests/test_journal_os.py`).

| Area | Tests |
|---|---|
| Calendar | create / move / complete / delete; validation; daily recurrence expansion; companion calendar kept separate; export → import round trip |
| Interpreter | the brief's example sentence; 9 other phrasings; unknown input is refused, not faked; whitelist rejects unknown actions, extra fields and wrong calendars |
| Approval pipeline | nothing is saved before approval; rejected proposals can't be approved later; NL events land in the same calendar as manual ones; preview edits apply but can't retarget another event; move + journal-link flow with history |
| Memory | propose → approve (with edit) / reject → forget → export; a sentence typed as a request only creates a *proposal* |
| Authorization | another user gets 403 on read, write, command and export; viewer role can read but not write; only the owner approves memories; missing or forged token gets 401 |
| Sandbox | session runs from the companion calendar, writes a fictional entry, leaves personal events unchanged, never includes approved memory text, runs once; refuses personal events |
| Restart persistence | starts the real server process, completes the whole journey over HTTP, kills the process, starts a new one on the same file, and checks events, the journal link and body, the sandbox entry, the approved memory and the session token |

**Browser end-to-end and recording:** `scripts/record_demo.py` drives the real UI in headless Chromium, restarts the server partway through, and saves `journey.webm` and screenshots. On 2026-11-11 it passed 11/11 checks with no page errors. It needs `pip install playwright && python -m playwright install chromium`.

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
journal_os/
  schema.sql            Journal OS tables (separate from the kernel's tables)
  store.py              data layer; every method checks workspace role first
  interpreter.py        deterministic NL → whitelisted action; LLM adapter interface
  actions.py            proposal → approve/reject → execute; sandbox simulation
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

**Database schema** (one SQLite file)

| Table | Purpose |
|---|---|
| `users`, `sessions` | local profiles; only the SHA-256 hash of each session token is stored |
| `workspaces`, `workspace_memberships` | personal or shared spaces; roles owner, editor, viewer |
| `access_grants` | per-module permissions for companions and other grantees |
| `events` | personal **and** companion calendars (`calendar` column); kind event/task/reminder/routine; recurrence none/daily/weekly |
| `journal_entries` | title, body, tags, `event_id` link, origin `user` or `companion_sandbox` |
| `companions`, `memory_records` | **existing Animal Scrypt tables** (PROPOSED → APPROVED → DELETED) |
| `workspace_companions`, `memory_links` | tie kernel companions and memories to a workspace, journal entry and event |
| `action_proposals` | every interpreted request with its status (PENDING, EXECUTED, REJECTED, FAILED), payload and result |
| `audit_log` | every write, including where it came from (manual, command, sandbox, import) |

**API** (Bearer token from `POST /api/os/session`)
`GET/POST /api/os/w/{ws}/events` · `GET/POST/DELETE /api/os/events/{id}` · `POST /api/os/events/{id}/run-sandbox` · `GET/POST /api/os/w/{ws}/journal` · `POST/DELETE /api/os/journal/{id}` · `GET /api/os/w/{ws}/companions[/{cid}/export]` · `GET/POST /api/os/w/{ws}/memories` · `POST /api/os/memories/{id}/review|forget` · `POST /api/os/w/{ws}/commands` · `GET /api/os/w/{ws}/actions` · `POST /api/os/actions/{id}/approve|reject` · `GET /api/os/w/{ws}/audit|grants|export` · `POST /api/os/w/{ws}/import|members` · `GET /api/os/health|registry|me`

**Path to a personal device.** The server is a single Python process on the standard library, using one SQLite file. It doesn't need a network and runs unchanged on a Raspberry Pi-class machine. The `LanguageModelAdapter` interface in `interpreter.py` is where a local model would plug in, and its output would still go through `validate_action` and user approval.

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
| Suggested and Autonomous-Sandbox autonomy modes, scheduled background runs | **Planned** (only Manual mode exists) |
| Shared workspaces UI, invitations, mutual consent | **Planned** (backend memberships and roles exist; there is no UI) |
| Cross-account companion play | **Disabled** until identity verification ships |
| World module, device integration | **Planned** |

## Known limitations

1. **Sign-in is device-trust, with no password.** Anyone who can reach the server can open any profile by name. That is fine on `127.0.0.1`, but do not expose it to the internet with real data. Real authentication (passkeys, or a password plus rate limiting) is the next security task.
2. **Vercel is not durable.** On Vercel, the API uses `/tmp/journal_os_demo.db`, reports `storage: ephemeral`, and the UI shows a red "Demo storage — resets" badge. A public demo there will lose data on cold starts. Durable cloud storage (Turso/libSQL, Postgres or a small VM with a disk) is not configured, and no public deployment was made from this branch.
3. **Times are local wall-clock time.** Times are stored without a timezone, which suits one device in one timezone.
4. **The interpreter is rule-based.** It handles the phrasings in the tests and close variants, and refuses anything else (it shows examples rather than guessing). "At 3" with no AM/PM is read as 3 PM; times from 7 to 11 are read as AM.
5. **Journal entries are plain text** with tags. There are no images or rich formatting yet.
6. **Recurring events** support only daily and weekly repeats, and edits apply to the whole series (no exceptions for single dates).
7. **Concurrency:** one process with one SQLite connection, which is fine for one person.

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
