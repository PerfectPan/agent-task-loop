import { buildReworkPrompt } from './rework-prompt-service';
import type { TaskService } from './task-service';
import type { TaskRecord } from '../types/task';

export class RejectService {
  constructor(
    private readonly deps: {
      taskService: Pick<TaskService, 'getTaskById' | 'updateReviewState'>;
      runLoop: (input: { task: TaskRecord; promptOverride: string; startRound: number }) => Promise<void>;
    },
  ) {}

  async reject(input: { taskId: string; reason: string }): Promise<void> {
    const task = await this.deps.taskService.getTaskById(input.taskId);
    if (!task) {
      throw new Error(`Task ${input.taskId} not found`);
    }
    const canResumeFailedReject =
      task.status === '已失败' &&
      task.acceptanceVerdict === '打回' &&
      Boolean(task.acceptanceFeedback) &&
      (task.lastError?.startsWith('Review loop exceeded') ||
        task.progressSummary === '自动 review loop 超出最大轮次');
    if (task.status !== '待验收' && !canResumeFailedReject) {
      throw new Error(`Task ${task.taskId} is not ready for acceptance rejection: ${task.status}`);
    }

    const currentAcceptanceRound = task.acceptanceRound ?? 0;
    const isSameFailedRejectReason = canResumeFailedReject && task.acceptanceFeedback === input.reason;
    const acceptanceRound = isSameFailedRejectReason
      ? Math.max(currentAcceptanceRound, 1)
      : currentAcceptanceRound + 1;
    const promptOverride = buildReworkPrompt({
      taskDescription: task.description,
      resultSummary: task.resultSummary,
      reviewFindings: task.reviewFindings,
      acceptanceFeedback: input.reason,
    });

    task.acceptanceRound = acceptanceRound;
    task.acceptanceVerdict = '打回';
    task.acceptanceFeedback = input.reason;
    task.status = '修复中';
    task.currentOwner = task.targetAgent;

    await this.deps.taskService.updateReviewState(task, {
      status: '修复中',
      currentOwner: task.targetAgent,
      reviewRound: task.reviewRound,
      reviewVerdict: task.reviewVerdict,
      reviewFindings: task.reviewFindings,
      acceptanceRound,
      acceptanceVerdict: '打回',
      acceptanceFeedback: input.reason,
      executionSessionId: task.executionSessionId,
      executionSessionName: task.executionSessionName,
      reviewSessionId: task.reviewSessionId,
      reviewSessionName: task.reviewSessionName,
      reviewLogPath: task.reviewLogPath,
      sessionHistory: task.sessionHistory,
      resultSummary: task.resultSummary,
      workspacePath: task.workspacePath,
      logPath: task.logPath,
      progressSummary: `董事长验收未通过，正在回到 ${task.targetAgent} 修复`,
    });

    await this.deps.runLoop({
      task,
      promptOverride,
      startRound: (task.reviewRound ?? 0) + 1,
    });
  }
}
