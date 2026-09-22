import { describe, expect, it } from 'vitest';
import { agentLetters } from './agent-letters';
import { agentTile, NEUTRAL_TILE } from './agent-color';

describe('agentLetters', () => {
  it('takes one letter per part of a compound id and two from a single word', () => {
    expect(agentLetters('claude-code')).toBe('CC');
    expect(agentLetters('dsh')).toBe('DS');
    expect(agentLetters('opencode')).toBe('OP');
    expect(agentLetters('gpt5')).toBe('GP');
    expect(agentLetters('a-b-c')).toBe('AB');
    expect(agentLetters('x')).toBe('X');
  });
});

describe('agentTile', () => {
  it('maps a stored colour onto the categorical ramp and falls back for anything else', () => {
    expect(agentTile(1)).toBe('bg-chart-1/15 text-chart-1');
    expect(agentTile(5)).toBe('bg-chart-5/15 text-chart-5');
    expect(agentTile(0)).toBe(NEUTRAL_TILE);
    expect(agentTile(6)).toBe(NEUTRAL_TILE);
    expect(agentTile(undefined)).toBe(NEUTRAL_TILE);
  });
});
