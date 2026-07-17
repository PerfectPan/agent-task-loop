import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AgentAdapter } from '../adapters/base';
import type { TaskRecord } from '../types/task';
import type { TaskService } from './task-service';
import { appendSessionHistory, formatSessionHistoryEntry } from './session-history';
import {
  formatFailureMessage,
  type FailureMessageFormatter,
} from './failure-message';

function buildSessionName(task: TaskRecord): string {
  return `${task.taskId}-${task.targetAgent}`
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-+/g, '-');
}

export class ExecutionService {
  constructor(
    private readonly deps: {
      taskService: Pick<
        TaskService,
        'claimTask' | 'updateTaskProgress' | 'markTaskSucceeded' | 'markTaskFailed' | 'updateReviewState' | 'updateRunnerState'
      >;
      adapter: AgentAdapter;
      adapterCommand: {
        command: string;
        args: string[];
        env: Record<string, string>;
        cwd: string;
        prompt: string;
      };
      onHeartbeatError?: (error: unknown) => void;
      formatFailure?: FailureMessageFormatter;
    },
  ) {}

  async executeTask(task: TaskRecord, workspacePath: string, round = 1): Promise<{
    runId: string;
    logPath: string;
    workspacePath: string;
    resultSummary?: string;
    executionSessionId?: string;
    executionSessionName: string;
    status: '待复核' | '已失败';
  }> {
    const runId = crypto.randomUUID();
    const logPath = path.join(workspacePath, '.agent-task-loop', 'logs', `${runId}.log`);
    const sessionName = buildSessionName(task);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const stream = fs.createWriteStream(logPath, { flags: 'a' });
    const writeLog = (chunk: string) => {
      stream.write(chunk);
      process.stdout.write(chunk);
    };
    let latestProgressSummary = `已认领任务，正在准备工作区并启动 ${task.targetAgent}`;
    let latestSessionId = task.sessionId;
    let latestSessionHistory = task.sessionHistory;
    let latestRunnerPid = task.runnerPid;
    let latestHeartbeatAt = new Date().toISOString();
    let lastRecordedSessionKey: string | undefined;
    let lastHeartbeatPersistedAt = 0;
    const persistHeartbeat = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastHeartbeatPersistedAt < 15_000) {
        return;
      }

