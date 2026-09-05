import { ROOM_AGENT_ROSTER } from '../../domain/agent-roster';
import type { RoomLabState } from '../../read-model';

export function roomFixture(overrides: Partial<RoomLabState> = {}): RoomLabState {
  return {
    roomId: 'local/web-room', epoch: 'test-epoch', head: 0, revision: 0, busy: false,
    activeAgentIds: ROOM_AGENT_ROSTER.map(agent => agent.id),
    agents: ROOM_AGENT_ROSTER.map(agent => ({ ...agent, active: true, status: 'idle', seenSeq: 0 })),
    events: [],
    ...overrides,
  };
}
