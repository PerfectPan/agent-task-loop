export const ROOM_SQLITE_SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  seat_order INTEGER NOT NULL,
  PRIMARY KEY (room_id, agent_id)
);

CREATE TABLE IF NOT EXISTS room_events (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  message_id TEXT NOT NULL,
  transport_message_id TEXT,
  author_kind TEXT NOT NULL,
  author_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  addressed_to TEXT NOT NULL DEFAULT '[]',
  origin TEXT NOT NULL DEFAULT 'endpoint',
  at TEXT NOT NULL,
  PRIMARY KEY (room_id, seq)
);

CREATE UNIQUE INDEX IF NOT EXISTS room_events_message_id
  ON room_events(room_id, message_id);

CREATE TABLE IF NOT EXISTS agent_sessions (
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  runtime_generation_id TEXT NOT NULL,
  seen_seq INTEGER NOT NULL DEFAULT 0,
  held_up_to_seq INTEGER,
  PRIMARY KEY (tenant_id, agent_id, room_id, runtime_generation_id)
);

CREATE TABLE IF NOT EXISTS room_workspace (
  room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
