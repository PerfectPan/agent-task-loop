import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SqliteRoomStore } from './sqlite-room-store.server';
import { buildAgentSeedRows, DEFAULT_AGENT_SEEDS } from './agent-seed.server';
import { createVersionOneLibrary } from './testing/version-one-library';

function root(): string {
  return mkdtempSync(join(tmpdir(), 'rivus-room-agents-'));
}

describe('agents migration', () => {
  it('seeds one row per shipped agent in an empty library', () => {
    const store = SqliteRoomStore.open(root());
    const agents = store.agents.list();

    expect(agents.map(agent => agent.id)).toEqual(['claude', 'codex', 'opencode', 'dsh']);
    expect(agents.map(agent => agent.position)).toEqual([0, 1, 2, 3]);
    expect(agents.every(agent => agent.color >= 1 && agent.color <= 5)).toBe(true);
    expect(store.agents.get('opencode')?.command).toContain('NO_COLOR=1 opencode run');
  });

  it('adds a row for every id an existing library already seats', () => {
    const home = root();
    // A library at version 1: one room whose crew includes an id this project
    // does not ship, plus a system prompt for another.
    createVersionOneLibrary(home, db => {
      db.exec(`
        INSERT INTO rooms (id, title, goal, created_at, updated_at, last_opened_at)
        VALUES ('r_aaaaaaaaaa', '旧房间', NULL, '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z');
        INSERT INTO room_members (room_id, agent_id, seat_order) VALUES
          ('r_aaaaaaaaaa', 'inherited-one', 0),
          ('r_aaaaaaaaaa', 'codex', 1);
        INSERT INTO agent_system_prompts (agent_id, prompt, updated_at)
          VALUES ('inherited-two', '先给结论。', '2026-09-06T00:00:00.000Z');
      `);
    });

    // Opening the library runs whatever it is missing, and only that.
    const store = SqliteRoomStore.open(home);
    const agents = store.agents.list();

    expect(agents.map(agent => agent.id)).toEqual([
      'claude', 'codex', 'opencode', 'dsh', 'inherited-one', 'inherited-two',
    ]);
    expect(store.agents.get('inherited-one')).toMatchObject({
      label: 'inherited-one',
      role: '成员',
      command: 'inherited-one -p --no-session-persistence --output-format text',
    });
    // The old room keeps the crew it was saved with.
    expect(store.loadCatalog().get('r_aaaaaaaaaa').memberIds).toEqual(['inherited-one', 'codex']);
  });

  it('does not seed twice, and leaves an edited row alone', () => {
    const home = root();
    const first = SqliteRoomStore.open(home);
    first.db.prepare('UPDATE agents SET command = ? WHERE id = ?').run('claude --edited', 'claude');
    first.db.prepare('DELETE FROM agents WHERE id = ?').run('dsh');

    const reopened = SqliteRoomStore.open(home);
    expect(reopened.agents.get('claude')?.command).toBe('claude --edited');
    expect(reopened.agents.has('dsh')).toBe(false);
  });

  it('numbers positions in insertion order and draws every colour from 1…5', () => {
    const rows = buildAgentSeedRows(['legacy'], '2026-09-18T00:00:00.000Z', () => 2);

    expect(rows.map(row => row.position)).toEqual([0, 1, 2, 3, 4]);
    expect(rows.map(row => row.color)).toEqual([2, 2, 2, 2, 2]);
    expect(rows.at(-1)).toMatchObject({ id: 'legacy', role: '成员' });
    // An id the project already ships is not seeded a second time.
    expect(buildAgentSeedRows(['codex', 'codex'], '2026-09-18T00:00:00.000Z'))
      .toHaveLength(DEFAULT_AGENT_SEEDS.length);
  });
});
