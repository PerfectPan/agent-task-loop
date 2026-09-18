import type { ProcessRunner } from '@rivus/agent-orchestration';
import { describe, expect, it } from 'vitest';
import type { AgentRunner } from './ports';
import { RoomLabService } from './room-lab-service.server';
import { MemoryRoomConversation } from '../infrastructure/memory-room-conversation.server';
import { LocalTaskDelivery } from '../infrastructure/local-task-delivery.server';
import { LocalTextPresenter } from '../infrastructure/local-text-presenter.server';

describe('RoomLabService', () => {
  it('posts the first concurrent answer and holds the stale second draft', async () => {
    const runner: AgentRunner = async agentId => {
      if (agentId === 'claude') await delay(15);
      return {
        text: agentId === 'codex' ? 'Codex public answer' : 'Claude stale answer',
        latencyMs: agentId === 'codex' ? 2 : 15,
      };
    };
    const service = createService(runner);

    const state = await service.sendMessage('How should two agents share a Room?');

    expect(state.events.map(event => [event.seq, event.author.id, event.body])).toEqual([
      [1, 'director', 'How should two agents share a Room?'],
      [2, 'codex', 'Codex public answer'],
    ]);
    expect(state.agents.find(agent => agent.id === 'claude')).toMatchObject({
      status: 'held',
      seenSeq: 1,
      heldUpToSeq: 2,
      lastDraft: 'Claude stale answer',
    });
  });

  it('keeps HELD context after a failed retry and allows another retry', async () => {
    let claudeCalls = 0;
    const runner: AgentRunner = async agentId => {
      if (agentId === 'codex') return { text: 'Codex answer', latencyMs: 1 };
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
