import type { AgentSessionAggregate } from '../../agent-session/domain/agent-session';
import { RoomValidationError } from './errors';
import { sameRoomId } from './model';
import type { Room } from './room';

/**
 * The membership checks every room command opens with: the session must live in
 * this room, under this room's tenant.
 */
export function assertSessionInRoom(room: Room, session: AgentSessionAggregate): void {
  const sessionId = session.id;
  if (!sameRoomId(room.id, sessionId.roomId)) {
    throw new RoomValidationError('agent session belongs to a different room');
  }
  if (sessionId.tenantId !== room.id.tenantId) {
    throw new RoomValidationError('agent session tenant does not match the room tenant');
  }
}
