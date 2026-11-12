-- Journal OS — durable local-first schema (SQLite).
-- Companion identities + memory records live in the existing Animal Scrypt
-- tables (skeleton/schema.sql) in the same database file. Everything below
-- is scoped to a workspace and checked on the backend before any read/write.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    handle TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('personal', 'shared')),
    owner_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
);

-- Grants for modules/agents acting inside a workspace (e.g. the companion may
-- PROPOSE planner actions but never execute them without the owner's approval).
CREATE TABLE IF NOT EXISTS access_grants (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    grantee TEXT NOT NULL,             -- user id or 'companion:<id>'
    resource TEXT NOT NULL,            -- 'planner' | 'journal' | 'memory' | 'companion_calendar'
    permission TEXT NOT NULL CHECK (permission IN ('read', 'propose', 'write')),
    granted_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    calendar TEXT NOT NULL CHECK (calendar IN ('personal', 'companion')),
    kind TEXT NOT NULL CHECK (kind IN ('event', 'task', 'reminder', 'routine')),
    title TEXT NOT NULL,
    start_at TEXT NOT NULL,            -- local wall time 'YYYY-MM-DDTHH:MM'
    end_at TEXT NOT NULL,
    recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly')),
    completed INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    participants_json TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ws_start ON events(workspace_id, start_at);

CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('user', 'companion_sandbox')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Links companion memories (Animal Scrypt memory_records) to workspace data.
CREATE TABLE IF NOT EXISTS memory_links (
    memory_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    companion_id TEXT NOT NULL,
    journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
    event_id TEXT REFERENCES events(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS workspace_companions (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    companion_id TEXT NOT NULL,
    PRIMARY KEY (workspace_id, companion_id)
);

-- Every interpreted natural-language or companion action waits here until a
-- human approves or rejects it. Nothing in this table executes on its own.
CREATE TABLE IF NOT EXISTS action_proposals (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    source TEXT NOT NULL,
    input_text TEXT NOT NULL,
    action TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'EXECUTED', 'REJECTED', 'FAILED')),
    result_json TEXT,
    created_at TEXT NOT NULL,
    decided_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT,
    user_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
