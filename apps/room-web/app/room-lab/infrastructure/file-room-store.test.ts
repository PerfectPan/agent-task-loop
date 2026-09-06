import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SqliteRoomStore } from './sqlite-room-store.server';
import { RoomLabHost, runnableInventory } from '../application/room-lab-host.server';

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
