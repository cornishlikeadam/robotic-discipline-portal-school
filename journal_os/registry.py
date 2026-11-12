"""Shared app registry. Status labels must match what actually works.

status values:
  live      — functional in this release, backed by the Journal OS API
  existing  — a module from the original Portal School app, opened as-is
  planned   — not built yet; the card explains what is missing
"""

APP_REGISTRY = [
    {"id": "planner", "name": "Planner", "status": "live", "route": "#planner", "theme": "signal",
     "blurb": "Day, week and month views. Events, tasks, reminders, routines. Works without AI.",
     "permissions": ["planner:read", "planner:write"]},
    {"id": "journal", "name": "Living Journal", "status": "live", "route": "#journal", "theme": "paper",
     "blurb": "Entries with tags and linked events. Companion sandbox logs land here, marked fictional.",
     "permissions": ["journal:read", "journal:write"]},
    {"id": "companion", "name": "Companion", "status": "live", "route": "#companion", "theme": "phosphor",
     "blurb": "Animal Scrypt identity + memory ledger. Propose, approve, reject, forget, export.",
     "permissions": ["memory:propose", "memory:approve(owner)"]},
    {"id": "together", "name": "Together", "status": "live-partial", "route": "#together", "theme": "candy",
     "blurb": "Companion-to-companion sandbox sessions run now. Cross-account play is disabled until "
              "identity verification ships.",
     "permissions": ["companion_calendar:propose"]},
    {"id": "channels", "name": "Channels", "status": "live-partial", "route": "#channels", "theme": "beacon",
     "blurb": "Slack-style channels and DMs with your agents. Agents answer with a rule-based stand-in until a "
              "model is connected, and every change they ask for waits on an approval card.",
     "permissions": ["channels:post", "approvals:decide(owner)"]},
    {"id": "zine", "name": "Zine", "status": "existing", "route": "/zine", "theme": "riso",
     "blurb": "The original Stage-1 zine terminal view from the Portal School app."},
    {"id": "school", "name": "School", "status": "existing", "route": "/gamified#map", "theme": "chalk",
     "blurb": "World map, IP School exercises and the reengineering lab."},
    {"id": "studio", "name": "Studio", "status": "existing", "route": "/studio", "theme": "blueprint",
     "blurb": "Visual blueprint and white-paper studio (server-backed)."},
    {"id": "world", "name": "World", "status": "planned", "route": "#world", "theme": "moss",
     "blurb": "Multi-character fictional environments. Not built: needs a world-state model and renderer."},
    {"id": "autonomy", "name": "Autonomy Modes", "status": "planned", "route": "#autonomy", "theme": "steel",
     "blurb": "Suggested and autonomous-sandbox modes with scheduled background runs. Only Manual mode exists."},
    {"id": "collab", "name": "Shared Workspaces", "status": "planned", "route": "#collab", "theme": "steel",
     "blurb": "Backend memberships and role checks exist; invitations, consent flow and UI do not."},
    {"id": "device", "name": "Companion Device", "status": "live-partial", "route": "#device", "theme": "steel",
     "blurb": "Interactive concept teardown of the PATCH robot: exploded and assembled views, pose and "
              "battery settings, part colors and SVG/PNG/PDF downloads. No hardware runtime yet."},
]
