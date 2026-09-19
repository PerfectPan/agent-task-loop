import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrationName, runMigrations } from './index';
import { createVersionOneLibrary } from '../testing/version-one-library';

function root(): string {
  return mkdtempSync(join(tmpdir(), 'rivus-room-migrations-'));
}

function tables(db: DatabaseSync): string[] {
  return (db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
  `).all() as unknown as Array<{ name: string }>).map(row => row.name);
}

function versions(db: DatabaseSync): number[] {
  return (db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as unknown as Array<{ version: number }>)
    .map(row => Number(row.version));
}

describe('runMigrations', () => {
  it('applies every version to a fresh library, in order', () => {
    const db = new DatabaseSync(':memory:');

    expect(runMigrations(db)).toEqual([1, 2]);
    expect(versions(db)).toEqual([1, 2]);
    expect(tables(db)).toEqual([
      'agent_sessions',
      'agent_system_prompts',
      'agents',
      'app_meta',
      'room_events',
      'room_members',
      'room_workspace',
      'rooms',
      'schema_migrations',
    ]);
    expect(MIGRATIONS.map(migrationName)).toEqual(['0001_rooms', '0002_agents']);
  });

  it('upgrades a version-1 library by running only what it is missing', () => {
    // A library from before members were rows: every version-1 table exists,
    // one room seats an agent this project does not ship.
    const file = createVersionOneLibrary(root(), db => {
      db.exec(`
        INSERT INTO rooms (id, title, goal, created_at, updated_at, last_opened_at)
        VALUES ('r_aaaaaaaaaa', '旧房间', NULL, '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z');
        INSERT INTO room_members (room_id, agent_id, seat_order)
        VALUES ('r_aaaaaaaaaa', 'inherited-one', 0);
      `);
    });
    const db = new DatabaseSync(file);
    expect(versions(db)).toEqual([1]);

    // Version 1 is not re-run — its CREATE TABLE would fail against the tables
    // that are already there, which is the whole point of recording versions.
    expect(runMigrations(db)).toEqual([2]);

    expect(versions(db)).toEqual([1, 2]);
    expect(tables(db)).toContain('agents');
    const seeded = db.prepare('SELECT id, role FROM agents ORDER BY position').all() as unknown as Array<{ id: string; role: string }>;
    expect(seeded.map(row => row.id)).toEqual(['claude', 'codex', 'opencode', 'dsh', 'inherited-one']);
    expect(seeded.at(-1)?.role).toBe('成员');
    // The room it was seated in is untouched.
    expect(db.prepare('SELECT agent_id FROM room_members').all()).toEqual([{ agent_id: 'inherited-one' }]);
  });

  it('is a no-op on a library that is already up to date', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const appliedAt = db.prepare('SELECT applied_at FROM schema_migrations WHERE version = 2').get();
    db.prepare('UPDATE agents SET command = ? WHERE id = ?').run('claude --edited', 'claude');

    expect(runMigrations(db)).toEqual([]);

    expect(versions(db)).toEqual([1, 2]);
    expect(db.prepare('SELECT applied_at FROM schema_migrations WHERE version = 2').get()).toEqual(appliedAt);
    expect(db.prepare('SELECT command FROM agents WHERE id = ?').get('claude'))
      .toEqual({ command: 'claude --edited' });
  });

  it('rolls a failing migration back and leaves the library on the last good version', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    // The real runner, one extra version: the transaction is what is under test.
    const migrations = [...MIGRATIONS, {
      version: 3,
      name: 'broken',
      up: (database: DatabaseSync) => {
        database.exec('CREATE TABLE half_applied (id TEXT PRIMARY KEY)');
        database.exec('THIS IS NOT SQL');
      },
    }];

    expect(() => runMigrations(db, { migrations })).toThrow('0003_broken failed and was rolled back');

    expect(versions(db)).toEqual([1, 2]);
    expect(tables(db)).not.toContain('half_applied');
  });
});
