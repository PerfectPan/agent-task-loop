import { describe, expect, it } from 'vitest';
import { AgentSessionAggregate } from '../../src/agent-session/domain/agent-session';
import { completeSilentlyInSerial } from '../../src/room/domain/complete-silently-in-serial';
import { Room } from '../../src/room/domain/room';

const roomId = { tenantId: 'tenant', conversationId: 'conversation' };
const sessionId = {
  tenantId: 'tenant',
  agentId: 'bot-a',
  roomId,
  runtimeGenerationId: 'generation',
};

describe('completeSilentlyInSerial domain service', () => {
  it('completes silently when the caught-up session still matches the Room head', () => {
    const room = new Room(roomId);
    room.admit({
      roomId,
      messageId: 'human:1',
      author: { kind: 'human', id: 'director' },
      kind: 'human',
      body: 'first fact',
    }, '2026-08-30T00:00:00.000Z');
    const session = new AgentSessionAggregate(sessionId, { seenSeq: 1 });

    expect(completeSilentlyInSerial(room, session, 1)).toEqual({ outcome: 'silent' });
    expect(session.snapshot()).toEqual({ id: sessionId, seenSeq: 1 });
  });

  it('holds silence when a newer event arrives after the session caught up', () => {
    const room = new Room(roomId);
    room.admit({
      roomId,
      messageId: 'human:1',
      author: { kind: 'human', id: 'director' },
      kind: 'human',
      body: 'first fact',
    }, '2026-08-30T00:00:00.000Z');
    const session = new AgentSessionAggregate(sessionId, { seenSeq: 1 });
    room.admit({
      roomId,
      messageId: 'human:2',
      author: { kind: 'human', id: 'director' },
      kind: 'human',
      body: 'newer fact',
    }, '2026-08-30T00:01:00.000Z');

    expect(completeSilentlyInSerial(room, session, 1)).toMatchObject({
      outcome: 'held',
      heldUpToSeq: 2,
      newer: [{ body: 'newer fact' }],
    });
    expect(session.snapshot()).toMatchObject({ seenSeq: 1, heldUpToSeq: 2 });
  });
});
