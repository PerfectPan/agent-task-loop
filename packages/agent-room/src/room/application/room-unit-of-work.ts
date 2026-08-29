import type { AgentSessionAggregate } from '../../agent-session/domain/agent-session';
import type { AgentSessionId } from '../../agent-session/domain/model';
import type { RoomId } from '../domain/model';
import type { Room } from '../domain/room';

export interface RoomUnitOfWork {
  withRoom<T>(id: RoomId, work: (room: Room) => T): T;
  withRoomAndSession<T>(
    id: AgentSessionId,
    work: (room: Room, session: AgentSessionAggregate) => T,
  ): T;
}
