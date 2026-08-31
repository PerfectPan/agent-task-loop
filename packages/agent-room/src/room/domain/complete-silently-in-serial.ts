import { AgentSessionAggregate } from '../../agent-session/domain/agent-session';
import type { AgentSessionId } from '../../agent-session/domain/model';
import { RoomValidationError } from './errors';
import { sameRoomId } from './model';
import { Room } from './room';
import type { RoomEvent, RoomSeq } from './model';

export interface CompleteSilentlyCommand {
  session: AgentSessionId;
  ackHeldUpToSeq: RoomSeq;
}

export type CompleteSilentlyResult =
  | { outcome: 'silent' }
  | { outcome: 'held'; heldUpToSeq: RoomSeq; newer: RoomEvent[] };

/** Domain service for atomically completing a caught-up turn without posting. */
export function completeSilentlyInSerial(
  room: Room,
  session: AgentSessionAggregate,
  ackHeldUpToSeq: RoomSeq,
): CompleteSilentlyResult {
  const sessionId = session.id;
  if (!sameRoomId(room.id, sessionId.roomId)) {
    throw new RoomValidationError('agent session belongs to a different room');
  }
  if (sessionId.tenantId !== room.id.tenantId) {
    throw new RoomValidationError('agent session tenant does not match the room tenant');
  }

  session.ackHold(ackHeldUpToSeq);
  const newer = room.eventsAfter(session.seenSeq, sessionId.agentId);
  if (newer.length > 0) {
    const heldUpToSeq = newer.at(-1)!.seq;
    session.hold(heldUpToSeq);
    return { outcome: 'held', heldUpToSeq, newer };
  }
  return { outcome: 'silent' };
}
