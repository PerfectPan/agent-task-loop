import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrchestrationConflictError, silentLogger } from '@rivus/agent-orchestration';
import { runWithOccupancy } from '../../src/orchestration/run-with-occupancy';
import { createTaskOrchestration } from '../../src/orchestration/task-orchestration';
import { TaskStartService } from '../../src/task-manager/task-start-service';
import type { TaskRecord } from '../../src/types/task';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function dbFile(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atl-orch-'));
  dirs.push(dir);
  return path.join(dir, 'orchestration.db');
}

function orchAt(file: string, now: () => number, extra: { supervisorPid?: number; alive?: boolean } = {}) {
  return createTaskOrchestration({
    dbPath: file,
    now,
    staleAfterMs: 120_000,
    supervisorPid: extra.supervisorPid ?? 11,
    isProcessAlive: extra.alive === undefined ? () => true : () => extra.alive!,
    logger: silentLogger,
  });
}

describe('runWithOccupancy', () => {
  it('conflicts on a second open 1s later because open already stamped the heartbeat', async () => {
    let now = 1_000;
    const file = dbFile();
    const a = orchAt(file, () => now, { supervisorPid: 11 });
    const b = orchAt(file, () => now, { supervisorPid: 22 });
    await runWithOccupancy({
      orchestration: a,
      key: 'task:T-1',
      taskId: 'T-1',
      inspect: async () => ({ state: 'idle' }),
      award: 'impl',
      log: () => undefined,
      fn: async () => {
        now += 1_000;
        expect(() => b.open({ key: 'task:T-1', template: 'classic-delivery' })).toThrow(
          OrchestrationConflictError,
        );
      },
    });
  });

  it('keeps occupy fresh across 120s when the 15s timer is firing', async () => {
    let now = 1_000;
    const file = dbFile();
    const ticks: Array<() => void> = [];
    const a = orchAt(file, () => now, { supervisorPid: 11 });
    const b = orchAt(file, () => now, { supervisorPid: 22 });
    await runWithOccupancy({
      orchestration: a,
      key: 'task:T-1',
      taskId: 'T-1',
      inspect: async () => ({ state: 'idle' }),
      award: 'impl',
      heartbeatIntervalMs: 15_000,
      timers: {
        setInterval: fn => {
          ticks.push(fn as () => void);
          return 1 as unknown as NodeJS.Timeout;
        },
        clearInterval: () => {
          ticks.length = 0;
        },
      },
      log: () => undefined,
      fn: async () => {
        now += 120_000;
        for (const tick of ticks) {
          tick();
        }
        expect(() => b.open({ key: 'task:T-1', template: 'classic-delivery' })).toThrow(
          OrchestrationConflictError,
        );
      },
    });
  });

  it('lets a later open take over after 120s when the timer is disabled', async () => {
    let now = 1_000;
    const file = dbFile();
    const a = orchAt(file, () => now, { supervisorPid: 11 });
    const first = a.open({ key: 'task:T-1', template: 'classic-delivery' });
    expect(first.status).toBe('open');
    now += 120_001;
    const b = orchAt(file, () => now, { supervisorPid: 22, alive: false });
    const taken = b.open({ key: 'task:T-1', template: 'classic-delivery' });
    expect(taken.status).toBe('open');
    expect(taken.tokens).toEqual([]);
  });

  it('does not grant or run after a stale-open when ATL inspect is active', async () => {
    const orchestration = {
      open: vi.fn().mockReturnValue({ term: 0 }),
      heartbeat: vi.fn(),
      snapshot: vi.fn().mockReturnValue({ term: 0 }),
      grant: vi.fn(),
      release: vi.fn(),
    };
    const run = vi.fn();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-30' })) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: {
        inspect: vi.fn().mockResolvedValue({ state: 'active', mode: 'execute', round: 1 }),
      },
      orchestration,
      log: () => undefined,
    });

    await expect(service.startTask({ taskId: 'TASK-30', maxRounds: 4 })).rejects.toThrow(
      'Task TASK-30 already has an active execute runner',
    );
    expect(orchestration.grant).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(orchestration.release).toHaveBeenCalled();
  });

  it('grants review on stale review so that seat can authorizeSpawn', async () => {
    const file = dbFile();
    const orch = orchAt(file, () => 1_000);
    const resumeReview = vi.fn().mockImplementation(async () => {
      const permit = orch.authorizeSpawn({ key: 'task:TASK-31', seat: 'review', expectedTerm: 1 });
      expect(permit.seat).toBe('review');
    });
    const service = new TaskStartService({
      taskService: {
        getTaskById: vi.fn().mockResolvedValue(
          task({
            taskId: 'TASK-31',
            status: '待复核',
            workspacePath: '/tmp',
          }),
        ),
      },
      runner: { run: vi.fn(), resumeReview },
      livenessService: {
        inspect: vi.fn().mockResolvedValue({ state: 'stale', mode: 'review', round: 2 }),
      },
      orchestration: orch,
      log: () => undefined,
    });

    await service.startTask({ taskId: 'TASK-31', maxRounds: 4 });
    expect(resumeReview).toHaveBeenCalled();
    expect(orch.snapshot({ key: 'task:TASK-31' }).status).toBe('released');
  });
});

function task(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    taskId: 'TASK-DEFAULT',
    title: 'Task',
    description: 'Description',
    project: 'project',
    targetAgent: 'codex',
    priority: 1,
    status: '待处理',
    ...overrides,
  };
}
