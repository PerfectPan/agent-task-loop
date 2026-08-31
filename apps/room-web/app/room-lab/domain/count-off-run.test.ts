import { describe, expect, it } from 'vitest';
import { CountOffRun } from './count-off-run';

describe('CountOffRun', () => {
  it('accepts the five-agent roster in deterministic order', () => {
    const run = new CountOffRun('COUNT-001');
    const agents = ['claude-relay', 'claude', 'codex', 'opencode', 'dsh'] as const;

    agents.forEach((agentId, index) => {
      expect(run.next()).toEqual({ agentId, number: index + 1 });
      run.accept({ agentId, reply: String(index + 1), seq: index + 2 });
    });

    expect(run.snapshot()).toMatchObject({
      status: 'completed',
      total: 5,
      reports: agents.map((agentId, index) => ({
        agentId,
        number: index + 1,
        seq: index + 2,
      })),
    });
  });

  it('rejects an out-of-order or non-numeric report', () => {
    const run = new CountOffRun('COUNT-001');

    expect(() => run.accept({ agentId: 'claude', reply: '1', seq: 2 })).toThrow(
      'Expected claude-relay to report 1',
    );
    expect(() => run.accept({ agentId: 'claude-relay', reply: 'one', seq: 2 })).toThrow(
      'must reply exactly 1',
    );
  });

  it('rejects invalid or non-monotonic Room sequences', () => {
    const invalid = new CountOffRun('COUNT-001');
    expect(() => invalid.accept({ agentId: 'claude-relay', reply: '1', seq: 0 })).toThrow(
      'safe integer greater than 0',
    );

    const repeated = new CountOffRun('COUNT-002');
    repeated.accept({ agentId: 'claude-relay', reply: '1', seq: 2 });
    expect(() => repeated.accept({ agentId: 'claude', reply: '2', seq: 2 })).toThrow(
      'safe integer greater than 2',
    );
    expect(() => repeated.accept({ agentId: 'claude', reply: '2', seq: 1.5 })).toThrow(
      'safe integer greater than 2',
    );
  });

  it('counts off any selected subset in its configured order', () => {
    const run = new CountOffRun('COUNT-003', ['dsh', 'codex']);

    expect(run.next()).toEqual({ agentId: 'dsh', number: 1 });
    run.accept({ agentId: 'dsh', reply: '1', seq: 2 });
    expect(run.next()).toEqual({ agentId: 'codex', number: 2 });
    run.accept({ agentId: 'codex', reply: '2', seq: 3 });

    expect(run.snapshot()).toMatchObject({
      status: 'completed',
      total: 2,
      agentIds: ['dsh', 'codex'],
    });
  });
});
