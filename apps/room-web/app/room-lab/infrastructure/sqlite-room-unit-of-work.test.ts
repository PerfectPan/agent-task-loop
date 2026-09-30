import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { AgentSessionId, RoomId } from '@rivus/agent-room';
import { SqliteRoomStreamStore } from './sqlite-room-unit-of-work.server';
import { SqliteRoomStore } from './sqlite-room-store.server';

const TENANT = 'local';

/** An in-memory library with one room row, the shape every store test needs. */
function library(): { store: SqliteRoomStore; roomId: RoomId } {
  const store = SqliteRoomStore.memory();
  const roomId: RoomId = { tenantId: TENANT, conversationId: 'r_aaaaaaaaaa' };
  store.db
    .prepare(`
    INSERT INTO rooms (id, title, goal, created_at, updated_at, last_opened_at)
    VALUES ('r_aaaaaaaaaa', '共享房间', NULL, '2026-09-28T00:00:00.000Z', '2026-09-28T00:00:00.000Z', '2026-09-28T00:00:00.000Z')
  `)
    .run();
  return { store, roomId };
}

describe('SqliteRoomStreamStore wake depth', () => {
  it("writes each event's wake depth and reads it back after a reopen", async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-room-unit-of-work-'));
    const store = SqliteRoomStore.open(root);
    const roomId: RoomId = { tenantId: TENANT, conversationId: 'r_aaaaaaaaaa' };
    store.db
      .prepare(`
      INSERT INTO rooms (id, title, goal, created_at, updated_at, last_opened_at)
      VALUES ('r_aaaaaaaaaa', '深度房间', NULL, '2026-09-28T00:00:00.000Z', '2026-09-28T00:00:00.000Z', '2026-09-28T00:00:00.000Z')
    `)
      .run();

    const stream = new SqliteRoomStreamStore(store.db, roomId);
    const codex: AgentSessionId = {
      tenantId: TENANT,
      agentId: 'codex',
      roomId,
      runtimeGenerationId: 'web-v1',
    };
    stream.ensureSession(codex);
    const admitted = await stream.admit({
      roomId,
      messageId: 'human:1',
      author: { kind: 'human', id: 'director' },
      kind: 'human',
      body: '比较三档价格',
      addressedTo: [],
    });
    const posted = await stream.speak({
      session: codex,
      body: '先看成本',
      addressedTo: [],
      readUpToSeq: admitted.event.seq,
      triggerSeq: admitted.event.seq,
    });
    if (posted.outcome !== 'posted') {
      throw new Error('the post should have gone through');
    }
    expect(posted.event.wakeDepth).toBe(admitted.event.wakeDepth + 1);
    expect(stream.inspectSession(codex)).toMatchObject({ seenSeq: posted.seq });

    // A second connection to the same file, not the process's own: the depths
    // have to come back from the column.
    const reopened = new DatabaseSync(join(root, 'rooms.sqlite'));
    const restored = new SqliteRoomStreamStore(reopened, roomId);
    const slice = await restored.readSlice(roomId, 0, { maxEvents: 100 });
    expect(
      slice.events.map((event) => ({
        seq: event.seq,
        kind: event.kind,
        authorId: event.author.id,
        wakeDepth: event.wakeDepth,
      })),
    ).toEqual([
      { seq: 1, kind: 'human', authorId: 'director', wakeDepth: 0 },
      { seq: 2, kind: 'posted', authorId: 'codex', wakeDepth: 1 },
    ]);
  });
});

describe('SqliteRoomStreamStore instances on one room', () => {
  /**
   * The two writers a private room actually runs: the room's own service
   * holds one stream for its lifetime, and every `room_dm` posts through a
   * fresh one. Both write the same rows, and neither may overwrite the other.
   */
  it("holds a speak against another instance's post instead of overwriting it", async () => {
    const { store, roomId } = library();
    const serviceView = store.stream(roomId.conversationId);
    const dmView = store.stream(roomId.conversationId);
    const claude: AgentSessionId = {
      tenantId: TENANT,
      agentId: 'claude',
      roomId,
      runtimeGenerationId: 'web-v1',
    };
    serviceView.ensureSession(claude);
    const admitted = await serviceView.admit({
      roomId,
      messageId: 'human:1',
      author: { kind: 'human', id: 'director' },
      kind: 'human',
      body: '你们俩私下对一下',
      addressedTo: [],
    });
    expect(admitted.outcome).toBe('admitted');

    // The gateway's endpoint post lands through the second instance.
    const dmPosted = await dmView.post({
      messageId: 'dm:r_aaaaaaaaaa:1:1',
      author: { kind: 'agent', id: 'codex' },
      body: '私下说',
      addressedTo: ['claude'],
      wakeDepth: 1,
    });
    expect(dmPosted.seq).toBe(2);

    // The service's speak — read up to seq 1 — fences on the post it never
    // cached: HELD, where the old cache would have re-used seq 2 and deleted
    // the dm's row on persist.
    const held = await serviceView.speak({
      session: claude,
      body: '我的结论',
      addressedTo: [],
      readUpToSeq: 1,
      triggerSeq: 1,
    });
    expect(held).toMatchObject({ outcome: 'held', newer: [{ seq: 2 }] });

    // Both instances read the same two events, and a speak that has read the
    // newer event lands beside it, not on top of it.
    for (const view of [serviceView, dmView]) {
      const slice = await view.readSlice(roomId, 0, { maxEvents: 10 });
      expect(slice.events.map((event) => event.seq)).toEqual([1, 2]);
    }
    const posted = await serviceView.speak({
      session: claude,
      body: '读完了，这是结论',
      addressedTo: [],
      readUpToSeq: 2,
      triggerSeq: 2,
    });
    if (posted.outcome !== 'posted') {
      throw new Error('the post should have gone through');
    }
    expect(posted.seq).toBe(3);
    const slice = await dmView.readSlice(roomId, 0, { maxEvents: 10 });
    expect(slice.events.map((event) => [event.seq, event.author.id])).toEqual([
      [1, 'director'],
      [2, 'codex'],
      [3, 'claude'],
    ]);
  });
});
