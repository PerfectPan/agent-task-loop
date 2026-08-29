import { describe, expect, it } from 'vitest';
import { MemoryRoomStreamStore } from '../src/index';

const room = { tenantId: 't1', conversationId: 'c1' };
const session = {
  tenantId: 't1',
  agentId: 'bot-a',
  roomId: room,
  runtimeGenerationId: 'gen-1',
};

describe('AgentSession seen / hold', () => {
  it('creates a session at seenSeq 0', () => {
    const store = new MemoryRoomStreamStore();
    expect(store.inspectSession(session)).toBeUndefined();
    expect(store.ensureSession(session)).toEqual({ id: session, seenSeq: 0 });
    expect(store.inspectSession(session)).toEqual({ id: session, seenSeq: 0 });
  });

  it('isolates sessions by agent and runtime generation', () => {
    const store = new MemoryRoomStreamStore();
    store.advanceSeen(session, 4);
    store.advanceSeen({ ...session, agentId: 'bot-b' }, 2);
    store.advanceSeen({ ...session, runtimeGenerationId: 'gen-2' }, 9);

    expect(store.inspectSession(session)?.seenSeq).toBe(4);
    expect(store.inspectSession({ ...session, agentId: 'bot-b' })?.seenSeq).toBe(2);
    expect(store.inspectSession({ ...session, runtimeGenerationId: 'gen-2' })?.seenSeq).toBe(9);
  });

  it('acks a hold only when the watermark matches, once', () => {
    const store = new MemoryRoomStreamStore();
    store.hold(session, 7);

    expect(store.ackHold(session, 6)).toBe(false);
    expect(store.inspectSession(session)?.heldUpToSeq).toBe(7);

    expect(store.ackHold(session, 7)).toBe(true);
    expect(store.inspectSession(session)?.heldUpToSeq).toBeUndefined();

    expect(store.ackHold(session, 7)).toBe(false);
  });

  it('ignores a preemptive hold ack', () => {
    const store = new MemoryRoomStreamStore();
    expect(store.ackHold(session, 3)).toBe(false);
    expect(store.inspectSession(session)).toBeUndefined();
  });
});
