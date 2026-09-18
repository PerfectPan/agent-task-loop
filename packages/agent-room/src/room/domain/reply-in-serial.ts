import { AgentSessionAggregate } from '../../agent-session/domain/agent-session';
import { sessionKey, type AgentSessionId } from '../../agent-session/domain/model';
import { RoomValidationError } from './errors';
import { sameRoomId } from './model';
import { Room } from './room';
import type { RoomEvent, RoomSeq } from './model';

export interface RoomReplyCommand {
  session: AgentSessionId;
  body: string;
  origin?: 'agent' | 'control-plane';
  ackHeldUpToSeq?: RoomSeq;
}

export type RoomReplyResult =
  | { outcome: 'posted'; seq: RoomSeq; event: RoomEvent }
  | { outcome: 'held'; heldUpToSeq: RoomSeq; newer: RoomEvent[] };

export type ReplyInSerialInput = Pick<RoomReplyCommand, 'body' | 'ackHeldUpToSeq'>;

/** Domain service for the write-point HELD rule spanning Room and AgentSession. */
export function replyInSerial(
  room: Room,
  session: AgentSessionAggregate,
  input: ReplyInSerialInput,
  at: string,
): RoomReplyResult {
  const sessionId = session.id;
  if (!sameRoomId(room.id, sessionId.roomId)) {
    throw new RoomValidationError('agent session belongs to a different room');
  }
  if (sessionId.tenantId !== room.id.tenantId) {
    throw new RoomValidationError('agent session tenant does not match the room tenant');
  }

  if (input.ackHeldUpToSeq !== undefined) session.ackHold(input.ackHeldUpToSeq);
  const newer = room.eventsAfter(session.seenSeq, sessionId.agentId);
  if (newer.length > 0) {
    const heldUpToSeq = newer.at(-1)!.seq;
    session.hold(heldUpToSeq);
    return { outcome: 'held', heldUpToSeq, newer };
  }

  const event = room.post(
    {
      messageId: `posted:${sessionKey(sessionId)}:${room.head + 1}`,
      author: { kind: 'agent', id: sessionId.agentId },
      kind: 'posted',
      body: input.body,
      origin: 'endpoint',
      addressedTo: [],
    },
    at,
  );
  session.recordPost(event.seq);
  return { outcome: 'posted', seq: event.seq, event };
}
