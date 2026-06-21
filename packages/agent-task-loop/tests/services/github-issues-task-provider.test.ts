import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubIssuesTaskProvider } from '../../src/task-management/github-issues-task-provider';
import type { GitHubIssuesConfig } from '../../src/config/schema';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const config: GitHubIssuesConfig = {
  owner: 'rivus',
  repo: 'idea',
  token: 'gh-token',
  defaultAgent: 'codex',
};

const tokenlessConfig: GitHubIssuesConfig = {
  owner: 'rivus',
  repo: 'idea',
  defaultAgent: 'codex',
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const originalGithubToken = process.env.GITHUB_TOKEN;

afterEach(() => {
  vi.restoreAllMocks();
  execaMock.mockReset();
  if (originalGithubToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = originalGithubToken;
  }
});

describe('GitHubIssuesTaskProvider', () => {
  it('maps issues to tasks, skips PRs, reads agent/priority labels and the task-id marker', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, [
        {
          number: 7,
          title: 'Add dark mode',
          body: 'do the thing\n\n<!-- task-id: IDEA-900 -->',
          state: 'open',
          labels: [{ name: 'agent:claude' }, { name: 'P5' }],
          html_url: 'https://github.com/rivus/idea/issues/7',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
        },
        {
          number: 8,
          title: 'A pull request',
          body: '',
          state: 'open',
          labels: [],
          html_url: 'https://github.com/rivus/idea/pull/8',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
          pull_request: { url: 'x' },
        },
        {
          number: 9,
          title: 'Closed one',
          body: 'no marker here',
          state: 'closed',
          labels: [],
          html_url: 'https://github.com/rivus/idea/issues/9',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-03T00:00:00Z',
        },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const tasks = await new GitHubIssuesTaskProvider(config).listTasks();

    expect(tasks).toHaveLength(2); // PR skipped
    expect(tasks[0]).toMatchObject({
      source: 'github',
      recordId: '7',
      taskId: 'IDEA-900',
      title: 'Add dark mode',
      description: 'do the thing',
      targetAgent: 'claude',
      priority: 5,
      status: '待处理',
      repository: 'rivus/idea',
    });
    // No marker ⇒ derived id; closed ⇒ 已完成; no agent label ⇒ default agent.
    expect(tasks[1]).toMatchObject({ taskId: 'GH-9', status: '已完成', targetAgent: 'codex' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/repos/rivus/idea/issues?state=all');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer gh-token' });
  });

  it('creates an issue with the task-id marker and agent/priority labels', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { number: 42 }));
    vi.stubGlobal('fetch', fetchMock);

    await new GitHubIssuesTaskProvider(config).createTask({
      taskId: 'IDEA-901',
      title: 'New feature',
      project: 'idea',
      targetAgent: 'codex',
      priority: 2,
      description: 'build it',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/repos/rivus/idea/issues');
    const payload = JSON.parse(String((init as RequestInit).body));
    expect(payload.title).toBe('New feature');
    expect(payload.body).toContain('<!-- task-id: IDEA-901 -->');
    expect(payload.labels).toEqual(['agent:codex', 'P2']);
  });

  it('comments and closes the issue when a task succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await new GitHubIssuesTaskProvider(config).markTaskSucceeded(
      { taskId: 'IDEA-900', recordId: '7', source: 'github' },
      { resultSummary: 'shipped', prLink: 'https://github.com/rivus/idea/pull/10' },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/issues/7/comments');
    const patch = fetchMock.mock.calls[1];
    expect(patch[0]).toContain('/issues/7');
    expect((patch[1] as RequestInit).method).toBe('PATCH');
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({ state: 'closed' });
  });

  it('falls back to `gh auth token` when no config token / GITHUB_TOKEN', async () => {
    delete process.env.GITHUB_TOKEN;
    execaMock.mockResolvedValue({ stdout: 'ghp_fallback\n', exitCode: 0 });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
    vi.stubGlobal('fetch', fetchMock);

    await new GitHubIssuesTaskProvider(tokenlessConfig).listTasks();

    expect(execaMock).toHaveBeenCalledWith('gh', ['auth', 'token'], expect.objectContaining({ reject: false }));
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer ghp_fallback' });
  });

  it('degrades to an unauthenticated request when `gh` is unavailable', async () => {
    delete process.env.GITHUB_TOKEN;
    execaMock.mockRejectedValue(new Error('gh: command not found'));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
    vi.stubGlobal('fetch', fetchMock);

    await new GitHubIssuesTaskProvider(tokenlessConfig).listTasks();

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).not.toHaveProperty('Authorization');
  });

  it('throws a clear error when writing without an issue number', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      new GitHubIssuesTaskProvider(config).markTaskFailed({ taskId: 'IDEA-900', source: 'github' }, { lastError: 'x' }),
    ).rejects.toThrow(/missing its issue number/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
