import {
  AGENT_ID_PATTERN,
  type KnownAgentIds,
  type RoomLabAgentId,
} from './agent-registry';

// TODO(agents-registry): task gate still names two agents; make seats configurable.
const TASK_GATE_AGENTS: readonly RoomLabAgentId[] = ['codex', 'claude'];

export class RoomComposition {
  private agentIds: RoomLabAgentId[];

  /**
   * `known` is the registry when the caller has one: a composition may only
   * name agents that exist as rows. Without it the ids are checked for shape
   * only, which is what a pure-domain caller can honestly assert.
   */
  constructor(
    agentIds: readonly RoomLabAgentId[],
    private readonly known?: KnownAgentIds,
  ) {
    this.agentIds = this.validate(agentIds);
  }

  replace(agentIds: readonly RoomLabAgentId[]): void {
    this.agentIds = this.validate(agentIds);
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

  private validate(agentIds: readonly RoomLabAgentId[]): RoomLabAgentId[] {
    if (agentIds.length === 0) {
      throw new RoomCompositionInvariantError('A Room needs at least one active agent');
    }
    const unique = new Set<RoomLabAgentId>();
    for (const agentId of agentIds) {
      const exists = this.known
        ? this.known.has(agentId)
        : typeof agentId === 'string' && AGENT_ID_PATTERN.test(agentId);
      if (!exists) {
        throw new RoomCompositionInvariantError(`Unknown Room agent: ${String(agentId)}`);
      }
      if (unique.has(agentId)) {
        throw new RoomCompositionInvariantError(`Room agent appears more than once: ${agentId}`);
      }
      unique.add(agentId);
    }
    return [...agentIds];
  }
}

export class RoomCompositionInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomCompositionInvariantError';
  }
}
