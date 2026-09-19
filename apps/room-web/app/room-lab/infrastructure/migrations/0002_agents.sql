-- Members become rows. The id is also the word after `@`; the colour is drawn
-- when the row is created and stays with it. Seeding this table is the second
-- half of this migration and lives in 0002_agents.seed.ts.

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  role TEXT NOT NULL,
  command TEXT NOT NULL,
  color INTEGER NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
