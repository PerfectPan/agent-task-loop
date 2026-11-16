import { AgentSessionAggregate } from '../../agent-session/domain/agent-session';
import type { AgentSessionId } from '../../agent-session/domain/model';
import { assertSessionInRoom } from './session-guard';
import { Room } from './room';
import type { RoomSeq } from './model';

export interface PassCommand {
  session: AgentSessionId;
  /** The seq the turn actually read up to. Events past it stay ahead of the cursor. */
  readUpToSeq: RoomSeq;
}

export type PassResult = { outcome: 'passed' };

export type PassInput = Pick<PassCommand, 'readUpToSeq'>;

/**
 * Domain service for the pass write point: end a turn without a post. The
 * cursor moves to what the turn read and the outcome is never HELD; the
 * pending-wake rule brings the member back for anything it did not read.
 */
export function pass(room: Room, session: AgentSessionAggregate, input: PassInput): PassResult {
  assertSessionInRoom(room, session);
  session.advanceSeen(input.readUpToSeq);
  return { outcome: 'passed' };
}
