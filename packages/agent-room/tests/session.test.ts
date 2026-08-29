import { describe, expect, it } from 'vitest';
import {
  AgentSessionAggregate,
  AgentSessionValidationError,
  MemoryRoomStreamStore,
  sessionKey,
} from '../src/index';

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

  it('uses collision-free session identities', () => {
    const left = { ...session, agentId: 'bot::a', runtimeGenerationId: 'gen' };
    const right = { ...session, agentId: 'bot', runtimeGenerationId: 'a::gen' };
    expect(sessionKey(left)).not.toBe(sessionKey(right));

    const store = new MemoryRoomStreamStore();
    store.advanceSeen(left, 3);
    store.advanceSeen(right, 7);
    expect(store.inspectSession(left)?.seenSeq).toBe(3);
    expect(store.inspectSession(right)?.seenSeq).toBe(7);
  });

  it('keeps seen and hold watermarks monotonic', () => {
    const store = new MemoryRoomStreamStore();
    store.advanceSeen(session, 5);
    expect(store.advanceSeen(session, 3).seenSeq).toBe(5);

    store.hold(session, 9);
    expect(store.hold(session, 7).heldUpToSeq).toBe(9);
    expect(store.advanceSeen(session, 9).heldUpToSeq).toBeUndefined();
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

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1])(
    'rejects invalid sequence transitions: %s',
    invalidSeq => {
      const aggregate = new AgentSessionAggregate(session);
      expect(() => aggregate.advanceSeen(invalidSeq)).toThrow(AgentSessionValidationError);
      expect(() => aggregate.hold(invalidSeq)).toThrow(AgentSessionValidationError);
      expect(() => aggregate.ackHold(invalidSeq)).toThrow(AgentSessionValidationError);
      expect(aggregate.snapshot()).toEqual({ id: session, seenSeq: 0 });
    },
  );
});
