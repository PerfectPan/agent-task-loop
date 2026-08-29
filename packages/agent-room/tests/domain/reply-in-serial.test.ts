import { describe, expect, it } from 'vitest';
import { AgentSessionAggregate } from '../../src/agent-session/domain/agent-session';
import { replyInSerial } from '../../src/room/domain/reply-in-serial';
import { Room } from '../../src/room/domain/room';

const roomId = { tenantId: 'tenant', conversationId: 'conversation' };
const sessionId = {
  tenantId: 'tenant',
  agentId: 'bot-a',
  roomId,
  runtimeGenerationId: 'generation',
};

describe('replyInSerial domain service', () => {
  it('holds a second aggregate behind an unseen post', () => {
    const room = new Room(roomId);
    const first = new AgentSessionAggregate(sessionId);
    const second = new AgentSessionAggregate({ ...sessionId, agentId: 'bot-b' });

    expect(
      replyInSerial(room, first, { body: 'alpha' }, '2026-08-29T00:00:00.000Z'),
    ).toMatchObject({ outcome: 'posted', seq: 1 });
    expect(
      replyInSerial(room, second, { body: 'beta' }, '2026-08-29T00:01:00.000Z'),
    ).toMatchObject({ outcome: 'held', heldUpToSeq: 1 });
    expect(second.snapshot().heldUpToSeq).toBe(1);
  });

  it('rejects a session aggregate from another room', () => {
    const room = new Room(roomId);
    const foreign = new AgentSessionAggregate({
      ...sessionId,
      roomId: { tenantId: 'tenant', conversationId: 'other' },
    });
    expect(() =>
      replyInSerial(room, foreign, { body: 'wrong room' }, '2026-08-29T00:00:00.000Z'),
    ).toThrow(/different room/);
  });
});
