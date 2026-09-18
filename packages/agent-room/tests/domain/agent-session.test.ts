import { describe, expect, it } from 'vitest';
import { AgentSessionAggregate } from '../../src/agent-session/domain/agent-session';

const id = {
  tenantId: 'tenant',
  agentId: 'agent',
  roomId: { tenantId: 'tenant', conversationId: 'conversation' },
  runtimeGenerationId: 'generation',
};

describe('AgentSession aggregate', () => {
  it('keeps the seen cursor monotonic', () => {
    const session = new AgentSessionAggregate(id);
    session.advanceSeen(5);
    session.advanceSeen(3);
    expect(session.snapshot().seenSeq).toBe(5);
  });

  it('acks only the current hold and consumes it once', () => {
    const session = new AgentSessionAggregate(id);
    session.hold(7);
    expect(session.ackHold(6)).toBe(false);
    expect(session.ackHold(7)).toBe(true);
    expect(session.ackHold(7)).toBe(false);
    expect(session.snapshot()).toEqual({ id, seenSeq: 7 });
  });

  it('does not expose mutable aggregate identity', () => {
    const session = new AgentSessionAggregate(id);
    session.id.roomId.conversationId = 'forged';
    expect(session.id).toEqual(id);
  });

  it('does not keep a hold at or behind the seen cursor', () => {
    const session = new AgentSessionAggregate(id);
    session.advanceSeen(5);
    session.hold(5);
    expect(session.snapshot().heldUpToSeq).toBeUndefined();

    session.hold(8);
    session.advanceSeen(8);
    expect(session.snapshot().heldUpToSeq).toBeUndefined();
  });

  it('rejects an invalid persisted hold watermark', () => {
    expect(() => new AgentSessionAggregate(id, { seenSeq: 5, heldUpToSeq: 3 })).toThrow(
      /hold must be ahead/,
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1])(
    'rejects invalid sequence transitions: %s',
    invalidSeq => {
      const session = new AgentSessionAggregate(id);
      expect(() => session.advanceSeen(invalidSeq)).toThrow(/non-negative integer/);
      expect(() => session.hold(invalidSeq)).toThrow(/non-negative integer/);
      expect(() => session.ackHold(invalidSeq)).toThrow(/non-negative integer/);
      expect(() => session.recordPost(invalidSeq)).toThrow(/non-negative integer/);
      expect(session.snapshot()).toEqual({ id, seenSeq: 0 });
    },
  );

});
