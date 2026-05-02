import type { TaskService } from './task-service';
import { buildReworkPrompt } from './rework-prompt-service';
import type { TargetAgent, TaskRecord } from '../types/task';
import { appendSessionHistory, formatSessionHistoryEntry } from './session-history';

export class ReviewLoopService {
  constructor(
    private readonly deps: {
      executeRound: (input: {
        task: TaskRecord;
        promptOverride?: string;
        round: number;
      }) => Promise<{
        resultSummary?: string;
        sessionId?: string;
        sessionName?: string;
        workspacePath?: string;
        status?: '待复核' | '已失败';
      }>;
      review: (input: {
        task: TaskRecord;
        taskId: string;
        description: string;
        resultSummary?: string;
        workspacePath: string;
        reviewRound: number;
        reviewerAgent: TargetAgent;
        onSpawn?: (payload: { pid?: number }) => void;
        onHeartbeat?: () => void;
        onSession?: (payload: { sessionId?: string; sessionName?: string }) => void;
      }) => Promise<{ verdict: '通过' | '驳回'; findings: string; sessionId?: string; sessionName?: string }>;
      isTaskDeliverable: (input: { task: TaskRecord; workspacePath: string }) => Promise<boolean>;
      publishForAcceptance: (task: TaskRecord, workspacePath: string) => Promise<{ branch: string; commit: string }>;
      updatePublishResult: TaskService['updatePublishResult'];
      updateReviewState: TaskService['updateReviewState'];
      maxRounds: number;
    },
  ) {}

  async start(input: { task: TaskRecord; promptOverride?: string; startRound?: number }): Promise<void> {
    let round = input.startRound ?? 1;
    let promptOverride = input.promptOverride;

    while (round <= this.deps.maxRounds) {
      const execution = await this.deps.executeRound({
        task: input.task,
        promptOverride,
        round,
      });

      if (execution.workspacePath) {
        input.task.workspacePath = execution.workspacePath;
      }
      if (execution.sessionId) {
        input.task.executionSessionId = execution.sessionId;
      }
      if (execution.sessionName) {
        input.task.executionSessionName = execution.sessionName;
      }
      if (execution.status === '已失败') {
        return;
      }

      const reviewOutcome = await this.runReviewRound({
        task: input.task,
        round,
        resultSummary: execution.resultSummary,
        workspacePath: execution.workspacePath ?? input.task.workspacePath ?? '',
      });

      if (reviewOutcome.done) {
        return;
      }

      promptOverride = reviewOutcome.nextPromptOverride;
      round += 1;
    }

    await this.deps.updateReviewState(input.task, {
      status: '已失败',
      currentOwner: '董事长',
      reviewRound: this.deps.maxRounds,
      lastError: `Review loop exceeded ${this.deps.maxRounds} rounds`,
      sessionHistory: input.task.sessionHistory,
      progressSummary: '自动 review loop 超出最大轮次',
    });
  }

  async resumeFromReview(input: {
    task: TaskRecord;
    round: number;
    workspacePath: string;
    resultSummary?: string;
  }): Promise<void> {
    const reviewOutcome = await this.runReviewRound({
      task: input.task,
      round: input.round,
      resultSummary: input.resultSummary,
      workspacePath: input.workspacePath,
    });

    if (reviewOutcome.done) {
      return;
    }

    await this.start({
      task: input.task,
      promptOverride: reviewOutcome.nextPromptOverride,
      startRound: input.round + 1,
    });
  }

