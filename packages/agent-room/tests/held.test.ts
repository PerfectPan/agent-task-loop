import { describe, expect, it } from 'vitest';
import { createMemoryRoomStreamStore } from '../src/index';

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
    const store = createMemoryRoomStreamStore();
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
  });
});

describe('readSlice', () => {
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
});
