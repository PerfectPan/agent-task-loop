import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileRoomCatalogStore } from './file-room-catalog.server';
import { RoomLabHost } from '../application/room-lab-host.server';

describe('file Room persistence', () => {
  it('keeps rooms and messages after a new host is opened', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    const store = new FileRoomCatalogStore(root);
    const host = new RoomLabHost(store, {
      agentRunner: async () => ({ text: 'codex 建议先看竞品价', latencyMs: 1 }),
    });
    const created = await host.create({ title: 'Q3 定价方案', memberIds: ['codex'] });
    const service = host.open(created.roomId);
    await service.sendMessage('先比较三档价格', undefined, 'client:persist-1');
    await service.waitForIdle();

    const restored = new RoomLabHost(store, {
      agentRunner: async () => ({ text: 'unused', latencyMs: 1 }),
    });
    const snapshot = await restored.snapshot(created.roomId);
    expect(snapshot.title).toBe('Q3 定价方案');
    expect(snapshot.events[0]).toMatchObject({
      body: '先比较三档价格',
      messageId: 'client:persist-1',
    });
    expect(snapshot.catalog.map(room => room.title)).toEqual(['Q3 定价方案']);
  });

  it('does not rewrite lastOpened when snapshotting the same room', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-web-'));
    const store = new FileRoomCatalogStore(root);
    const host = new RoomLabHost(store, {
      agentRunner: async () => ({ text: 'ok', latencyMs: 1 }),
    });
    const created = await host.create({ title: '同一房间', memberIds: ['codex'] });
    const first = host.lastOpened()?.lastOpenedAt;
    await host.snapshot(created.roomId);
    expect(host.lastOpened()?.lastOpenedAt).toBe(first);
  });
});