  private async runReviewRound(input: {
    task: TaskRecord;
    round: number;
    resultSummary?: string;
    workspacePath: string;
  }): Promise<{ done: boolean; nextPromptOverride?: string }> {
    const reviewerAgent = 'codex' as TargetAgent;
    let review: Awaited<ReturnType<typeof this.deps.review>>;
    try {
      review = await this.deps.review({
        task: input.task,
        taskId: input.task.taskId,
        description: input.task.description,
        resultSummary: input.resultSummary,
        workspacePath: input.workspacePath,
        reviewRound: input.round,
        reviewerAgent,
        acceptanceFeedback: input.task.acceptanceVerdict === '打回' ? input.task.acceptanceFeedback : undefined,
      });
    } catch (error) {
      await this.deps.updateReviewState(input.task, {
        status: '已失败',
        currentOwner: '董事长',
        reviewRound: input.round,
        executionSessionId: input.task.executionSessionId,
        executionSessionName: input.task.executionSessionName,
        reviewSessionId: input.task.reviewSessionId,
        reviewSessionName: input.task.reviewSessionName,
        sessionHistory: input.task.sessionHistory,
        progressSummary: `${reviewerAgent} 复核执行失败，请处理`,
        lastError: error instanceof Error ? error.message : String(error),
        runnerKind: '',
        runnerAgent: '',
      });
      return { done: true };
    }

    input.task.sessionHistory = appendSessionHistory(
      input.task.sessionHistory,
      formatSessionHistoryEntry({
        kind: 'review',
        round: input.round,
        agent: reviewerAgent,
        sessionName: review.sessionName,
        sessionId: review.sessionId,
        workspacePath: input.workspacePath,
      }),
    );

    if (review.verdict === '通过') {
      const isDeliverable = await this.deps.isTaskDeliverable({
        task: input.task,
        workspacePath: input.workspacePath,
      });
      let acceptanceProgressSummary = `${reviewerAgent} review 已通过，等待验收`;
      if (isDeliverable) {
        try {
          const publish = await this.deps.publishForAcceptance(input.task, input.workspacePath);
          acceptanceProgressSummary = '分支已推送，等待创建或更新 Pull Request';
          await this.deps.updatePublishResult(input.task, {
            publishBranch: publish.branch,
            publishCommit: publish.commit,
            progressSummary: acceptanceProgressSummary,
            resultSummary: input.task.resultSummary,
            sessionHistory: input.task.sessionHistory,
          });
        } catch (error) {
          await this.deps.updateReviewState(input.task, {
            status: '待发布',
            currentOwner: '董事长',
            reviewRound: input.round,
            reviewVerdict: '通过',
            reviewFindings: '',
            executionSessionId: input.task.executionSessionId,
            executionSessionName: input.task.executionSessionName,
            reviewSessionId: review.sessionId,
            reviewSessionName: review.sessionName,
            sessionHistory: input.task.sessionHistory,
            progressSummary: '自动推送远端分支失败，请先处理发布问题',
            lastError: error instanceof Error ? error.message : String(error),
            runnerKind: '',
            runnerAgent: '',
          });
          return { done: true };
        }
      }
      await this.deps.updateReviewState(input.task, {
        status: isDeliverable ? '待发布' : '待决策',
        currentOwner: '董事长',
        reviewRound: input.round,
        reviewVerdict: '通过',
        reviewFindings: '',
        executionSessionId: input.task.executionSessionId,
        executionSessionName: input.task.executionSessionName,
        reviewSessionId: review.sessionId,
        reviewSessionName: review.sessionName,
        sessionHistory: input.task.sessionHistory,
        progressSummary: isDeliverable ? acceptanceProgressSummary : '诊断已完成，等待董事长确定修复方向',
        runnerKind: '',
        runnerAgent: '',
      });
      return { done: true };
    }

    await this.deps.updateReviewState(input.task, {
      status: '修复中',
      currentOwner: input.task.targetAgent,
      reviewRound: input.round,
      reviewVerdict: '驳回',
      reviewFindings: review.findings,
      executionSessionId: input.task.executionSessionId,
      executionSessionName: input.task.executionSessionName,
      reviewSessionId: review.sessionId,
      reviewSessionName: review.sessionName,
      sessionHistory: input.task.sessionHistory,
      progressSummary: `${reviewerAgent} 复核未通过，正在回到 ${input.task.targetAgent} 修复`,
      runnerKind: '',
      runnerAgent: '',
    });

    return {
      done: false,
      nextPromptOverride: buildReworkPrompt({
        taskDescription: input.task.description,
        resultSummary: input.resultSummary,
        reviewFindings: review.findings,
      }),
    };
  }
}
