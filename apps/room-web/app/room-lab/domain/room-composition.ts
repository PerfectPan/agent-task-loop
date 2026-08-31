import {
  ROOM_AGENT_ROSTER,
  isRoomLabAgentId,
  type RoomLabAgentId,
} from './agent-roster';

const TASK_GATE_AGENTS = ['codex', 'claude'] as const satisfies readonly RoomLabAgentId[];

export class RoomComposition {
  private agentIds: RoomLabAgentId[];

  constructor(agentIds: readonly RoomLabAgentId[] = ROOM_AGENT_ROSTER.map(agent => agent.id)) {
    this.agentIds = validateAgentIds(agentIds);
  }

  replace(agentIds: readonly RoomLabAgentId[]): void {
    this.agentIds = validateAgentIds(agentIds);
  }

  includes(agentId: RoomLabAgentId): boolean {
    return this.agentIds.includes(agentId);
  }

  supportsTaskGate(): boolean {
    return TASK_GATE_AGENTS.every(agentId => this.includes(agentId));
  }

  snapshot(): RoomLabAgentId[] {
    return [...this.agentIds];
  }
}

function validateAgentIds(agentIds: readonly RoomLabAgentId[]): RoomLabAgentId[] {
  if (agentIds.length === 0) {
    throw new RoomCompositionInvariantError('A Room needs at least one active agent');
  }
  const unique = new Set<RoomLabAgentId>();
  for (const agentId of agentIds) {
    if (!isRoomLabAgentId(agentId)) {
      throw new RoomCompositionInvariantError(`Unknown Room agent: ${String(agentId)}`);
    }
    if (unique.has(agentId)) {
      throw new RoomCompositionInvariantError(`Room agent appears more than once: ${agentId}`);
    }
    unique.add(agentId);
  }
  return [...agentIds];
}

export class RoomCompositionInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomCompositionInvariantError';
  }
}
