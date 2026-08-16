import { OrchestrationConflictError } from '@rivus/agent-orchestration';
import type { TaskRunnerInspection } from '../services/task-runner-liveness-service';

export const KERNEL_HEARTBEAT_INTERVAL_MS = 15_000;

export type OccupiedSeat = 'impl' | 'review';

export interface OccupancyOrchestration {
  open(input: {
    key: string;
    template: string;
    bind?: Record<string, { cmd: string }>;
    goal?: string;
    ref?: Record<string, string>;
  }): unknown;
  heartbeat(input: { key: string }): void;
  snapshot(input: { key: string }): { term: number };
  grant(input: { key: string; seat: string; expectedTerm: number }): unknown;
  release(input: { key: string }): void;
}

export interface OccupancyTimers {
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
}

export function awardStartSeat(inspection: TaskRunnerInspection): OccupiedSeat {
  return inspection.state === 'stale' && inspection.mode === 'review' ? 'review' : 'impl';
}

export async function runWithOccupancy<T>(input: {
  orchestration: OccupancyOrchestration;
  key: string;
  taskId: string;
  template?: string;
  bind?: Record<string, { cmd: string }>;
  goal?: string;
  ref?: Record<string, string>;
  inspect: () => Promise<TaskRunnerInspection>;
  award: OccupiedSeat | ((inspection: TaskRunnerInspection) => OccupiedSeat);
  fn: (ctx: { inspection: TaskRunnerInspection; seat: OccupiedSeat }) => Promise<T>;
  heartbeatIntervalMs?: number;
  enableHeartbeat?: boolean;
  timers?: OccupancyTimers;
  log?: (message: string) => void;
}): Promise<T> {
  const log = input.log ?? (message => console.log(message));
  try {
    await input.orchestration.open({
      key: input.key,
      template: input.template ?? 'classic-delivery',
      bind: input.bind,
      goal: input.goal,
      ref: input.ref,
    });
  } catch (error) {
    if (error instanceof OrchestrationConflictError) {
      log(`[agent-task-loop] orch conflict key=${input.key} pid=${error.supervisorPid ?? '-'}`);
      throw new Error(
        `Task ${input.taskId} already has an active orchestration` +
          (error.supervisorPid !== undefined ? ` (pid ${error.supervisorPid})` : ''),
      );
    }
    throw error;
  }
  log(`[agent-task-loop] orch open key=${input.key}`);

  const timers = input.timers ?? { setInterval, clearInterval };
  const intervalMs = input.heartbeatIntervalMs ?? KERNEL_HEARTBEAT_INTERVAL_MS;
  const enableHeartbeat = input.enableHeartbeat !== false;
  const timer = enableHeartbeat
    ? timers.setInterval(() => {
        input.orchestration.heartbeat({ key: input.key });
      }, intervalMs)
    : undefined;
  if (timer && typeof timer === 'object' && 'unref' in timer && typeof timer.unref === 'function') {
    timer.unref();
  }
  if (enableHeartbeat) {
    log(`[agent-task-loop] orch heartbeat started key=${input.key} intervalMs=${intervalMs}`);
  }

  try {
    const inspection = await input.inspect();
    if (inspection.state === 'active') {
      log(`[agent-task-loop] orch blocked key=${input.key} mode=${inspection.mode ?? 'unknown'}`);
      throw new Error(`Task ${input.taskId} already has an active ${inspection.mode} runner`);
    }
    const seat = typeof input.award === 'function' ? input.award(inspection) : input.award;
    const term = input.orchestration.snapshot({ key: input.key }).term;
    input.orchestration.grant({ key: input.key, seat, expectedTerm: term });
    log(`[agent-task-loop] orch grant seat=${seat} key=${input.key} term=${term}`);
    return await input.fn({ inspection, seat });
  } finally {
    if (timer !== undefined) {
      timers.clearInterval(timer);
    }
    input.orchestration.release({ key: input.key });
    log(`[agent-task-loop] orch release key=${input.key}`);
  }
}
