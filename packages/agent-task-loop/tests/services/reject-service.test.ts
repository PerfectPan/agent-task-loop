import { describe, expect, it, vi } from 'vitest';
import { RejectService } from '../../src/services/reject-service';

describe('RejectService', () => {
  it('rejects a 待验收 task and re-enters the execution loop with acceptance feedback', async () => {
    const updateReviewState = vi.fn();
    const runLoop = vi.fn().mockResolvedValue(undefined);
    const getTaskById = vi.fn().mockResolvedValue({
      taskId: 'TASK-401',
      title: 'fix tenant switch logout',
      description: 'desc',
      project: 'demo',
      repository: 'demo',
      targetAgent: 'claude',
      priority: 1,
      status: '待验收',
      reviewRound: 3,
      reviewFindings: '1. 单测覆盖不够',
      resultSummary: '已修复代码',
      sessionHistory: 'round=1',
    });

    const service = new RejectService({
      taskService: {
        getTaskById,
        updateReviewState,
      } as never,
      runLoop,
    });

    await service.reject({
      taskId: 'TASK-401',
      reason: '单测没有证明真实业务行为；注释统一改中文；Pull Request 标题重写',
    });

    expect(updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-401' }),
      expect.objectContaining({
        status: '修复中',
        currentOwner: 'claude',
        acceptanceRound: 1,
        acceptanceVerdict: '打回',
        acceptanceFeedback: '单测没有证明真实业务行为；注释统一改中文；Pull Request 标题重写',
        progressSummary: '董事长验收未通过，正在回到 claude 修复',
      }),
    );
    expect(runLoop).toHaveBeenCalledWith({
      task: expect.objectContaining({
        taskId: 'TASK-401',
        acceptanceRound: 1,
        acceptanceVerdict: '打回',
        acceptanceFeedback: '单测没有证明真实业务行为；注释统一改中文；Pull Request 标题重写',
        status: '修复中',
      }),
      promptOverride: expect.stringContaining('董事长最新验收意见'),
      startRound: 4,
    });
  });

  it('only allows rejecting a 待验收 task', async () => {
    const service = new RejectService({
      taskService: {
        getTaskById: vi.fn().mockResolvedValue({
          taskId: 'TASK-402',
          title: 'title',
          description: 'desc',
          project: 'demo',
          targetAgent: 'claude',
          priority: 1,
          status: '待决策',
        }),
        updateReviewState: vi.fn(),
      } as never,
      runLoop: vi.fn(),
    });

    await expect(service.reject({ taskId: 'TASK-402', reason: '继续修' })).rejects.toThrow(
      'Task TASK-402 is not ready for acceptance rejection: 待决策',
    );
  });

  it('continues a failed rejection loop that only exceeded max rounds', async () => {
    const updateReviewState = vi.fn();
    const runLoop = vi.fn().mockResolvedValue(undefined);
    const getTaskById = vi.fn().mockResolvedValue({
      taskId: 'TASK-403',
      title: 'title',
      description: 'desc',
      project: 'demo',
      targetAgent: 'claude',
      priority: 1,
      status: '已失败',
      reviewRound: 5,
      reviewVerdict: '通过',
      resultSummary: '已完成上一轮',
      acceptanceRound: 3,
      acceptanceVerdict: '打回',
      acceptanceFeedback: '再看下 pull request 评论',
      lastError: 'Review loop exceeded 5 rounds',
      progressSummary: '自动 review loop 超出最大轮次',
      sessionHistory: 'round=5',
    });

    const service = new RejectService({
      taskService: {
        getTaskById,
        updateReviewState,
      } as never,
      runLoop,
    });

    await service.reject({ taskId: 'TASK-403', reason: '再看下 pull request 评论' });

    expect(updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-403' }),
      expect.objectContaining({
        status: '修复中',
        currentOwner: 'claude',
        acceptanceRound: 3,
        acceptanceVerdict: '打回',
        acceptanceFeedback: '再看下 pull request 评论',
      }),
    );
    expect(runLoop).toHaveBeenCalledWith({
      task: expect.objectContaining({
        taskId: 'TASK-403',
        status: '修复中',
        acceptanceRound: 3,
        acceptanceFeedback: '再看下 pull request 评论',
      }),
      promptOverride: expect.stringContaining('再看下 pull request 评论'),
      startRound: 6,
    });
  });
});
