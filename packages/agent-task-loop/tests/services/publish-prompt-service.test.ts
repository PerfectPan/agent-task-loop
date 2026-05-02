import { describe, expect, it } from 'vitest';
import { buildCommitPrompt, buildPullRequestPrompt } from '../../src/services/publish-prompt-service';

describe('publish-prompt-service', () => {
  it('builds commit prompt from task result and history', () => {
    const prompt = buildCommitPrompt({
      taskTitle: '修复 worktree prettier 插件缺失',
      taskDescription: 'fresh worktree 中 prettier 找不到插件',
      resultSummary: 'setup.sh 会预装 rush-prettier 和 rush-lint-staged',
      sessionHistory: '[2026-04-16T10:00:00Z] | round=1 | kind=execute | agent=claude',
      diffStat: ' setup.sh | 12 +++++++++---',
    });

    expect(prompt).toContain('修复 worktree prettier 插件缺失');
    expect(prompt).toContain('SessionHistory');
    expect(prompt).toContain('只输出最终 commit message');
  });

  it('builds pull request prompt from task result and history', () => {
    const prompt = buildPullRequestPrompt({
      taskTitle: '修复 worktree prettier 插件缺失',
      taskDescription: 'fresh worktree 中 prettier 找不到插件',
      resultSummary: 'done',
      sessionHistory: 'round=1 execute',
      commitSummary: 'fix: install autoinstallers',
    });

    expect(prompt).toContain('严格 JSON');
    expect(prompt).toContain('CommitSummary');
    expect(prompt).toContain('验证结果');
  });
});
