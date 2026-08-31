import { describe, expect, it } from 'vitest';
import {
  ROOM_AGENT_ROSTER,
  type RoomLabAgentId,
} from './agent-roster';
import { RoomComposition } from './room-composition';

describe('RoomComposition', () => {
  it('keeps an ordered non-empty subset of the supported catalog', () => {
    const composition = new RoomComposition(['dsh', 'claude', 'codex']);

    expect(composition.snapshot()).toEqual(['dsh', 'claude', 'codex']);
    expect(composition.includes('opencode')).toBe(false);
    expect(composition.supportsTaskGate()).toBe(true);
  });

  it('rejects an empty or duplicate composition', () => {
    expect(() => new RoomComposition([])).toThrow('at least one active agent');
    expect(() => new RoomComposition(['codex', 'codex'])).toThrow(
      'Room agent appears more than once: codex',
    );
  });

  it('requires both Task delivery seats without constraining normal Room chat', () => {
    const composition = new RoomComposition(['opencode']);

    expect(composition.supportsTaskGate()).toBe(false);
    composition.replace(['codex', 'claude']);
    expect(composition.supportsTaskGate()).toBe(true);
  });

  it('accepts every non-empty subset of the five-agent catalog', () => {
    const catalog = ROOM_AGENT_ROSTER.map(agent => agent.id);
    const compositions = Array.from({ length: (2 ** catalog.length) - 1 }, (_, index) =>
      catalog.filter((_, bit) => ((index + 1) & (1 << bit)) !== 0),
    );

    expect(compositions).toHaveLength(31);
    for (const agentIds of compositions) {
      expect(new RoomComposition(agentIds).snapshot()).toEqual(agentIds);
    }
  });

  it('preserves all 120 orders of a five-agent composition', () => {
    const catalog = ROOM_AGENT_ROSTER.map(agent => agent.id);
    const orders = permutations(catalog);

    expect(orders).toHaveLength(120);
    expect(new Set(orders.map(order => order.join('>')))).toHaveLength(120);
    for (const order of orders) {
      expect(new RoomComposition(order).snapshot()).toEqual(order);
    }
  });
});

function permutations(agentIds: readonly RoomLabAgentId[]): RoomLabAgentId[][] {
  if (agentIds.length === 0) return [[]];
  return agentIds.flatMap((agentId, index) =>
    permutations(agentIds.filter((_, candidateIndex) => candidateIndex !== index))
      .map(tail => [agentId, ...tail]),
  );
}
