import type { ProcessRunner } from '@rivus/agent-orchestration';
import { describe, expect, it } from 'vitest';
import type { AgentRunner } from './ports';
import { RoomLabService } from './room-lab-service.server';
import { MemoryRoomConversation } from '../infrastructure/memory-room-conversation.server';
import { LocalTaskDelivery } from '../infrastructure/local-task-delivery.server';
import { LocalTextPresenter } from '../infrastructure/local-text-presenter.server';

describe('RoomLabService', () => {
  it('posts the first concurrent answer and holds the other four stale drafts', async () => {
    const runner: AgentRunner = async agentId => {
      if (agentId !== 'codex') await delay(15);
      return {
        text: agentId === 'codex' ? 'Codex public answer' : `${agentId} stale answer`,
        latencyMs: agentId === 'codex' ? 2 : 15,
      };
    };
    const service = createService(runner);

    const state = await service.sendMessage('How should five agents share a Room?');

    expect(state.events.map(event => [event.seq, event.author.id, event.body])).toEqual([
      [1, 'director', 'How should five agents share a Room?'],
      [2, 'codex', 'Codex public answer'],
    ]);
    expect(state.agents.filter(agent => agent.status === 'held')).toHaveLength(4);
    expect(state.agents.find(agent => agent.id === 'claude-relay')).toMatchObject({
      status: 'held',
      seenSeq: 1,
      heldUpToSeq: 2,
      lastDraft: 'claude-relay stale answer',
    });
  });

  it('wakes only explicitly mentioned agents and preserves addressedTo', async () => {
    const calls: string[] = [];
    const service = createService(async agentId => {
      calls.push(agentId);
      return { text: 'A focused challenge', latencyMs: 1 };
    });

    const state = await service.sendMessage('@dsh 请挑战这个写作提纲');

    expect(calls).toEqual(['dsh']);
    expect(state.events[0]).toMatchObject({
      author: { id: 'director' },
      addressedTo: ['dsh'],
    });
    expect(state.events[1]).toMatchObject({ author: { id: 'dsh' } });
  });

  it('rejects removed or unknown explicit mentions instead of broadcasting', async () => {
    const calls: string[] = [];
    const service = createService(async agentId => {
      calls.push(agentId);
      return { text: 'should not run', latencyMs: 1 };
    });

    await expect(service.sendMessage('@grok 请评论')).rejects.toThrow(
      'Unknown Room mention: @grok',
    );

    expect(calls).toEqual([]);
    await expect(service.snapshot()).resolves.toMatchObject({
      head: 0,
      events: [],
      busy: false,
    });
  });

  it('runs a five-seat count-off through one monotonic Room stream', async () => {
    const numberByAgent = new Map([
      ['claude-relay', '1'],
      ['claude', '2'],
      ['codex', '3'],
      ['opencode', '4'],
      ['dsh', '5'],
    ]);
    const service = createService(async agentId => ({
      text: numberByAgent.get(agentId) ?? 'unexpected',
      latencyMs: 1,
    }));

    const state = await service.runCountOff();

    expect(state.countOff).toMatchObject({
      runId: 'COUNT-001',
      status: 'completed',
      total: 5,
      reports: [
        { agentId: 'claude-relay', number: 1, seq: 2 },
        { agentId: 'claude', number: 2, seq: 3 },
        { agentId: 'codex', number: 3, seq: 4 },
        { agentId: 'opencode', number: 4, seq: 5 },
        { agentId: 'dsh', number: 5, seq: 6 },
      ],
    });
    expect(state.events.map(event => event.body)).toEqual([
      '@all 报数开始：请按席位顺序只回复自己的数字（1–5）。',
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(state.agents.every(agent => agent.status === 'posted')).toBe(true);
  });

  it('does not resurrect a superseded HELD draft when count-off generation fails', async () => {
    let relayCalls = 0;
    const service = createService(async agentId => {
      if (agentId === 'codex') return { text: 'Codex public answer', latencyMs: 1 };
      if (agentId === 'claude-relay') {
        relayCalls += 1;
        if (relayCalls === 1) {
          await delay(10);
          return { text: 'Relay stale draft', latencyMs: 10 };
        }
        throw new Error('relay unavailable during count-off');
      }
      await delay(15);
      return { text: `${agentId} stale draft`, latencyMs: 15 };
    });

    await service.sendMessage('Create one public answer and four HELD drafts');
    const state = await service.runCountOff();

    expect(state.countOff).toMatchObject({
      status: 'failed',
      failedAgentId: 'claude-relay',
      reports: [],
    });
    expect(state.agents.find(agent => agent.id === 'claude-relay')).toEqual({
      id: 'claude-relay',
      label: 'Claude Relay',
      role: 'Long-form synthesizer',
      status: 'error',
      seenSeq: 3,
      error: 'relay unavailable during count-off',
    });
    await expect(service.retryHeld('claude-relay')).rejects.toThrow('has no held draft');
  });

  it('cancels all broadcast agents and releases busy when the request disconnects', async () => {
    const started = new Set<string>();
    const controller = new AbortController();
    const service = createService(async (agentId, _prompt, signal) => {
      started.add(agentId);
      signal?.throwIfAborted();
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });

    const pending = service.sendMessage('Start all five agents', controller.signal);
    await waitUntil(() => started.size === 5);
    controller.abort(new Error('browser disconnected'));
    const state = await pending;

    expect(started).toEqual(new Set([
      'claude-relay',
      'claude',
      'codex',
      'opencode',
      'dsh',
    ]));
    expect(state.busy).toBe(false);
    expect(state.agents.every(agent => agent.status === 'error')).toBe(true);
    expect(state.agents.every(agent => agent.error === 'browser disconnected')).toBe(true);
  });

  it('keeps HELD context after a failed retry and allows another retry', async () => {
    let claudeCalls = 0;
    const runner: AgentRunner = async agentId => {
      if (agentId === 'codex') return { text: 'Codex answer', latencyMs: 1 };
      if (agentId !== 'claude') {
        await delay(20);
        return { text: `${agentId} stale draft`, latencyMs: 20 };
      }
      claudeCalls += 1;
      if (claudeCalls === 1) {
        await delay(10);
        return { text: 'Claude stale draft', latencyMs: 10 };
      }
      if (claudeCalls === 2) throw new Error('temporary CLI failure');
      return { text: 'Claude additive answer', latencyMs: 3 };
    };
    const service = createService(runner);
    await service.sendMessage('Coordinate this answer');

    const failed = await service.retryHeld('claude');
    expect(failed.agents.find(agent => agent.id === 'claude')).toMatchObject({
      status: 'error',
      heldUpToSeq: 2,
      seenSeq: 1,
      lastDraft: 'Claude stale draft',
      error: 'temporary CLI failure',
    });

    const recovered = await service.retryHeld('claude');
    expect(recovered.events.at(-1)).toMatchObject({
      seq: 3,
      author: { id: 'claude' },
      body: 'Claude additive answer',
    });
    expect(recovered.agents.find(agent => agent.id === 'claude')).toMatchObject({
      status: 'posted',
      seenSeq: 3,
    });
  });

  it('runs the Task Delivery application and projects its results into Room', async () => {
    let reviewRound = 0;
    const processRunner: ProcessRunner = async input => {
      if (input.cmd === 'codex') {
        return {
          stdout: input.args.some(arg => arg.includes('Round 2'))
            ? 'Reworked deliverable with explicit acceptance checks.'
            : 'Initial deliverable.',
          stderr: '',
          exitCode: 0,
        };
      }
      reviewRound += 1;
      return {
        stdout: reviewRound === 1
          ? 'VERDICT: CHANGES_REQUESTED\nAdd explicit acceptance checks.'
          : 'VERDICT: PASS\nThe reworked result satisfies the task.',
        stderr: '',
        exitCode: 0,
      };
    };
    const service = new RoomLabService({
      conversation: new MemoryRoomConversation(),
      agentRunner: async () => ({ text: 'unused', latencyMs: 0 }),
      taskDelivery: new LocalTaskDelivery(processRunner),
      textPresenter: new LocalTextPresenter(),
    });

    const state = await service.runTask('Define a verifiable Room acceptance contract');

    expect(state.task).toMatchObject({
      taskId: 'WEB-001',
      status: 'passed',
      verdict: 'PASS',
      round: 2,
      allowedSeat: 'review',
      occupied: false,
    });
    expect(state.events.map(event => event.author.id)).toEqual([
      'task-control',
      'codex',
      'claude',
      'codex',
      'claude',
      'task-control',
    ]);
    expect(state.events.at(-1)?.body).toContain('passed independent review in round 2');
  });

  it('marks the active Task agent as error when its seat process fails', async () => {
    const processRunner: ProcessRunner = async () => {
      throw new Error('impl process crashed');
    };
    const service = new RoomLabService({
      conversation: new MemoryRoomConversation(),
      agentRunner: async () => ({ text: 'unused', latencyMs: 0 }),
      taskDelivery: new LocalTaskDelivery(processRunner),
      textPresenter: new LocalTextPresenter(),
    });

    const state = await service.runTask('Exercise the failing seat');

    expect(state.task).toMatchObject({ status: 'failed', occupied: false });
    expect(state.agents.find(agent => agent.id === 'codex')).toMatchObject({
      status: 'error',
      error: 'impl process crashed',
    });
  });

  it('keeps Task PASS while exposing a failed Room projection as completed, not posted', async () => {
    const processRunner: ProcessRunner = async input => ({
      stdout: input.cmd === 'codex'
        ? 'Deliverable completed outside Room.'
        : 'VERDICT: PASS\nThe deliverable satisfies the task.',
      stderr: '',
      exitCode: 0,
    });
    const conversation = new ProjectionFailingConversation();
    const service = new RoomLabService({
      conversation,
      agentRunner: async () => ({ text: 'unused', latencyMs: 0 }),
      taskDelivery: new LocalTaskDelivery(processRunner),
      textPresenter: new LocalTextPresenter(),
    });

    const state = await service.runTask('Keep Task success independent from Room projection');

    expect(state.task).toMatchObject({ status: 'passed', verdict: 'PASS' });
    expect(state.events).toEqual([]);
    expect(state.agents.find(agent => agent.id === 'codex')).toMatchObject({
      status: 'completed',
      error: 'Room projection failed: Room unavailable',
    });
    expect(state.agents.find(agent => agent.id === 'claude')).toMatchObject({
      status: 'completed',
      error: 'Room projection failed: Room unavailable',
    });
  });
});

function createService(agentRunner: AgentRunner): RoomLabService {
  const noTaskProcess: ProcessRunner = async () => ({ stdout: '', stderr: '', exitCode: 1 });
  return new RoomLabService({
    conversation: new MemoryRoomConversation(),
    agentRunner,
    taskDelivery: new LocalTaskDelivery(noTaskProcess),
    textPresenter: new LocalTextPresenter(),
  });
}

class ProjectionFailingConversation extends MemoryRoomConversation {
  override async project(): Promise<void> {
    throw new Error('Room unavailable');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await delay(1);
  }
  throw new Error('condition was not reached');
}
