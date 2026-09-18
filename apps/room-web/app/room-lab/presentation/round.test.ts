import { describe, expect, it } from 'vitest';
import { behindWhom, deriveRound, roundSentence } from './round';
import { roomFixture } from './testing/room-fixture';
import type { RoomLabEventView } from '../read-model';

function human(seq: number, addressedTo: string[] = []): RoomLabEventView {
  return {
    seq, messageId: `web:${seq}`, author: { kind: 'human', id: 'director' }, kind: 'human',
    body: 'hello', addressedTo, at: '2026-09-17T00:00:00Z',
  };
}

describe('deriveRound', () => {
  it('reads done / now / queued from seenSeq and runningAgentIds', () => {
    const state = roomFixture({ events: [human(3)], runningAgentIds: ['codex'] });
    // composition order: claude-relay, claude, codex, opencode, dsh
    state.agents = state.agents.map(agent => {
      if (agent.id === 'claude-relay' || agent.id === 'claude') return { ...agent, status: 'posted', seenSeq: 3 };
      if (agent.id === 'codex') return { ...agent, status: 'running', seenSeq: 3 };
      return { ...agent, status: 'posted', seenSeq: 2 }; // said something last round, not yet this one
    });
    const round = deriveRound(state)!;
    expect(round.turns.map(turn => `${turn.agent.id}:${turn.phase}`)).toEqual([
      'claude-relay:done', 'claude:done', 'codex:now', 'opencode:queued', 'dsh:queued',
    ]);
    expect(round.live).toBe(true);
    expect(roundSentence(round)).toBe('当前 codex · 待回复 2 位');
    expect(behindWhom(round)).toBe('dsh');
  });

  it('only wakes the addressed member for an @ message', () => {
    const state = roomFixture({ events: [human(5, ['dsh'])], runningAgentIds: ['dsh'] });
    state.agents = state.agents.map(agent => agent.id === 'dsh' ? { ...agent, status: 'running', seenSeq: 5 } : agent);
    const round = deriveRound(state)!;
    expect(round.turns.map(turn => turn.agent.id)).toEqual(['dsh']);
    expect(roundSentence(round)).toBe('当前 dsh · 最后一位');
  });

  it('is over when everyone has read the waking message and nobody runs', () => {
    const state = roomFixture({ events: [human(2)] });
    state.agents = state.agents.map(agent => ({ ...agent, status: 'posted', seenSeq: 2 }));
    const round = deriveRound(state)!;
    expect(round.live).toBe(false);
    expect(roundSentence(round)).toBeUndefined();
    expect(behindWhom(round)).toBeUndefined();
  });

  it('keeps a held draft and a failed run visible as their own phases', () => {
    const state = roomFixture({ events: [human(4)] });
    state.agents = state.agents.map(agent => {
      if (agent.id === 'claude') return { ...agent, status: 'held', seenSeq: 3, heldUpToSeq: 4, lastDraft: 'x' };
      if (agent.id === 'opencode') return { ...agent, status: 'error', seenSeq: 4, error: 'quota' };
      return { ...agent, status: 'posted', seenSeq: 4 };
    });
    const phases = Object.fromEntries(deriveRound(state)!.turns.map(turn => [turn.agent.id, turn.phase]));
    expect(phases.claude).toBe('held');
    expect(phases.opencode).toBe('error');
  });

  it('ignores an optimistic pending message and returns nothing without a human message', () => {
    expect(deriveRound(roomFixture())).toBeUndefined();
    const pending = { ...human(9), pending: true };
    expect(deriveRound(roomFixture({ events: [pending] }))).toBeUndefined();
  });
});
