import { describe, expect, it } from 'vitest';
import { TaskRunnerLivenessService } from '../../src/services/task-runner-liveness-service';

describe('TaskRunnerLivenessService', () => {
  it('marks a dead execute runner as stale and rebuilds the rework prompt', async () => {
    const service = new TaskRunnerLivenessService({
      now: () => new Date('2026-04-20T12:05:00.000Z').getTime(),
      staleAfterMs: 60_000,
      isProcessAlive: () => false,
    });

    const inspection = await service.inspect({
      taskId: 'TASK-102',
      title: 'title',
      description: '修复切租户问题',
      project: 'demo',
      targetAgent: 'claude',
      priority: 1,
      status: '执行中',
      reviewRound: 1,
      acceptanceVerdict: '打回',
      acceptanceFeedback: '单测没有证明真实业务行为',
      runnerPid: 1234,
      runnerKind: 'execute',
      runnerRound: 2,
      lastHeartbeatAt: '2026-04-20T12:00:00.000Z',
    });

    expect(inspection.state).toBe('stale');
    expect(inspection.mode).toBe('execute');
    expect(inspection.round).toBe(2);
    expect(inspection.promptOverride).toContain('董事长最新验收意见');
  });

  it('falls back to a stale review task when the log has stopped moving', async () => {
    const service = new TaskRunnerLivenessService({
      now: () => new Date('2099-04-20T12:05:00.000Z').getTime(),
      staleAfterMs: 1,
      isProcessAlive: () => false,
    });

    const inspection = await service.inspect({
      taskId: 'TASK-103',
      title: 'title',
      description: 'desc',
      project: 'demo',
      targetAgent: 'claude',
      priority: 1,
      status: '待复核',
      reviewRound: 3,
      logPath: new URL('../fixtures/stale.log', import.meta.url).pathname,
    });

    expect(inspection.state).toBe('stale');
    expect(inspection.mode).toBe('review');
    expect(inspection.round).toBe(3);
  });

  it('treats heartbeat-less running tasks as stale instead of active by default', async () => {
    const service = new TaskRunnerLivenessService({
      now: () => new Date('2026-04-20T12:05:00.000Z').getTime(),
      staleAfterMs: 60_000,
    });

    const inspection = await service.inspect({
      taskId: 'TASK-104',
      title: 'title',
      description: 'desc',
      project: 'demo',
      targetAgent: 'codex',
      priority: 1,
      status: '执行中',
      reviewRound: 1,
    });

    expect(inspection.state).toBe('stale');
    expect(inspection.mode).toBe('execute');
    expect(inspection.reason).toContain('no live pid evidence');
  });
});
