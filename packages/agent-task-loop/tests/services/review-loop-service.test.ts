import { describe, expect, it, vi } from 'vitest';
import { ReviewLoopService } from '../../src/services/review-loop-service';

describe('ReviewLoopService', () => {
  it('re-enters execution when review rejects and exits when review passes', async () => {
    const executeRound = vi
      .fn()
      .mockResolvedValueOnce({ resultSummary: 'round-1', sessionId: 'exec-1', sessionName: 'task-201-claude-r1' })
      .mockResolvedValueOnce({ resultSummary: 'round-2', sessionId: 'exec-2', sessionName: 'task-201-claude-r2' });
    const review = vi
      .fn()
      .mockResolvedValueOnce({ verdict: '驳回', findings: '1. [高] fix one', sessionId: 'review-1', sessionName: 'task-201-review-codex-r1' })
      .mockResolvedValueOnce({ verdict: '通过', findings: '', sessionId: 'review-2', sessionName: 'task-201-review-codex-r2' });
    const updateReviewState = vi.fn();
    const updatePublishResult = vi.fn();
    const publishForAcceptance = vi.fn().mockResolvedValue({
      branch: 'task/task-201-claude',
      commit: 'abc201',
    });

    const service = new ReviewLoopService({
      executeRound,
      review,
      isTaskDeliverable: vi.fn().mockResolvedValue(true),
      publishForAcceptance,
      updatePublishResult,
      updateReviewState,
      maxRounds: 5,
    });

    await service.start({
      task: {
        taskId: 'TASK-201',
        title: 'title',
        description: 'desc',
        project: 'demo',
        targetAgent: 'claude',
        priority: 10,
        status: '待处理',
        sessionHistory: '[2026-04-11T00:00:00Z] | round=0 | kind=execute | agent=claude | id=bootstrap',
      } as never,
    });

    expect(executeRound).toHaveBeenCalledTimes(2);
    expect(review).toHaveBeenCalledTimes(2);
    expect(review).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        acceptanceFeedback: undefined,
      }),
    );
    expect(updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-201' }),
      expect.objectContaining({
        status: '待发布',
        reviewVerdict: '通过',
        currentOwner: '董事长',
        sessionHistory: expect.stringContaining('kind=review'),
      }),
    );
  });

  it('moves to 待决策 when review passes but no deliverable was produced', async () => {
    const executeRound = vi.fn().mockResolvedValue({
      resultSummary: '诊断完成',
      sessionId: 'exec-1',
      sessionName: 'task-202-claude-r1',
      workspacePath: '/tmp/TASK-202-claude',
    });
    const review = vi.fn().mockResolvedValue({
      verdict: '通过',
      findings: '',
      sessionId: 'review-1',
      sessionName: 'task-202-review-codex-r1',
    });
    const updateReviewState = vi.fn();
    const updatePublishResult = vi.fn();

    const service = new ReviewLoopService({
      executeRound,
      review,
      isTaskDeliverable: vi.fn().mockResolvedValue(false),
      publishForAcceptance: vi.fn(),
      updatePublishResult,
      updateReviewState,
      maxRounds: 3,
    });

    await service.start({
      task: {
        taskId: 'TASK-202',
        title: 'diagnosis only',
        description: 'find the root cause',
        project: 'demo',
        targetAgent: 'claude',
        priority: 10,
        status: '待处理',
      } as never,
    });

    expect(updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-202' }),
      expect.objectContaining({
        status: '待决策',
        reviewVerdict: '通过',
        currentOwner: '董事长',
        progressSummary: '诊断已完成，等待董事长确定修复方向',
        sessionHistory: expect.stringContaining('kind=review'),
      }),
    );
  });

  it('pushes deliverable before moving task to 待发布', async () => {
    const executeRound = vi.fn().mockResolvedValue({
      resultSummary: '修复完成',
      sessionId: 'exec-1',
      sessionName: 'task-204-claude',
      workspacePath: '/tmp/TASK-204-claude',
    });
    const review = vi.fn().mockResolvedValue({
      verdict: '通过',
      findings: '',
      sessionId: 'review-1',
      sessionName: 'task-204-review-codex-r1',
    });
    const updateReviewState = vi.fn();
    const updatePublishResult = vi.fn();
    const publishForAcceptance = vi.fn().mockResolvedValue({
      branch: 'task/task-204-claude',
      commit: 'abc123',
    });

    const service = new ReviewLoopService({
      executeRound,
      review,
      isTaskDeliverable: vi.fn().mockResolvedValue(true),
      publishForAcceptance,
      updateReviewState,
      updatePublishResult,
      maxRounds: 5,
    });

    await service.start({
      task: {
        taskId: 'TASK-204',
        title: 'title',
        description: 'desc',
        project: 'demo',
        targetAgent: 'claude',
        priority: 10,
        status: '待处理',
      } as never,
    });

    expect(publishForAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'TASK-204',
      }),
      '/tmp/TASK-204-claude',
    );
    expect(updatePublishResult).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-204' }),
      expect.objectContaining({
        publishBranch: 'task/task-204-claude',
        publishCommit: 'abc123',
        progressSummary: '分支已推送，等待创建或更新 Pull Request',
      }),
    );
    expect(updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-204' }),
      expect.objectContaining({
        status: '待发布',
        reviewVerdict: '通过',
        currentOwner: '董事长',
      }),
    );
  });

  it('moves deliverable task to 待发布 when auto push fails', async () => {
    const executeRound = vi.fn().mockResolvedValue({
      resultSummary: '修复完成',
      sessionId: 'exec-1',
      sessionName: 'task-205-claude',
      workspacePath: '/tmp/TASK-205-claude',
    });
    const review = vi.fn().mockResolvedValue({
      verdict: '通过',
      findings: '',
      sessionId: 'review-1',
      sessionName: 'task-205-review-codex-r1',
    });
    const updateReviewState = vi.fn();
    const updatePublishResult = vi.fn();
    const publishForAcceptance = vi.fn().mockRejectedValue(new Error('push failed'));

    const service = new ReviewLoopService({
      executeRound,
      review,
      isTaskDeliverable: vi.fn().mockResolvedValue(true),
      publishForAcceptance,
      updateReviewState,
      updatePublishResult,
      maxRounds: 5,
    });

    await service.start({
      task: {
        taskId: 'TASK-205',
        title: 'title',
        description: 'desc',
        project: 'demo',
        targetAgent: 'claude',
        priority: 10,
        status: '待处理',
      } as never,
    });

    expect(updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-205' }),
      expect.objectContaining({
        status: '待发布',
        currentOwner: '董事长',
        lastError: 'push failed',
        progressSummary: '自动推送远端分支失败，请先处理发布问题',
      }),
    );
  });

  it('passes chairman rejection feedback into later review rounds as hard constraints', async () => {
    const executeRound = vi.fn().mockResolvedValue({
      resultSummary: '按董事长要求删掉测试',
      sessionId: 'exec-7',
      sessionName: 'task-207-claude',
      workspacePath: '/tmp/TASK-207-claude',
    });
    const review = vi.fn().mockResolvedValue({
      verdict: '通过',
      findings: '',
      sessionId: 'review-7',
      sessionName: 'task-207-review-codex-r7',
    });
    const updateReviewState = vi.fn();
    const updatePublishResult = vi.fn();
    const publishForAcceptance = vi.fn().mockResolvedValue({
      branch: 'task/task-207-claude',
      commit: 'abc207',
    });

    const service = new ReviewLoopService({
      executeRound,
      review,
      isTaskDeliverable: vi.fn().mockResolvedValue(true),
      publishForAcceptance,
      updatePublishResult,
      updateReviewState,
      maxRounds: 5,
    });

    await service.start({
      task: {
        taskId: 'TASK-207',
        title: 'title',
        description: 'desc',
        project: 'demo',
        targetAgent: 'claude',
        priority: 10,
        status: '修复中',
        acceptanceVerdict: '打回',
        acceptanceFeedback: '删除这次新增测试，不要再保留',
      } as never,
    });

    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptanceFeedback: '删除这次新增测试，不要再保留',
      }),
    );
  });

  it('keeps codex as reviewer when codex is the execution agent', async () => {
    const executeRound = vi.fn().mockResolvedValue({
      resultSummary: 'codex fixed it',
      sessionId: 'exec-codex',
      sessionName: 'task-208-codex',
      workspacePath: '/tmp/TASK-208-codex',
    });
    const review = vi.fn().mockResolvedValue({
      verdict: '通过',
      findings: '',
      sessionId: 'review-codex',
      sessionName: 'task-208-review-codex-r1',
    });
    const updateReviewState = vi.fn();
    const updatePublishResult = vi.fn();
    const publishForAcceptance = vi.fn().mockResolvedValue({
      branch: 'task/task-208-codex',
      commit: 'abc208',
    });

    const service = new ReviewLoopService({
      executeRound,
      review,
      isTaskDeliverable: vi.fn().mockResolvedValue(true),
      publishForAcceptance,
      updatePublishResult,
      updateReviewState,
      maxRounds: 5,
    });

    await service.start({
      task: {
        taskId: 'TASK-208',
        title: 'title',
        description: 'desc',
        project: 'demo',
        targetAgent: 'codex',
        priority: 10,
        status: '待处理',
      } as never,
    });

    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewerAgent: 'codex',
      }),
    );
    expect(updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-208' }),
      expect.objectContaining({
        reviewSessionName: 'task-208-review-codex-r1',
        progressSummary: '分支已推送，等待创建或更新 Pull Request',
      }),
    );
  });

  it('can resume directly from a stale review phase without re-running execute', async () => {
    const executeRound = vi.fn();
    const review = vi.fn().mockResolvedValue({
      verdict: '通过',
      findings: '',
      sessionId: 'review-3',
      sessionName: 'task-203-review-codex-r3',
    });
    const updateReviewState = vi.fn();
    const updatePublishResult = vi.fn();
    const publishForAcceptance = vi.fn().mockResolvedValue({
      branch: 'task/task-203-claude',
      commit: 'abc203',
    });

    const service = new ReviewLoopService({
      executeRound,
      review,
      isTaskDeliverable: vi.fn().mockResolvedValue(true),
      publishForAcceptance,
      updatePublishResult,
      updateReviewState,
      maxRounds: 5,
    });

    await service.resumeFromReview({
      task: {
        taskId: 'TASK-203',
        title: 'title',
        description: 'desc',
        project: 'demo',
        targetAgent: 'claude',
        priority: 1,
        status: '待复核',
        executionSessionId: 'exec-3',
        executionSessionName: 'task-203-claude',
      } as never,
      round: 3,
      workspacePath: '/tmp/TASK-203-claude',
      resultSummary: 'done',
    });

    expect(executeRound).not.toHaveBeenCalled();
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'TASK-203',
        reviewRound: 3,
        workspacePath: '/tmp/TASK-203-claude',
      }),
    );
    expect(updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-203' }),
      expect.objectContaining({
        status: '待发布',
        reviewVerdict: '通过',
      }),
    );
  });

  it('marks the task as 已失败 when review execution throws', async () => {
    const executeRound = vi.fn().mockResolvedValue({
      resultSummary: '修复完成',
      sessionId: 'exec-9',
      sessionName: 'task-206-claude',
      workspacePath: '/tmp/TASK-206-claude',
    });
    const review = vi.fn().mockRejectedValue(new Error('review output did not contain a valid verdict JSON'));
    const updateReviewState = vi.fn();
    const updatePublishResult = vi.fn();

    const service = new ReviewLoopService({
      executeRound,
      review,
      isTaskDeliverable: vi.fn().mockResolvedValue(true),
      publishForAcceptance: vi.fn(),
      updatePublishResult,
      updateReviewState,
      maxRounds: 5,
    });

    await service.start({
      task: {
        taskId: 'TASK-206',
        title: 'title',
        description: 'desc',
        project: 'demo',
        targetAgent: 'claude',
        priority: 10,
        status: '待处理',
      } as never,
    });

    expect(updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-206' }),
      expect.objectContaining({
        status: '已失败',
        currentOwner: '董事长',
        progressSummary: 'codex 复核执行失败，请处理',
        lastError: 'review output did not contain a valid verdict JSON',
      }),
    );
  });

  it('uses an injected neutral failure message when review execution throws', async () => {
    const sensitiveMessage = 'review provider leaked credential=sensitive-test-value';
    const updateReviewState = vi.fn();
    const service = new ReviewLoopService({
      executeRound: vi.fn().mockResolvedValue({
        resultSummary: 'done',
        workspacePath: '/tmp/TASK-209-codex',
      }),
      review: vi.fn().mockRejectedValue(new Error(sensitiveMessage)),
      isTaskDeliverable: vi.fn(),
      publishForAcceptance: vi.fn(),
      updatePublishResult: vi.fn(),
      updateReviewState,
      maxRounds: 1,
      formatFailure: (_error, neutralMessage) => neutralMessage,
    });

    await service.start({
      task: {
        taskId: 'TASK-209',
        title: 'title',
        description: 'desc',
        project: 'demo',
        targetAgent: 'codex',
        priority: 1,
        status: '待处理',
      } as never,
    });

    expect(updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-209' }),
      expect.objectContaining({ lastError: 'Task review failed' }),
    );
    expect(JSON.stringify(updateReviewState.mock.calls)).not.toContain(sensitiveMessage);
  });

});
