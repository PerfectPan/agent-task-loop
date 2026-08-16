export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);
INSERT OR IGNORE INTO schema_meta (id, version) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  start_seat TEXT,
  max_tokens INTEGER NOT NULL DEFAULT 1 CHECK (max_tokens >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS template_seats (
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  seat TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (template_id, seat)
);

CREATE TABLE IF NOT EXISTS template_mail (
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  from_seat TEXT NOT NULL,
  to_seat TEXT NOT NULL,
  PRIMARY KEY (template_id, kind, from_seat, to_seat)
);

CREATE TABLE IF NOT EXISTS runs (
  key TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id),
  term INTEGER NOT NULL DEFAULT 0,
  max_tokens INTEGER NOT NULL DEFAULT 1 CHECK (max_tokens >= 1),
  status TEXT NOT NULL CHECK (status IN ('open', 'released')),
  supervisor_pid INTEGER,
  last_heartbeat_at TEXT,
  last_index INTEGER NOT NULL DEFAULT 0,
  goal TEXT,
  ref_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  run_key TEXT NOT NULL REFERENCES runs(key) ON DELETE CASCADE,
  seat TEXT NOT NULL,
  partition TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (run_key, seat)
);

CREATE TABLE IF NOT EXISTS members (
  run_key TEXT NOT NULL REFERENCES runs(key) ON DELETE CASCADE,
  seat TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('joined', 'left')),
  cmd TEXT,
  args_json TEXT,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  PRIMARY KEY (run_key, seat)
);

CREATE TABLE IF NOT EXISTS channel (
  run_key TEXT NOT NULL REFERENCES runs(key) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  term INTEGER NOT NULL,
  kind TEXT NOT NULL,
  mail_kind TEXT,
  from_seat TEXT,
  to_seat TEXT,
  body TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_key, idx),
  CHECK (
    (kind = 'mail' AND mail_kind IS NOT NULL)
    OR (kind <> 'mail' AND mail_kind IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS inbox_cursors (
  run_key TEXT NOT NULL REFERENCES runs(key) ON DELETE CASCADE,
  seat TEXT NOT NULL,
  last_read_idx INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_key, seat)
);

CREATE INDEX IF NOT EXISTS channel_mail_to_idx ON channel (run_key, kind, to_seat, idx);
CREATE INDEX IF NOT EXISTS runs_status ON runs (status);
`;
