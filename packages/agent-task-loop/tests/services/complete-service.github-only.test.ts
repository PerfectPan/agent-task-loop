import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../src/config/schema';
import { CompleteService } from '../../src/services/complete-service';
import { TaskService } from '../../src/services/task-service';
import { GitHubIssuesTaskProvider, type GitHubRepoTarget } from '../../src/task-management/github-issues-task-provider';
import { StatefulTaskProvider } from '../../src/task-management/stateful-task-provider';
import { FileTaskStateStore } from '../../src/task-management/task-state-store';
import type { TaskRef } from '../../src/task-management/task-provider';

/**
 * Command-level end-to-end: the real CompleteService driving the real
 * GitHub-backed provider stack (StatefulTaskProvider over GitHubIssuesTaskProvider
 * with a real file-backed run-time store) against an in-memory fake GitHub API.
 * This is the flow that previously failed GitHub-only — complete() reading 待处理
 * back from the binary backend and refusing to publish. Here it must read 待发布
 * from the run-time store, build the PR (git/PR/AI stubbed), then transition the
 * task to 已完成 AND close the issue through the real provider.
 */

interface FakeIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  html_url: string;
  created_at: string;
  updated_at: string;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function fakeGitHub(seed: FakeIssue[]) {
  const byNumber = new Map<number, FakeIssue>();
  for (const issue of seed) {
    byNumber.set(issue.number, { ...issue });
  }
  const fetchMock = vi.fn(async (rawUrl: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = new URL(rawUrl);
    const { pathname } = url;
    if (method === 'GET' && pathname.endsWith('/issues')) {
      const page = Number(url.searchParams.get('page') ?? '1');
      return jsonResponse(200, page === 1 ? [...byNumber.values()] : []);
    }
    if (method === 'POST' && /\/issues\/\d+\/comments$/.test(pathname)) {
      return jsonResponse(201, {});
    }
    const patch = pathname.match(/\/issues\/(\d+)$/);
    if (method === 'PATCH' && patch) {
      const number = Number(patch[1]);
      const body = JSON.parse(String(init?.body ?? '{}')) as { state?: 'open' | 'closed' };
      const current = byNumber.get(number);
      if (current && body.state) {
        byNumber.set(number, { ...current, state: body.state });
      }
      return jsonResponse(200, {});
    }
    throw new Error(`fake GitHub: unhandled ${method} ${pathname}`);
  });
  return { fetchMock, byNumber };
}

const repoConfig: GitHubRepoTarget = { owner: 'rivus', repo: 'idea', token: 'test-token', defaultAgent: 'codex' };
const SOURCE = 'github:rivus/idea';

// resolveTaskExecutionContext keys: project = repo name, repository = owner/repo.
const config = {
  projects: {
    idea: { key: 'idea', name: 'Idea', defaultRepository: 'rivus/idea', workspaceRoot: '/tmp/worktrees', taskTemplatePrompt: '' },
  },
  repositories: {
    'rivus/idea': {
      key: 'rivus/idea',
      localPath: '/tmp/idea',
      defaultBranch: 'main',
      installCommand: 'pnpm install',
      testCommand: 'pnpm test',
      buildCommand: 'pnpm build',
      workspaceStrategy: 'worktree',
    },
  },
  agents: {},
} as unknown as AppConfig;

describe('CompleteService over a GitHub-only stack', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(path.join(os.tmpdir(), 'atl-gh-complete-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('publishes a 待发布 GitHub task, closes the issue, and reads back 已完成', async () => {
    const fake = fakeGitHub([
      {
        number: 60,
        title: 'Implement feature',
        body: 'build it\n\n<!-- task-id: TASK-360 -->',
        state: 'open',
        labels: [{ name: 'agent:codex' }],
        html_url: 'https://github.com/rivus/idea/issues/60',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      },
    ]);
    vi.stubGlobal('fetch', fake.fetchMock);

    const store = new FileTaskStateStore(baseDir);
    const provider = new StatefulTaskProvider(new GitHubIssuesTaskProvider(repoConfig), store);
    const taskService = new TaskService(provider);

    // Bring the task to the state the review loop would leave it in: 待发布 with a
    // workspace — persisted in the run-time store, not in the (open) issue.
    const ref: TaskRef = { taskId: 'TASK-360', recordId: '60', source: SOURCE };
    await taskService.updateReviewState(ref, {
      status: '待发布',
      reviewRound: 1,
      reviewVerdict: '通过',
      resultSummary: 'feature done',
      workspacePath: '/tmp/worktree/360',
      sessionHistory: 'round=1 execute',
    });

    const ready = await taskService.getTaskById('TASK-360');
    expect(ready?.status).toBe('待发布');
    expect(ready?.workspacePath).toBe('/tmp/worktree/360');

    const service = new CompleteService({
      config,
      taskService,
      publishContextService: {
        load: vi.fn().mockResolvedValue({
          branch: 'task/idea-360',
          headCommit: 'abc123',
          isDirty: false,
          diffStat: '',
          diff: '',
          status: '',
          workspacePath: '/tmp/worktree/360',
        }),
      } as never,
      gitPublishService: {
        commitAll: vi.fn(),
        pushBranch: vi.fn(),
        getRemoteBranchHead: vi.fn().mockResolvedValue('abc123'),
      } as never,
      pullRequestService: {
        findOpenPullRequestByBranch: vi.fn().mockResolvedValue(undefined),
        createReadyPullRequest: vi.fn().mockResolvedValue({
          number: 77,
          url: 'https://github.com/rivus/idea/pull/77',
          description: 'body',
        }),
        getPullRequest: vi.fn(),
        updatePullRequest: vi.fn().mockImplementation((input: { description: string }) =>
          Promise.resolve({
            number: 77,
            url: 'https://github.com/rivus/idea/pull/77',
            description: input.description,
          }),
        ),
      } as never,
      generateCommitMessage: vi.fn().mockResolvedValue({ message: 'feat: feature', sessionId: 'c1', sessionName: 's1' }),
      generatePullRequestContent: vi
        .fn()
        .mockResolvedValue({ title: 'feat: feature', body: 'pr body', sessionId: 'p1', sessionName: 's2' }),
    });

    const result = await service.complete({ taskId: 'TASK-360' });

    expect(result.pullRequestUrl).toBe('https://github.com/rivus/idea/pull/77');
    // The real provider closed the issue on the terminal 已完成 transition.
    expect(fake.byNumber.get(60)?.state).toBe('closed');
    // And the task now reads back as 已完成 through the same stack.
    expect((await taskService.getTaskById('TASK-360'))?.status).toBe('已完成');
  });
});
