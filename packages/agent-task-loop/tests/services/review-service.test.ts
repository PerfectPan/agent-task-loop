import { describe, expect, it, vi } from 'vitest';
import { ReviewService } from '../../src/services/review-service';

describe('ReviewService', () => {
  it('parses codex review output into verdict and findings', async () => {
    const service = new ReviewService({
      adapter: {
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          summary: JSON.stringify({
            verdict: '驳回',
            findings: [
              '1. [高] 缺少 hook 内自愈',
              '2. [中] 缺少 worktree 验证',
            ],
          }),
          workspacePath: '/tmp/workspace',
        }),
      } as never,
      command: {
        command: 'codex',
        args: [],
        env: {},
      },
    });

    const result = await service.review({
      taskId: 'TASK-201',
      description: 'desc',
      resultSummary: 'done',
      workspacePath: '/tmp/workspace',
      reviewRound: 1,
      reviewerAgent: 'codex',
    });

    expect(result.verdict).toBe('驳回');
    expect(result.findings).toContain('缺少 hook 内自愈');
    expect(result.sessionName).toBe('task-201-review-codex-r1');
  });

  it('extracts the final verdict JSON from mixed codex output', async () => {
    const service = new ReviewService({
      adapter: {
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          summary: [
            '先做事实核对。',
            '再跑一下验证。',
            '{"verdict":"通过","findings":[]}',
          ].join('\n'),
          workspacePath: '/tmp/workspace',
        }),
      } as never,
      command: {
        command: 'codex',
        args: [],
        env: {},
      },
    });

    const result = await service.review({
      taskId: 'TASK-202',
      description: 'desc',
      resultSummary: 'done',
      workspacePath: '/tmp/workspace',
      reviewRound: 2,
      reviewerAgent: 'codex',
    });

    expect(result.verdict).toBe('通过');
    expect(result.findings).toBe('');
    expect(result.sessionName).toBe('task-202-review-codex-r2');
  });

  it('passes chairman acceptance feedback to the review prompt as hard constraints', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 'success',
      summary: '{"verdict":"通过","findings":[]}',
      workspacePath: '/tmp/workspace',
    });

    const service = new ReviewService({
      adapter: {
        execute,
      } as never,
      command: {
        command: 'codex',
        args: [],
        env: {},
      },
    });

    await service.review({
      taskId: 'TASK-203',
      description: 'desc',
      resultSummary: 'done',
      workspacePath: '/tmp/workspace',
      reviewRound: 1,
      acceptanceFeedback: '删除这次新增测试，不要保留',
    });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('董事长最新验收意见（硬约束）'),
      }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('删除这次新增测试，不要保留'),
      }),
    );
  });

  it('uses the selected reviewer agent for session naming and execution target', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 'success',
      summary: '{"verdict":"通过","findings":[]}',
      workspacePath: '/tmp/workspace',
    });

    const service = new ReviewService({
      adapter: {
        execute,
      } as never,
      command: {
        command: 'claude',
        args: [],
        env: {},
      },
    });

    const result = await service.review({
      taskId: 'TASK-204',
      description: 'desc',
      resultSummary: 'done',
      workspacePath: '/tmp/workspace',
      reviewRound: 2,
      reviewerAgent: 'claude',
    });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionName: 'task-204-review-claude-r2',
        task: expect.objectContaining({
          targetAgent: 'claude',
        }),
      }),
    );
    expect(result.sessionName).toBe('task-204-review-claude-r2');
  });
});
