import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrationName, runMigrations } from './index';
import {
  createVersionOneLibrary,
  createVersionTwoLibrary,
} from '../testing/old-libraries';
import { DEFAULT_AGENT_SYSTEM_PROMPT } from './0003_agent_system_prompt.seed';

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

    expect(runMigrations(db)).toEqual([1, 2, 3]);
    expect(versions(db)).toEqual([1, 2, 3]);
    // agent_system_prompts is created by version 1 and retired by version 3,
    // so a library that runs the whole chain never ends up holding it.
    expect(tables(db)).toEqual([
      'agent_sessions',
      'agents',
      'app_meta',
      'room_events',
      'room_members',
      'room_workspace',
      'rooms',
      'schema_migrations',
    ]);
    expect(MIGRATIONS.map(migrationName)).toEqual([
      '0001_rooms',
      '0002_agents',
      '0003_agent_system_prompt',
    ]);
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
    expect(runMigrations(db)).toEqual([2, 3]);

    expect(versions(db)).toEqual([1, 2, 3]);
    expect(tables(db)).toContain('agents');
    const seeded = db.prepare('SELECT id, role FROM agents ORDER BY position').all() as unknown as Array<{ id: string; role: string }>;
    expect(seeded.map(row => row.id)).toEqual(['claude', 'codex', 'opencode', 'dsh', 'inherited-one']);
    expect(seeded.at(-1)?.role).toBe('成员');
    // The room it was seated in is untouched.
    expect(db.prepare('SELECT agent_id FROM room_members').all()).toEqual([{ agent_id: 'inherited-one' }]);
  });

  it('upgrades a version-2 library, moving what the old prompt table held', () => {
    // Members are already rows here, but their instructions still live in
    // agent_system_prompts: one member has one, one has whitespace, one has
    // none at all.
    const file = createVersionTwoLibrary(root(), db => {
      db.exec(`
        INSERT INTO agent_system_prompts (agent_id, prompt, updated_at) VALUES
          ('codex', '先给结论，再给依据。', '2026-09-18T00:00:00.000Z'),
          ('dsh', '   ', '2026-09-18T00:00:00.000Z');
      `);
    });
    const db = new DatabaseSync(file);
    expect(versions(db)).toEqual([1, 2]);

    expect(runMigrations(db)).toEqual([3]);

    const rows = db.prepare('SELECT id, system_prompt FROM agents ORDER BY position')
      .all() as unknown as Array<{ id: string; system_prompt: string }>;
    const promptOf = new Map(rows.map(row => [row.id, row.system_prompt]));
    // What was saved is kept, verbatim.
    expect(promptOf.get('codex')).toBe('先给结论，再给依据。');
    // Whitespace was never an instruction, so that row starts from the default.
    expect(promptOf.get('dsh')).toBe(DEFAULT_AGENT_SYSTEM_PROMPT);
    expect(promptOf.get('claude')).toBe(DEFAULT_AGENT_SYSTEM_PROMPT);
    expect([...promptOf.values()].every(prompt => prompt.length > 0)).toBe(true);
    expect(tables(db)).not.toContain('agent_system_prompts');
  });

  it('upgrades a version-2 library whose prompt table is empty', () => {
    const file = createVersionTwoLibrary(root());
    const db = new DatabaseSync(file);

    expect(runMigrations(db)).toEqual([3]);

    const rows = db.prepare('SELECT system_prompt FROM agents').all() as unknown as Array<{ system_prompt: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.system_prompt === DEFAULT_AGENT_SYSTEM_PROMPT)).toBe(true);
    expect(tables(db)).not.toContain('agent_system_prompts');
  });

  it('is a no-op on a library that is already up to date', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const appliedAt = db.prepare('SELECT applied_at FROM schema_migrations WHERE version = 3').get();
    db.prepare('UPDATE agents SET command = ?, system_prompt = ? WHERE id = ?')
      .run('claude --edited', '只说风险。', 'claude');

    expect(runMigrations(db)).toEqual([]);

    expect(versions(db)).toEqual([1, 2, 3]);
    expect(db.prepare('SELECT applied_at FROM schema_migrations WHERE version = 3').get()).toEqual(appliedAt);
    // An edited row is not re-seeded, and an edited prompt is not overwritten.
    expect(db.prepare('SELECT command, system_prompt FROM agents WHERE id = ?').get('claude'))
      .toEqual({ command: 'claude --edited', system_prompt: '只说风险。' });
  });

  it('rolls a failing migration back and leaves the library on the last good version', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    // The real runner, one extra version: the transaction is what is under test.
    const migrations = [...MIGRATIONS, {
      version: 4,
      name: 'broken',
      up: (database: DatabaseSync) => {
        database.exec('CREATE TABLE half_applied (id TEXT PRIMARY KEY)');
        database.exec('THIS IS NOT SQL');
      },
    }];

    expect(() => runMigrations(db, { migrations })).toThrow('0004_broken failed and was rolled back');

    expect(versions(db)).toEqual([1, 2, 3]);
    expect(tables(db)).not.toContain('half_applied');
  });
});