      latestHeartbeatAt = new Date(now).toISOString();
      lastHeartbeatPersistedAt = now;
      try {
        await this.deps.taskService.updateRunnerState(task, {
          runnerPid: latestRunnerPid,
          runnerKind: 'execute',
          runnerAgent: task.targetAgent,
          runnerRound: round,
          lastHeartbeatAt: latestHeartbeatAt,
        });
      } catch (error) {
        if (this.deps.onHeartbeatError) {
          this.deps.onHeartbeatError(error);
        } else {
          const message = error instanceof Error ? error.message : String(error);
          writeLog(`\n[agent-task-loop] heartbeat update failed: ${message}\n`);
        }
      }
    };
    const writeProgress = async (summary: string) => {
      if (!summary || summary === latestProgressSummary) {
        return;
      }

      latestProgressSummary = summary;
      await this.deps.taskService.updateTaskProgress(task, {
        progressSummary: summary,
        workspacePath,
        logPath,
        sessionId: latestSessionId,
        sessionName,
        sessionHistory: latestSessionHistory,
        runnerPid: latestRunnerPid,
        runnerKind: 'execute',
        runnerAgent: task.targetAgent,
        runnerRound: round,
        lastHeartbeatAt: latestHeartbeatAt,
      });
    };
    const writeSession = async (payload: { sessionId?: string; sessionName?: string }) => {
      const nextSessionId = payload.sessionId ?? latestSessionId;
      const nextSessionName = payload.sessionName ?? sessionName;
      if (!nextSessionId && !nextSessionName) {
        return;
      }
      const sessionKey = `${nextSessionName ?? ''}:${nextSessionId ?? ''}`;
      if (sessionKey !== ':' && sessionKey !== lastRecordedSessionKey) {
        latestSessionHistory = appendSessionHistory(
          latestSessionHistory,
          formatSessionHistoryEntry({
            kind: 'execute',
            round,
            agent: task.targetAgent,
            sessionName: nextSessionName,
            sessionId: nextSessionId,
            workspacePath,
            runId,
          }),
        );
        task.sessionHistory = latestSessionHistory;
        lastRecordedSessionKey = sessionKey;
      }
      latestSessionId = nextSessionId;
      await this.deps.taskService.updateTaskProgress(task, {
        progressSummary: latestProgressSummary,
        workspacePath,
        logPath,
        sessionId: nextSessionId,
        sessionName: nextSessionName,
        sessionHistory: latestSessionHistory,
        runnerPid: latestRunnerPid,
        runnerKind: 'execute',
        runnerAgent: task.targetAgent,
        runnerRound: round,
        lastHeartbeatAt: latestHeartbeatAt,
      });
    };

    writeLog(`[agent-task-loop] runId=${runId}\n`);
    writeLog(`[agent-task-loop] workspace=${workspacePath}\n`);
    writeLog(`[agent-task-loop] logPath=${logPath}\n`);

    await this.deps.taskService.claimTask(task, {
      claimedBy: `${task.targetAgent}@local`,
      claimedAt: new Date().toISOString(),
      runId,
      workspacePath,
      logPath,
      progressSummary: latestProgressSummary,
      sessionId: latestSessionId,
      sessionName,
      sessionHistory: latestSessionHistory,
      runnerPid: latestRunnerPid,
      runnerKind: 'execute',
      runnerAgent: task.targetAgent,
      runnerRound: round,
      lastHeartbeatAt: latestHeartbeatAt,
    });

    try {
      await writeProgress(`正在使用 ${task.targetAgent} 执行任务`);
      const result = await this.deps.adapter.execute({
        task,
        workspacePath,
        cwd: this.deps.adapterCommand.cwd,
        prompt: this.deps.adapterCommand.prompt,
        command: this.deps.adapterCommand.command,
        args: this.deps.adapterCommand.args,
        env: this.deps.adapterCommand.env,
        sessionName,
        onSpawn: async payload => {
          latestRunnerPid = payload.pid;
          await persistHeartbeat(true);
        },
        onHeartbeat: async () => {
          await persistHeartbeat();
        },
        onOutput: writeLog,
        onProgress: writeProgress,
        onSession: writeSession,
      });

      if (result.status === 'success') {
        await this.deps.taskService.updateReviewState(task, {
          status: '待复核',
          currentOwner: 'codex',
          reviewRound: round,
          resultSummary: result.summary,
          workspacePath: result.workspacePath,
          logPath,
          progressSummary: '执行完成，等待 codex 复核',
          executionSessionId: latestSessionId,
          executionSessionName: sessionName,
          sessionHistory: latestSessionHistory,
          runnerKind: '',
          runnerAgent: '',
        });
        writeLog('\n[agent-task-loop] status=待复核\n');
        return {
          runId,
          logPath,
          workspacePath: result.workspacePath ?? workspacePath,
          resultSummary: result.summary,
          executionSessionId: latestSessionId,
          executionSessionName: sessionName,
          status: '待复核',
        };
      }

      await this.deps.taskService.updateReviewState(task, {
        status: '已失败',
        currentOwner: '董事长',
        lastError: formatFailureMessage(
          this.deps.formatFailure,
          result.error ?? 'unknown error',
          'Task execution failed',
        ),
        workspacePath: result.workspacePath,
        logPath,
        progressSummary: '执行失败，请查看 LastError 和日志',
        executionSessionId: latestSessionId,
        executionSessionName: sessionName,
        sessionHistory: latestSessionHistory,
        runnerKind: '',
        runnerAgent: '',
      });
      writeLog('\n[agent-task-loop] status=已失败\n');
      return {
        runId,
        logPath,
        workspacePath: result.workspacePath ?? workspacePath,
        resultSummary: result.summary,
        executionSessionId: latestSessionId,
        executionSessionName: sessionName,
        status: '已失败',
      };
    } catch (error) {
      const message = formatFailureMessage(
        this.deps.formatFailure,
        error,
        'Task execution failed',
      );
      await this.deps.taskService.updateReviewState(task, {
        status: '已失败',
        currentOwner: '董事长',
        lastError: message,
        workspacePath,
        logPath,
        progressSummary: '执行异常中断，请查看 LastError 和日志',
        executionSessionId: latestSessionId,
        executionSessionName: sessionName,
        sessionHistory: latestSessionHistory,
        runnerKind: '',
        runnerAgent: '',
      });
      writeLog(`\n[agent-task-loop] status=已失败\n[agent-task-loop] error=${message}\n`);
      return {
        runId,
        logPath,
        workspacePath,
        executionSessionId: latestSessionId,
        executionSessionName: sessionName,
        status: '已失败',
      };
    } finally {
      stream.end();
    }
  }
}
