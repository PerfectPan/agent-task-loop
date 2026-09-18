import { describe, expect, it } from 'vitest';
import { MemoryRoomStreamStore, createMemoryRoomStreamStore, sessionKey } from '../src/index';

const room = { tenantId: 't1', conversationId: 'c1' };
const botA = {
  tenantId: 't1',
  agentId: 'bot-a',
  roomId: room,
  runtimeGenerationId: 'g1',
};
const botB = { ...botA, agentId: 'bot-b' };

describe('replyInSerial HELD', () => {
  it('posts the first reply and holds the second behind unseen posts', async () => {
    const store = createMemoryRoomStreamStore();
    const first = await store.replyInSerial({ session: botA, body: 'alpha' });
    const second = await store.replyInSerial({ session: botB, body: 'beta' });

    expect(first).toMatchObject({ outcome: 'posted', seq: 1 });
    expect(second.outcome).toBe('held');
    if (second.outcome === 'held') {
      expect(second.heldUpToSeq).toBe(1);
      expect(second.newer.map(event => event.body)).toEqual(['alpha']);
    }
    expect(await store.head(room)).toBe(1);
  });

  it('posts after a matching hold ack, and ignores a preemptive ack', async () => {
    const store = createMemoryRoomStreamStore();
    await store.replyInSerial({ session: botA, body: 'alpha' });
    const held = await store.replyInSerial({ session: botB, body: 'beta' });
    expect(held.outcome).toBe('held');

    const ignored = await store.replyInSerial({
      session: botB,
      body: 'beta',
      ackHeldUpToSeq: 99,
    });
    expect(ignored.outcome).toBe('held');

    const posted = await store.replyInSerial({
      session: botB,
      body: 'beta after catch-up',
      ackHeldUpToSeq: held.outcome === 'held' ? held.heldUpToSeq : 0,
    });
    expect(posted).toMatchObject({ outcome: 'posted', seq: 2 });
  });

  it('keeps transport idempotency separate from internal event identity', async () => {
    const store = new MemoryRoomStreamStore();
    await store.admit({
      roomId: room,
      messageId: `posted:${sessionKey(botA)}:2`,
      author: { kind: 'human', id: 'alice' },
      kind: 'human',
      body: 'same text as an internal naming convention',
    });
    const held = await store.replyInSerial({ session: botA, body: 'reply' });
    expect(held).toMatchObject({ outcome: 'held', heldUpToSeq: 1 });

    const posted = await store.replyInSerial({
      session: botA,
      body: 'reply',
      ackHeldUpToSeq: 1,
    });
    expect(posted).toMatchObject({ outcome: 'posted', seq: 2 });
    expect(store.inspectSession(botA)).toEqual({ id: botA, seenSeq: 2 });
  });

  it('holds when a human post is newer than seen', async () => {
    const store = createMemoryRoomStreamStore();
    await store.admit({
      roomId: room,
      messageId: 'h1',
      author: { kind: 'human', id: 'alice' },
      kind: 'human',
      body: 'please look',
    });
    const result = await store.replyInSerial({ session: botA, body: 'working' });
    expect(result.outcome).toBe('held');
    if (result.outcome === 'held') {
      expect(result.newer[0]?.kind).toBe('human');
    }
  });

  it('does not hold or advance seen for control-plane origin', async () => {
    const store = new MemoryRoomStreamStore();
    await store.admit({
      roomId: room,
      messageId: 'h1',
      author: { kind: 'human', id: 'alice' },
      kind: 'human',
      body: 'hello',
    });
    const result = await store.replyInSerial({
      session: botA,
      body: 'member-joined',
      origin: 'control-plane',
    });
    expect(result.outcome).toBe('posted');
    if (result.outcome === 'posted') {
      expect(result.seq).toBe(2);
    }
    const slice = await store.readSlice(room, 0, { maxEvents: 10 });
    expect(slice.events.map(event => event.kind)).toEqual(['human', 'control-plane']);
    expect(slice.head).toBe(2);
    expect(store.inspectSession(botA)).toBeUndefined();
  });

  it('does not deduplicate internal posts against transport ids', async () => {
    const store = createMemoryRoomStreamStore();
    const posted = await store.replyInSerial({ session: botA, body: 'internal' });
    expect(posted.outcome).toBe('posted');
    if (posted.outcome !== 'posted') return;

    const admitted = await store.admit({
      roomId: room,
      messageId: posted.event.messageId,
      author: { kind: 'human', id: 'alice' },
      kind: 'human',
      body: 'external with the same display id',
    });
    const duplicate = await store.admit({
      roomId: room,
      messageId: posted.event.messageId,
      author: { kind: 'human', id: 'alice' },
      kind: 'human',
      body: 'duplicate transport delivery',
    });

    expect(admitted).toMatchObject({ outcome: 'admitted', seq: 2 });
    expect(duplicate).toMatchObject({ outcome: 'duplicate', seq: 2 });
  });

  it('rolls back hold acknowledgement and append together when commit fails', async () => {
    let failCommit = false;
    const store = new MemoryRoomStreamStore({
      beforeCommit: () => {
        if (failCommit) throw new Error('commit failed');
      },
    });
    await store.replyInSerial({ session: botA, body: 'alpha' });
    const held = await store.replyInSerial({ session: botB, body: 'beta' });
    expect(held.outcome).toBe('held');
    if (held.outcome !== 'held') return;

    failCommit = true;
    await expect(
      store.replyInSerial({
        session: botB,
        body: 'beta after catch-up',
        ackHeldUpToSeq: held.heldUpToSeq,
      }),
    ).rejects.toThrow('commit failed');
    failCommit = false;

    expect(await store.head(room)).toBe(1);
    expect(store.inspectSession(botB)).toMatchObject({ seenSeq: 0, heldUpToSeq: 1 });
    await expect(
      store.replyInSerial({
        session: botB,
        body: 'beta after retry',
        ackHeldUpToSeq: held.heldUpToSeq,
      }),
    ).resolves.toMatchObject({ outcome: 'posted', seq: 2 });
  });
});

