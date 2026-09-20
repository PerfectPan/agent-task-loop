import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, runMigrations } from '../migrations';

/**
 * A library as it stood before members were rows: migration 1 applied and
 * recorded, nothing else. The version-1 DDL from git is not reachable from a
 * test, so it is reproduced the only honest way — by applying the first
 * migration, which is that DDL.
 */
export function createVersionOneLibrary(
  root: string,
  fill: (db: DatabaseSync) => void = () => {},
): string {
  const file = join(root, 'rooms.sqlite');
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  MIGRATIONS[0]!.up(db);
  db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)')
    .run('2026-09-14T19:27:31.456Z');
  fill(db);
  db.close();
  return file;
}

/**
 * A library as it stood while members were rows but their instructions were
 * still a separate table: the same runner, stopped after version 2.
 */
export function createVersionTwoLibrary(
  root: string,
  fill: (db: DatabaseSync) => void = () => {},
): string {
  const file = join(root, 'rooms.sqlite');
  const db = new DatabaseSync(file);
  runMigrations(db, { migrations: MIGRATIONS.filter(migration => migration.version <= 2) });
  fill(db);
  db.close();
  return file;
}
