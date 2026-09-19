import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { seedAgents } from './0002_agents.seed';

/**
 * The library's schema as an ordered list of versions, the way Flyway and
 * golang-migrate hold one: each version is applied at most once, in order, and
 * `schema_migrations` records which ones a given library has seen. A version
 * already recorded is never re-run, which is why the SQL files can say
 * `CREATE TABLE` rather than `CREATE TABLE IF NOT EXISTS` — the statement is a
 * change from one known state to the next, not a description of the end state.
 *
 * Connection settings (`foreign_keys`, `busy_timeout`, `journal_mode`) are not
 * migrations: they have to be set on every connection, so they stay with the
 * store that opens one.
 */
export interface Migration {
  version: number;
  name: string;
  up(db: DatabaseSync): void;
}

/**
 * Read at module load, so the SQL is part of the server bundle's own directory
 * rather than something the process has to find at runtime.
 */
const ROOMS_SQL = readFileSync(new URL('./0001_rooms.sql', import.meta.url), 'utf8');
const AGENTS_SQL = readFileSync(new URL('./0002_agents.sql', import.meta.url), 'utf8');

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'rooms',
    up: db => db.exec(ROOMS_SQL),
  },
  {
    version: 2,
    name: 'agents',
    up: db => {
      db.exec(AGENTS_SQL);
      seedAgents(db);
    },
  },
];

const SCHEMA_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

/**
 * Applies every pending migration in version order, each inside its own
 * transaction: a version is recorded only if its whole `up` committed, so a
 * failure leaves the library on the last version that fully applied rather
 * than half-way into the next one. Returns the versions this call applied,
 * which is empty on an up-to-date library.
 */
export function runMigrations(
  db: DatabaseSync,
  options: {
    /** Defaults to this library's own list; a test may pass its own. */
    migrations?: readonly Migration[];
    now?: () => string;
  } = {},
): number[] {
  const migrations = options.migrations ?? MIGRATIONS;
  const now = options.now ?? (() => new Date().toISOString());
  db.exec(SCHEMA_MIGRATIONS);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as unknown as Array<{ version: number }>)
      .map(row => Number(row.version)),
  );
  const pending = [...migrations]
    .sort((left, right) => left.version - right.version)
    .filter(migration => !applied.has(migration.version));

  const record = db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)');
  for (const migration of pending) {
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      record.run(migration.version, now());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(
        `Room migration ${migrationName(migration)} failed and was rolled back`,
        { cause: error },
      );
    }
  }
  return pending.map(migration => migration.version);
}

export function migrationName(migration: Migration): string {
  return `${String(migration.version).padStart(4, '0')}_${migration.name}`;
}
