import fs from 'node:fs/promises';
import { buildReworkPrompt } from './rework-prompt-service';
import type { TaskRecord } from '../types/task';

const RUNNING_STATUSES = new Set(['执行中', '修复中', '待复核']);

export interface TaskRunnerInspection {
  state: 'idle' | 'active' | 'stale';
  mode?: 'execute' | 'review';
  round?: number;
  promptOverride?: string;
  reason?: string;
}

export class TaskRunnerLivenessService {
  constructor(
    private readonly deps: {
      now?: () => number;
      staleAfterMs?: number;
      isProcessAlive?: (pid: number) => boolean;
    } = {},
  ) {}

  async inspect(task: TaskRecord): Promise<TaskRunnerInspection> {
    if (!RUNNING_STATUSES.has(task.status)) {
      return { state: 'idle' };
    }

    const now = (this.deps.now ?? Date.now)();
    const staleAfterMs = this.deps.staleAfterMs ?? 120_000;
    const lastHeartbeatAt = task.lastHeartbeatAt ? new Date(task.lastHeartbeatAt).getTime() : undefined;
    const hasFreshHeartbeat = lastHeartbeatAt !== undefined && now - lastHeartbeatAt <= staleAfterMs;
    const mode = task.runnerKind ?? (task.status === '待复核' ? 'review' : 'execute');
    const round =
      task.runnerRound ??
      (mode === 'review' ? (task.reviewRound ?? 1) : (task.reviewRound ?? 0) + 1);

    if (task.runnerPid) {
      const isProcessAlive = (this.deps.isProcessAlive ?? defaultIsProcessAlive)(task.runnerPid);
      if (isProcessAlive && hasFreshHeartbeat) {
        return { state: 'active', mode, round };
      }
      if (!isProcessAlive) {
        return {
          state: 'stale',
          mode,
          round,
          promptOverride: mode === 'execute' ? buildRecoveryPrompt(task) : undefined,
          reason: `runner pid ${task.runnerPid} is no longer alive`,
        };
      }
    }

    if (hasFreshHeartbeat) {
      return { state: 'active', mode, round };
    }

    const hasStaleLog = await hasStaleLogFile(task.logPath, now, staleAfterMs);
    if (task.logPath && hasStaleLog) {
      return {
        state: 'stale',
        mode,
        round,
        promptOverride: mode === 'execute' ? buildRecoveryPrompt(task) : undefined,
        reason: `runner heartbeat missing and log has been idle for more than ${staleAfterMs}ms`,
      };
    }

    return {
      state: 'stale',
      mode,
      round,
      promptOverride: mode === 'execute' ? buildRecoveryPrompt(task) : undefined,
      reason: 'runner has no live pid evidence and no fresh heartbeat',
    };
  }
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function hasStaleLogFile(logPath: string | undefined, now: number, staleAfterMs: number): Promise<boolean> {
  if (!logPath) {
    return false;
  }

  try {
    const stat = await fs.stat(logPath);
    return now - stat.mtimeMs > staleAfterMs;
  } catch {
    return false;
  }
}

function buildRecoveryPrompt(task: TaskRecord): string | undefined {
  if (task.acceptanceVerdict === '打回' && task.acceptanceFeedback) {
    return buildReworkPrompt({
      taskDescription: task.description,
      resultSummary: task.resultSummary,
      reviewFindings: task.reviewFindings,
      acceptanceFeedback: task.acceptanceFeedback,
    });
  }

  if (task.reviewVerdict === '驳回' && task.reviewFindings) {
    return buildReworkPrompt({
      taskDescription: task.description,
      resultSummary: task.resultSummary,
      reviewFindings: task.reviewFindings,
    });
  }

  return undefined;
}
