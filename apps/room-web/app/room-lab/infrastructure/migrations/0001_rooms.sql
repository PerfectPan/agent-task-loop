-- Rooms, their members, the event stream and the per-agent session cursors.
-- The tables this application started with, recorded here as the first version.
-- No IF NOT EXISTS: a migration that has not been applied is a migration whose
-- tables do not exist, and a library that already has them is already at
-- version 1 and never runs this file.

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL
);

CREATE TABLE room_members (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  seat_order INTEGER NOT NULL,
  PRIMARY KEY (room_id, agent_id)
);

CREATE TABLE room_events (
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

CREATE UNIQUE INDEX room_events_message_id
  ON room_events(room_id, message_id);

CREATE TABLE agent_sessions (
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  runtime_generation_id TEXT NOT NULL,
  seen_seq INTEGER NOT NULL DEFAULT 0,
  held_up_to_seq INTEGER,
  PRIMARY KEY (tenant_id, agent_id, room_id, runtime_generation_id)
);

CREATE TABLE room_workspace (
  room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE agent_system_prompts (
  agent_id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
