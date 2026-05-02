import fs from 'node:fs/promises';
import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { assertFeishuRuntimeConfig } from '../config/runtime-guard';
import { TaskService } from '../services/task-service';
import { TaskRunnerLivenessService } from '../services/task-runner-liveness-service';
import type { TaskRecord } from '../types/task';

const TERMINAL_STATUSES = new Set(['待决策', '待发布', '待验收', '已完成', '已失败']);
export const INITIAL_LOG_TAIL_BYTES = 64 * 1024;

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function readLogDelta(
  logPath: string,
  offset: number | undefined,
  initialTailBytes = INITIAL_LOG_TAIL_BYTES,
): Promise<{ nextOffset: number; chunk: string }> {
  try {
    const stat = await fs.stat(logPath);
    const start =
      offset === undefined ?
        Math.max(0, stat.size - initialTailBytes)
      : stat.size < offset ?
        0
      : offset;

    if (stat.size === start) {
      return { nextOffset: stat.size, chunk: '' };
    }

    const handle = await fs.open(logPath, 'r');
    try {
      const length = stat.size - start;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
      return { nextOffset: stat.size, chunk: buffer.toString('utf8') };
    } finally {
      await handle.close();
    }
  } catch {
    return { nextOffset: offset, chunk: '' };
  }
}

function printSnapshot(task: TaskRecord): void {
  console.log(`[watch] task=${task.taskId} status=${task.status}`);
  if (task.workspacePath) {
    console.log(`[watch] workspace=${task.workspacePath}`);
  }
  if (task.logPath) {
    console.log(`[watch] log=${task.logPath}`);
  }
  if (task.progressSummary) {
    console.log(`[watch] progress=${task.progressSummary}`);
  }
  if (task.currentOwner) {
    console.log(`[watch] owner=${task.currentOwner}`);
  }
  if (task.reviewRound !== undefined) {
    console.log(`[watch] reviewRound=${task.reviewRound}`);
  }
  if (task.reviewVerdict) {
    console.log(`[watch] reviewVerdict=${task.reviewVerdict}`);
  }
  if (task.reviewFindings) {
    console.log(`[watch] reviewFindings=${task.reviewFindings}`);
  }
  if (task.acceptanceRound !== undefined) {
    console.log(`[watch] acceptanceRound=${task.acceptanceRound}`);
  }
  if (task.acceptanceVerdict) {
    console.log(`[watch] acceptanceVerdict=${task.acceptanceVerdict}`);
  }
  if (task.acceptanceFeedback) {
    console.log(`[watch] acceptanceFeedback=${task.acceptanceFeedback}`);
  }
  if (task.sessionName) {
    console.log(`[watch] sessionName=${task.sessionName}`);
  }
  if (task.sessionId) {
    console.log(`[watch] sessionId=${task.sessionId}`);
  }
  if (task.executionSessionName) {
    console.log(`[watch] executionSessionName=${task.executionSessionName}`);
  }
  if (task.executionSessionId) {
    console.log(`[watch] executionSessionId=${task.executionSessionId}`);
  }
  if (task.reviewSessionName) {
    console.log(`[watch] reviewSessionName=${task.reviewSessionName}`);
  }
  if (task.reviewSessionId) {
    console.log(`[watch] reviewSessionId=${task.reviewSessionId}`);
  }
  if (task.sessionHistory) {
    console.log('[watch] sessionHistory=');
    console.log(task.sessionHistory);
  }
  if (task.runnerKind) {
    console.log(`[watch] runnerKind=${task.runnerKind}`);
  }
  if (task.runnerAgent) {
    console.log(`[watch] runnerAgent=${task.runnerAgent}`);
  }
  if (task.runnerRound !== undefined) {
    console.log(`[watch] runnerRound=${task.runnerRound}`);
  }
  if (task.runnerPid !== undefined) {
    console.log(`[watch] runnerPid=${task.runnerPid}`);
  }
  if (task.lastHeartbeatAt) {
    console.log(`[watch] lastHeartbeatAt=${task.lastHeartbeatAt}`);
  }
  if (task.publishBranch) {
    console.log(`[watch] publishBranch=${task.publishBranch}`);
  }
  if (task.publishCommit) {
    console.log(`[watch] publishCommit=${task.publishCommit}`);
  }
  if (task.publishedAt) {
    console.log(`[watch] publishedAt=${task.publishedAt}`);
  }
  if (task.prLink) {
    console.log(`[watch] mr=${task.prLink}`);
  }
  if (task.resultSummary) {
    console.log(`[watch] summary=${task.resultSummary}`);
  }
  if (task.lastError) {
    console.log(`[watch] error=${task.lastError}`);
  }
}

export const watchCommand = defineCommand({
  meta: {
    name: 'watch',
    description: 'Watch one task status and stream its log',
  },
  args: {
    task: {
      type: 'string',
      required: true,
    },
    config: {
      type: 'string',
    },
    interval: {
      type: 'string',
      default: '2',
    },
  },
  async run({ args }) {
    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    assertFeishuRuntimeConfig(config);
    const taskService = new TaskService(config);
    const livenessService = new TaskRunnerLivenessService();
    const intervalMs = Number(args.interval) * 1000;
    let previousStatus: string | undefined;
    let previousLogPath: string | undefined;
    let previousProgressSummary: string | undefined;
    let previousSessionId: string | undefined;
    let previousSessionName: string | undefined;
    let previousSessionHistory: string | undefined;
    let offset: number | undefined;

    while (true) {
      const task = await taskService.getTaskById(String(args.task));
      if (!task) {
        throw new Error(`Task ${String(args.task)} not found`);
      }

      if (
        task.status !== previousStatus ||
        task.logPath !== previousLogPath ||
        task.progressSummary !== previousProgressSummary ||
        task.sessionId !== previousSessionId ||
        task.sessionName !== previousSessionName ||
        task.sessionHistory !== previousSessionHistory
      ) {
        printSnapshot(task);
        if (task.logPath !== previousLogPath) {
          offset = undefined;
        }
        previousStatus = task.status;
        previousLogPath = task.logPath;
        previousProgressSummary = task.progressSummary;
        previousSessionId = task.sessionId;
        previousSessionName = task.sessionName;
        previousSessionHistory = task.sessionHistory;
      }

      const inspection = await livenessService.inspect(task);
      if (inspection.state === 'stale') {
        console.log(`[watch] staleRunner=${inspection.mode ?? 'unknown'} reason=${inspection.reason ?? 'unknown'}`);
        break;
      }

      if (task.logPath) {
        const delta = await readLogDelta(task.logPath, offset);
        offset = delta.nextOffset;
        if (delta.chunk) {
          process.stdout.write(delta.chunk);
        }
      }

      if (TERMINAL_STATUSES.has(task.status)) {
        printSnapshot(task);
        break;
      }

      await sleep(intervalMs);
    }
  },
});
