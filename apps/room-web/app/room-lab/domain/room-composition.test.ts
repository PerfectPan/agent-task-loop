import { describe, expect, it } from 'vitest';
import type { RoomLabAgentId } from './agent-registry';
import { RoomComposition } from './room-composition';
import { TEST_AGENT_IDS, testRegistry } from '../presentation/testing/test-agents';

describe('RoomComposition', () => {
  it('keeps an ordered non-empty subset of the registry', () => {
    const composition = new RoomComposition(['dsh', 'claude', 'codex'], testRegistry());

    expect(composition.snapshot()).toEqual(['dsh', 'claude', 'codex']);
    expect(composition.includes('opencode')).toBe(false);
    expect(composition.supportsTaskGate()).toBe(true);
  });

  it('rejects an empty or duplicate composition', () => {
    expect(() => new RoomComposition([], testRegistry())).toThrow('at least one active agent');
    expect(() => new RoomComposition(['codex', 'codex'], testRegistry())).toThrow(
      'Room agent appears more than once: codex',
    );
  });

  it('rejects an id that is not a row in the registry', () => {
    expect(() => new RoomComposition(['gemini'], testRegistry())).toThrow(
      'Unknown Room agent: gemini',
    );
    // Without a registry the domain can still reject something that is not an id.
    expect(() => new RoomComposition(['Not An Id'])).toThrow('Unknown Room agent: Not An Id');
  });

  it('requires both Task delivery seats without constraining normal Room chat', () => {
    const composition = new RoomComposition(['opencode'], testRegistry());

    expect(composition.supportsTaskGate()).toBe(false);
    composition.replace(['codex', 'claude']);
    expect(composition.supportsTaskGate()).toBe(true);
  });

  it('accepts every non-empty subset of a five-agent registry', () => {
    const catalog = TEST_AGENT_IDS;
    const compositions = Array.from({ length: (2 ** catalog.length) - 1 }, (_, index) =>
      catalog.filter((_, bit) => ((index + 1) & (1 << bit)) !== 0),
    );

    expect(compositions).toHaveLength(31);
    for (const agentIds of compositions) {
      expect(new RoomComposition(agentIds, testRegistry()).snapshot()).toEqual(agentIds);
    }
  });

  it('preserves all 120 orders of a five-agent composition', () => {
    const catalog = TEST_AGENT_IDS;
    const orders = permutations(catalog);

    expect(orders).toHaveLength(120);
    expect(new Set(orders.map(order => order.join('>')))).toHaveLength(120);
    for (const order of orders) {
      expect(new RoomComposition(order, testRegistry()).snapshot()).toEqual(order);
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
