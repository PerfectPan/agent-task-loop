import { ROOM_AGENT_ROSTER } from '../../domain/agent-roster';
import type { RoomLabState } from '../../read-model';

export function roomFixture(overrides: Partial<RoomLabState> = {}): RoomLabState {
  return {
    roomId: 'r_aaaaaaaaaa', title: '产品讨论', epoch: 'test-epoch', head: 0, revision: 0, busy: false,
    runningAgentIds: [], catalog: [{ id: 'r_aaaaaaaaaa', title: '产品讨论', updatedAt: '2026-09-06T00:00:00.000Z', memberCount: 5 }],
    activeAgentIds: ROOM_AGENT_ROSTER.map(agent => agent.id),
    agents: ROOM_AGENT_ROSTER.map(agent => ({ ...agent, active: true, status: 'idle', seenSeq: 0 })),
    events: [],
    ...overrides,
  };
}
