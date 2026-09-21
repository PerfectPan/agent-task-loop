import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { SqliteRoomStore } from './sqlite-room-store.server';
import { RoomLabHost, runnableInventory } from '../application/room-lab-host.server';
import { DEFAULT_AGENT_SYSTEM_PROMPT } from './migrations/0003_agent_system_prompt.seed';

describe('sqlite Room persistence', () => {
  it('keeps rooms and messages after a new host is opened', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    const host = new RoomLabHost(SqliteRoomStore.open(root), {
      agentRunner: async () => ({ text: 'codex 建议先看竞品价', latencyMs: 1 }),
      listAgents: runnableInventory,
    });
    const created = await host.create({ title: 'Q3 定价方案', memberIds: ['codex'] });
    const service = host.open(created.roomId);
    await service.sendMessage('先比较三档价格', undefined, 'client:persist-1');
    await service.waitForIdle();

    const restored = new RoomLabHost(SqliteRoomStore.open(root), {
      agentRunner: async () => ({ text: 'unused', latencyMs: 1 }),
      listAgents: runnableInventory,
    });
    const snapshot = await restored.snapshot(created.roomId);
    expect(snapshot.title).toBe('Q3 定价方案');
    expect(snapshot.events[0]).toMatchObject({
      body: '先比较三档价格',
      messageId: 'client:persist-1',
    });
    expect(snapshot.catalog.map(room => room.title)).toEqual(['Q3 定价方案']);
    expect(existsSync(join(root, 'rooms.sqlite'))).toBe(true);
  });

  it('keeps catalog order by creation time after a later room is opened', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    const host = new RoomLabHost(SqliteRoomStore.open(root), {
      agentRunner: async () => ({ text: 'ok', latencyMs: 1 }),
      listAgents: runnableInventory,
    });
    const first = await host.create({ title: 'Q3 定价方案', memberIds: ['codex'] });
    const second = await host.create({ title: 'README 改写', memberIds: ['codex'] });
    const snapshot = await host.snapshot(first.roomId);
    expect(host.list().map(room => room.id)).toEqual([first.roomId, second.roomId]);
    expect(snapshot.catalog.map(room => room.title)).toEqual(['Q3 定价方案', 'README 改写']);
  });

  it('does not rewrite lastOpened when snapshotting the same room', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    const host = new RoomLabHost(SqliteRoomStore.open(root), {
      agentRunner: async () => ({ text: 'ok', latencyMs: 1 }),
      listAgents: runnableInventory,
    });
    const created = await host.create({ title: '同一房间', memberIds: ['codex'] });
    const first = host.lastOpened()?.lastOpenedAt;
    await host.snapshot(created.roomId);
    expect(host.lastOpened()?.lastOpenedAt).toBe(first);
  });

  it('persists a system prompt and prepends it on the real agent invoke path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    const prompts: string[] = [];
    const host = new RoomLabHost(SqliteRoomStore.open(root), {
      agentRunner: async (_agentId, prompt) => {
        prompts.push(prompt);
        return { text: '收到', latencyMs: 1 };
      },
      listAgents: runnableInventory,
    });
    const created = await host.create({ title: 'Q3 定价方案', memberIds: ['codex'] });
    host.saveSystemPrompt('codex', '  SENTINEL_SYS_PROMPT  ');
    const restored = new RoomLabHost(SqliteRoomStore.open(root), {
      agentRunner: async (_agentId, prompt) => {
        prompts.push(prompt);
        return { text: '收到', latencyMs: 1 };
      },
      listAgents: runnableInventory,
    });
    expect(restored.agentDesk().agents.find(agent => agent.id === 'codex')?.systemPrompt).toBe('SENTINEL_SYS_PROMPT');
    restored.saveSystemPrompt('codex', '   ');
    // The row stays; it just carries nothing to prepend.
    expect(restored.agentDesk().agents.find(agent => agent.id === 'codex')?.systemPrompt).toBe('');
    restored.saveSystemPrompt('codex', 'SENTINEL_SYS_PROMPT');
    await restored.open(created.roomId).sendMessage('比较三档价格', undefined, 'client:sys-1');
    await restored.open(created.roomId).waitForIdle();
    expect(prompts.at(-1)).toContain('SENTINEL_SYS_PROMPT');
    expect(prompts.at(-1)).toContain('比较三档价格');
  });

  it('prepends the row\'s seeded prompt, and nothing once it is emptied', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    const prompts: string[] = [];
    const host = new RoomLabHost(SqliteRoomStore.open(root), {
      agentRunner: async (_agentId, prompt) => {
        prompts.push(prompt);
        return { text: '收到', latencyMs: 1 };
      },
      listAgents: runnableInventory,
    });
    const created = await host.create({ title: 'Q3 定价方案', memberIds: ['codex'] });
    await host.open(created.roomId).sendMessage('比较三档价格', undefined, 'client:sys-none');
    await host.open(created.roomId).waitForIdle();

    // Every row is seeded with a default, so a turn carries it without anyone
    // having saved anything.
    expect(prompts.at(-1)?.startsWith(DEFAULT_AGENT_SYSTEM_PROMPT)).toBe(true);
    // Nothing sits between the identity line and the transcript: the room's
    // half of the turn is facts, and behaviour arrived from the row above it.
    const roomHalf = prompts.at(-1)!.slice(DEFAULT_AGENT_SYSTEM_PROMPT.length + 2);
    expect(roomHalf.startsWith('You are Codex, addressed as @codex in a 1-agent Room.\n\nRoom events:'))
      .toBe(true);

    host.saveSystemPrompt('codex', '');
    await host.open(created.roomId).sendMessage('再比一次', undefined, 'client:sys-none-2');
    await host.open(created.roomId).waitForIdle();
    expect(prompts.at(-1)?.startsWith('You are Codex, addressed as @codex')).toBe(true);
  });

  it('uses a saved system prompt on the next turn, without reopening the library', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    const prompts: string[] = [];
    const host = new RoomLabHost(SqliteRoomStore.open(root), {
      agentRunner: async (_agentId, prompt) => {
        prompts.push(prompt);
        return { text: '收到', latencyMs: 1 };
      },
      listAgents: runnableInventory,
    });
    const created = await host.create({ title: 'Q3 定价方案', memberIds: ['codex'] });

    // Saving re-reads the table, so the same host — the same process the page
    // is being served from — sees the new prompt on the very next turn.
    host.saveSystemPrompt('codex', 'SENTINEL_LIVE_PROMPT');
    expect(host.agents.get('codex')?.systemPrompt).toBe('SENTINEL_LIVE_PROMPT');
    expect(host.agentDesk().agents.find(agent => agent.id === 'codex')?.systemPrompt)
      .toBe('SENTINEL_LIVE_PROMPT');

    await host.open(created.roomId).sendMessage('比较三档价格', undefined, 'client:live-1');
    await host.open(created.roomId).waitForIdle();
    expect(prompts.at(-1)?.startsWith('SENTINEL_LIVE_PROMPT')).toBe(true);
  });

  it('re-reads the agents table when the desk is rescanned', () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    const host = new RoomLabHost(SqliteRoomStore.open(root), { listAgents: runnableInventory });
    expect(host.agents.get('dsh')?.command).toBe('NO_COLOR=1 dsh --profile headless');

    // Someone edits the row with sqlite3 while the server is running: a second
    // connection to the same file, not this host's own.
    const editor = new DatabaseSync(join(root, 'rooms.sqlite'));
    editor.prepare('UPDATE agents SET command = ?, label = ? WHERE id = ?')
      .run('dsh --profile other', 'DSH 2', 'dsh');
    editor.close();
    expect(host.agents.get('dsh')?.command).toBe('NO_COLOR=1 dsh --profile headless');

    const inventory = host.refreshInventory();

    expect(host.agents.get('dsh')?.command).toBe('dsh --profile other');
    expect(inventory.find(agent => agent.id === 'dsh')).toMatchObject({
      label: 'DSH 2',
      command: 'dsh --profile other',
    });
  });

  it('lists which rooms an agent is seated in', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    const host = new RoomLabHost(SqliteRoomStore.open(root), {
      agentRunner: async () => ({ text: 'ok', latencyMs: 1 }),
      listAgents: runnableInventory,
    });
    const created = await host.create({ title: 'Q3 定价方案', memberIds: ['codex'] });
    const desk = host.agentDesk();
    expect(desk.agents.find(agent => agent.id === 'codex')?.seatedIn).toEqual([
      { id: created.roomId, title: 'Q3 定价方案' },
    ]);
    expect(desk.agents.find(agent => agent.id === 'claude')?.seatedIn).toEqual([]);
  });

  it('keeps a room\'s stored crew when one of its agents has no row', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    const host = new RoomLabHost(SqliteRoomStore.open(root), { listAgents: runnableInventory });
    const crew = await host.create({ title: '两人房', memberIds: ['codex', 'dsh'] });
    const other = await host.create({ title: '另一间', memberIds: ['codex'] });

    // A row removed outside this process: `room_members` has no foreign key to
    // `agents`, so the seating is left behind and only the catalog filters it.
    const db = new DatabaseSync(join(root, 'rooms.sqlite'));
    db.prepare('DELETE FROM agents WHERE id = ?').run('dsh');
    db.close();

    // Switching rooms is enough to write the catalog back. `other` was created
    // last, so it is already the last opened; opening `crew` is the switch.
    const reopened = new RoomLabHost(SqliteRoomStore.open(root), { listAgents: runnableInventory });
    expect(reopened.lastOpened()?.id).toBe(other.roomId);
    await reopened.snapshot(crew.roomId);

    const check = new DatabaseSync(join(root, 'rooms.sqlite'));
    const seated = check.prepare(
      'SELECT agent_id FROM room_members WHERE room_id = ? ORDER BY seat_order',
    ).all(crew.roomId) as unknown as { agent_id: string }[];
    check.close();

    expect(seated.map(row => row.agent_id)).toEqual(['codex', 'dsh']);
  });

  it('seats a room again once the missing agent row comes back', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    const host = new RoomLabHost(SqliteRoomStore.open(root), { listAgents: runnableInventory });
    const crew = await host.create({ title: '两人房', memberIds: ['codex', 'dsh'] });

    const db = new DatabaseSync(join(root, 'rooms.sqlite'));
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get('dsh') as unknown as Record<string, unknown>;
    db.prepare('DELETE FROM agents WHERE id = ?').run('dsh');
    db.close();

    const without = new RoomLabHost(SqliteRoomStore.open(root), { listAgents: runnableInventory });
    expect((await without.snapshot(crew.roomId)).activeAgentIds).toEqual(['codex']);

    const restore = new DatabaseSync(join(root, 'rooms.sqlite'));
    restore.prepare(`
      INSERT INTO agents (id, label, role, command, color, position, created_at, system_prompt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id as string, row.label as string, row.role as string, row.command as string,
      row.color as number, row.position as number, row.created_at as string,
      row.system_prompt as string,
    );
    restore.close();

    const back = new RoomLabHost(SqliteRoomStore.open(root), { listAgents: runnableInventory });
    expect((await back.snapshot(crew.roomId)).activeAgentIds).toEqual(['codex', 'dsh']);
  });

  it('sets connection pragmas when opening a library', () => {
    // Pragmas are per-connection; migration SQL cannot set them, so opening
    // must.
    const store = SqliteRoomStore.open(mkdtempSync(join(tmpdir(), 'rivus-room-web-')));
    expect(store.db.prepare('PRAGMA foreign_keys').get()).toMatchObject({ foreign_keys: 1 });
    expect(store.db.prepare('PRAGMA busy_timeout').get()).toMatchObject({ timeout: 5000 });
  });

  it('imports a legacy JSON catalog into sqlite once', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    mkdirSync(join(root, 'rooms', 'r_aaaaaaaaaa'), { recursive: true });
    writeFileSync(join(root, 'catalog.json'), JSON.stringify({
      version: 1,
      rooms: [{
        id: 'r_aaaaaaaaaa',
        title: 'Q3 定价方案',
        createdAt: '2026-09-06T01:00:00.000Z',
        updatedAt: '2026-09-06T01:00:00.000Z',
        lastOpenedAt: '2026-09-06T01:00:00.000Z',
        memberIds: ['codex'],
      }],
      lastOpenedId: 'r_aaaaaaaaaa',
    }));
    writeFileSync(join(root, 'rooms', 'r_aaaaaaaaaa', 'events.json'), JSON.stringify([{
      seq: 1,
      roomId: { tenantId: 'local', conversationId: 'r_aaaaaaaaaa' },
      messageId: 'legacy:1',
      author: { kind: 'human', id: 'director' },
      kind: 'human',
      body: '旧文件里的一句',
      origin: 'endpoint',
      addressedTo: [],
      at: '2026-09-06T01:01:00.000Z',
    }]));
    const host = new RoomLabHost(SqliteRoomStore.open(root), {
      agentRunner: async () => ({ text: 'ok', latencyMs: 1 }),
      listAgents: runnableInventory,
    });
    const snapshot = await host.snapshot('r_aaaaaaaaaa');
    expect(snapshot.title).toBe('Q3 定价方案');
    expect(snapshot.events[0]).toMatchObject({ body: '旧文件里的一句', messageId: 'legacy:1' });
  });
});