describe('readSlice', () => {
  it('does not invoke the commit hook for head or slice queries', async () => {
    let commits = 0;
    const store = new MemoryRoomStreamStore({
      beforeCommit: () => {
        commits += 1;
      },
    });

    await expect(store.head(room)).resolves.toBe(0);
    await expect(store.readSlice(room, 0, { maxEvents: 10 })).resolves.toEqual({
      events: [],
      head: 0,
    });
    expect(commits).toBe(0);
  });

  it('returns events after seq within the event and char budgets', async () => {
    const store = createMemoryRoomStreamStore();
    await store.admit({
      roomId: room,
      messageId: 'm1',
      author: { kind: 'human', id: 'alice' },
      kind: 'human',
      body: 'aa',
    });
    await store.admit({
      roomId: room,
      messageId: 'm2',
      author: { kind: 'human', id: 'alice' },
      kind: 'human',
      body: 'bbbb',
    });
    await store.admit({
      roomId: room,
      messageId: 'm3',
      author: { kind: 'human', id: 'alice' },
      kind: 'human',
      body: 'cc',
    });

    const sliced = await store.readSlice(room, 1, { maxEvents: 2, maxChars: 5 });
    expect(sliced.head).toBe(3);
    expect(sliced.events.map(event => event.body)).toEqual(['bbbb']);
  });

  it('does not exceed maxChars for an oversized first event', async () => {
    const store = createMemoryRoomStreamStore();
    await store.admit({
      roomId: room,
      messageId: 'oversized',
      author: { kind: 'human', id: 'alice' },
      kind: 'human',
      body: 'too long',
    });

    await expect(store.readSlice(room, 0, { maxEvents: 10, maxChars: 3 })).resolves.toEqual({
      events: [],
      head: 1,
    });
  });
});
