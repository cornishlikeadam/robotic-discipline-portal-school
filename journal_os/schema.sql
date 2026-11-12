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

-- ===========================================================================
-- Agent harness: Slack-style channels where people, agents and companions
-- talk. Added in place (CREATE IF NOT EXISTS), so an existing database gains
-- these tables the next time the server starts; nothing above changes.
--
-- Agents never write to the planner, journal or memory ledger themselves.
-- Each tool call an agent makes becomes a `pending` row in `approvals`. Tools
-- that touch the planner, journal or memory also get a linked PENDING row in
-- `action_proposals`, so they run through the same validate -> approve ->
-- execute pipeline as typed requests. journal_entries and memory_records stay
-- the source of truth.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                     -- lowercase slug, unique per workspace
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL CHECK (type IN ('public', 'private', 'dm', 'agent-room')),
    instructions TEXT NOT NULL DEFAULT '',  -- shared context every agent in the channel receives
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    archived_at TEXT,
    UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS channel_members (
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL,                -- users.id, agents.id or companions.id
    member_type TEXT NOT NULL CHECK (member_type IN ('human', 'agent', 'companion')),
    role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'observer')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (channel_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_members_member ON channel_members(member_id);

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    handle TEXT NOT NULL,                   -- @mention handle, unique per workspace
    role TEXT NOT NULL DEFAULT '',          -- one-line job ("researcher", "planner")
    system_prompt TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT 'none',     -- provider/model id; 'none' = no runtime attached yet
    owner_id TEXT NOT NULL REFERENCES users(id),
    companion_id TEXT,                      -- Animal Scrypt companion whose memory ledger this agent uses
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    memory_path TEXT NOT NULL,              -- readable MEMORY.md export, rebuilt from memory_records
    monthly_budget_usd REAL NOT NULL DEFAULT 0 CHECK (monthly_budget_usd >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (workspace_id, handle)
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    thread_id TEXT REFERENCES messages(id) ON DELETE CASCADE,  -- thread root; NULL = top level
    author_id TEXT NOT NULL,
    author_type TEXT NOT NULL CHECK (author_type IN ('human', 'agent', 'system')),
    content TEXT NOT NULL DEFAULT '',
    mentions_json TEXT NOT NULL DEFAULT '[]',    -- ids of @mentioned agents (who should answer)
    tool_calls_json TEXT NOT NULL DEFAULT '[]',  -- [{tool, input, approval_id}]
    approval_status TEXT NOT NULL DEFAULT 'none'
        CHECK (approval_status IN ('none', 'pending', 'approved', 'rejected', 'mixed')),
    hop INTEGER NOT NULL DEFAULT 0,              -- agent-to-agent reply depth; capped to stop loops
    created_at TEXT NOT NULL,
    edited_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    tool_input_json TEXT NOT NULL,
    proposal_id TEXT REFERENCES action_proposals(id),  -- set for planner/journal/memory tools
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'failed')),
    result_json TEXT,
    decided_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_approvals_ws_status ON approvals(workspace_id, status);
