import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubIssuesTaskProvider, type GitHubRepoTarget } from '../../src/task-management/github-issues-task-provider';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const config: GitHubRepoTarget = {
  owner: 'rivus',
  repo: 'idea',
  token: 'gh-token',
  defaultAgent: 'codex',
};

const tokenlessConfig: GitHubRepoTarget = {
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
          body: 'finished\n\n<!-- task-id: IDEA-902 -->',
          state: 'closed',
          labels: [],
          html_url: 'https://github.com/rivus/idea/issues/9',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-03T00:00:00Z',
        },
        {
          number: 10,
          title: 'Handed off by label',
          body: 'no marker, but labeled',
          state: 'open',
          labels: [{ name: 'agent:glm' }],
          html_url: 'https://github.com/rivus/idea/issues/10',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-04T00:00:00Z',
        },
        {
          number: 11,
          title: 'Unrelated issue',
          body: 'just a normal issue nobody handed off',
          state: 'open',
          labels: [{ name: 'bug' }],
          html_url: 'https://github.com/rivus/idea/issues/11',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-05T00:00:00Z',
        },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const tasks = await new GitHubIssuesTaskProvider(config).listTasks();

    // PR (#8) skipped; unmanaged issue (#11, no marker/no agent label) excluded.
    expect(tasks).toHaveLength(3);
    expect(tasks.map(t => t.recordId)).toEqual(['7', '9', '10']);
    expect(tasks[0]).toMatchObject({
      source: 'github:rivus/idea',
      recordId: '7',
      taskId: 'IDEA-900',
      title: 'Add dark mode',
      description: 'do the thing',
      targetAgent: 'claude',
      priority: 5,
      status: '待处理',
      repository: 'rivus/idea',
    });
    // Marker ⇒ managed; closed ⇒ 已完成; no agent label ⇒ default agent.
    expect(tasks[1]).toMatchObject({ taskId: 'IDEA-902', status: '已完成', targetAgent: 'codex' });
    // No marker but agent label ⇒ managed; derived id; label drives the agent.
    expect(tasks[2]).toMatchObject({ taskId: 'GH-10', status: '待处理', targetAgent: 'glm' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/repos/rivus/idea/issues?state=all');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer gh-token' });
  });

  it('does NOT put the issue URL in prLink (so delivery checks are not short-circuited)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, [
        {
          number: 7,
          title: 'Add dark mode',
          body: 'do the thing\n\n<!-- task-id: IDEA-900 -->',
          state: 'open',
          labels: [{ name: 'agent:codex' }],
          html_url: 'https://github.com/rivus/idea/issues/7',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
        },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [task] = await new GitHubIssuesTaskProvider(config).listTasks();
    expect(task!.prLink).toBeUndefined();
  });

  it('updateTaskAssignment rewrites the agent:<name> label on the issue', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          number: 7,
          title: 't',
          body: '',
          state: 'open',
          labels: [{ name: 'agent:codex' }, { name: 'P3' }],
          html_url: 'x',
          created_at: 'x',
          updated_at: 'x',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await new GitHubIssuesTaskProvider(config).updateTaskAssignment(
      { taskId: 'IDEA-900', recordId: '7', source: 'github' },
      { targetAgent: 'claude' },
    );

    expect(fetchMock.mock.calls[0][0]).toContain('/issues/7');
    const patch = fetchMock.mock.calls[1];
    expect((patch[1] as RequestInit).method).toBe('PATCH');
    const body = JSON.parse(String((patch[1] as RequestInit).body));
    // Old agent label dropped, P3 kept, new agent label added.
    expect(body.labels).toEqual(['P3', 'agent:claude']);
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

  it('comments without closing on markTaskSucceeded (待验收 — awaiting acceptance)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await new GitHubIssuesTaskProvider(config).markTaskSucceeded(
      { taskId: 'IDEA-900', recordId: '7', source: 'github' },
      { resultSummary: 'shipped', prLink: 'https://github.com/rivus/idea/pull/10' },
    );

    // Only a comment — the issue stays open until the terminal 已完成 transition.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/issues/7/comments');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('comments and closes the issue when the review state reaches 已完成', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await new GitHubIssuesTaskProvider(config).updateReviewState(
      { taskId: 'IDEA-900', recordId: '7', source: 'github' },
      { status: '已完成' },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/issues/7/comments');
    const patch = fetchMock.mock.calls[1];
    expect(patch[0]).toContain('/issues/7');
    expect((patch[1] as RequestInit).method).toBe('PATCH');
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({ state: 'closed' });
  });

  it('does not close the issue on a non-terminal review state (待发布)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await new GitHubIssuesTaskProvider(config).updateReviewState(
      { taskId: 'IDEA-900', recordId: '7', source: 'github' },
      { status: '待发布' },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/issues/7/comments');
  });

  it('paginates listTasks across pages until a short page', async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => ({
      number: index + 1,
      title: `task ${index + 1}`,
      body: `body\n\n<!-- task-id: IDEA-${index + 1} -->`,
      state: 'open' as const,
      labels: [{ name: 'agent:codex' }],
      html_url: `https://github.com/rivus/idea/issues/${index + 1}`,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    }));
    const secondPage = [
      {
        number: 101,
        title: 'last task',
        body: 'body\n\n<!-- task-id: IDEA-101 -->',
        state: 'open' as const,
        labels: [{ name: 'agent:codex' }],
        html_url: 'https://github.com/rivus/idea/issues/101',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, fullPage))
      .mockResolvedValueOnce(jsonResponse(200, secondPage));
    vi.stubGlobal('fetch', fetchMock);

    const tasks = await new GitHubIssuesTaskProvider(config).listTasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('page=1');
    expect(fetchMock.mock.calls[1][0]).toContain('page=2');
    expect(tasks).toHaveLength(101);
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
