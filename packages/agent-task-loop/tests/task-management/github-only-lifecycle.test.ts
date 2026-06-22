import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubIssuesTaskProvider, type GitHubRepoTarget } from '../../src/task-management/github-issues-task-provider';
import { StatefulTaskProvider } from '../../src/task-management/stateful-task-provider';
import { FileTaskStateStore } from '../../src/task-management/task-state-store';
import type { TaskRef } from '../../src/task-management/task-provider';

/**
 * End-to-end parity test: a GitHub-Issues backend is binary (open/closed), yet
 * the loop must drive a task through the SAME lifecycle a full-fidelity backend
 * (Feishu) supports. This wires the REAL provider stack — StatefulTaskProvider
 * over a real GitHubIssuesTaskProvider and a real file-backed run-time store —
 * against an in-memory fake GitHub API, then walks the whole loop and asserts
 * the status read back at every step matches the Feishu-equivalent, including
 * that cleanup never resurrects a finished task back to 待处理.
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

/** A minimal in-memory GitHub Issues API backing one repo. */
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
      // Single page of data; later pages are empty (terminates pagination).
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

function issue(number: number, taskId: string): FakeIssue {
  return {
    number,
    title: `task ${taskId}`,
    body: `do the work\n\n<!-- task-id: ${taskId} -->`,
    state: 'open',
    labels: [{ name: 'agent:codex' }],
    html_url: `https://github.com/rivus/idea/issues/${number}`,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  };
}

const config: GitHubRepoTarget = { owner: 'rivus', repo: 'idea', token: 'test-token', defaultAgent: 'codex' };
const SOURCE = 'github:rivus/idea';

describe('GitHub-only lifecycle (real stack + fake GitHub)', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(path.join(os.tmpdir(), 'atl-gh-e2e-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(baseDir, { recursive: true, force: true });
  });

  function buildStack(seed: FakeIssue[]) {
    const fake = fakeGitHub(seed);
    vi.stubGlobal('fetch', fake.fetchMock);
    const store = new FileTaskStateStore(baseDir);
    const sp = new StatefulTaskProvider(new GitHubIssuesTaskProvider(config), store);
    return { sp, store, fake };
  }

  it('drives execute → review → publish → complete and stays 已完成 after cleanup', async () => {
    const { sp, store, fake } = buildStack([issue(50, 'IDEA-50')]);

    // Open issue ⇒ 待处理, just like a fresh Feishu row.
    const seeded = await sp.getTaskById('IDEA-50');
    expect(seeded?.status).toBe('待处理');
    const ref: TaskRef = { taskId: 'IDEA-50', recordId: '50', source: SOURCE };

    // claim ⇒ 执行中 (status injected by the decorator, mirrored to the store).
    await sp.claimTask(ref, {
      claimedBy: 'codex@local',
      claimedAt: '2026-06-02T00:00:00Z',
      runId: 'run-1',
      workspacePath: '/tmp/ws/50',
    });
    expect((await sp.getTaskById('IDEA-50'))?.status).toBe('执行中');

    // execution done ⇒ 待复核.
    await sp.updateReviewState(ref, { status: '待复核', reviewRound: 1, resultSummary: 'did the work' });
    expect((await sp.getTaskById('IDEA-50'))?.status).toBe('待复核');

    // review passed + deliverable ⇒ 待发布 (this is the status complete() gates on).
    await sp.updateReviewState(ref, {
      status: '待发布',
      reviewRound: 1,
      reviewVerdict: '通过',
      workspacePath: '/tmp/ws/50',
    });
    const readyToPublish = await sp.getTaskById('IDEA-50');
    expect(readyToPublish?.status).toBe('待发布');
    expect(readyToPublish?.workspacePath).toBe('/tmp/ws/50');

    // publish result ⇒ PR link / branch persisted, status unchanged (待发布).
    await sp.updatePublishResult(ref, {
      prLink: 'https://github.com/rivus/idea/pull/77',
      publishBranch: 'task/idea-50',
      publishCommit: 'deadbeef',
      publishedAt: '2026-06-03T00:00:00Z',
    });
    const published = await sp.getTaskById('IDEA-50');
    expect(published?.status).toBe('待发布');
    expect(published?.prLink).toBe('https://github.com/rivus/idea/pull/77');
    expect(published?.publishBranch).toBe('task/idea-50');

    // complete ⇒ 已完成; the issue is closed so the backend itself records it.
    await sp.updateReviewState(ref, { status: '已完成', acceptanceVerdict: '通过', acceptanceRound: 1 });
    expect((await sp.getTaskById('IDEA-50'))?.status).toBe('已完成');
    expect(fake.byNumber.get(50)?.state).toBe('closed');

    // cleanup ⇒ transient state wiped, but the task MUST stay 已完成 (Feishu keeps
    // Status across cleanup). It must never reappear as 待处理 / re-claimable.
    await sp.updateCleanupState(ref, { progressSummary: 'cleaned' });
    const afterCleanup = await sp.getTaskById('IDEA-50');
    expect(afterCleanup?.status).toBe('已完成');
    expect(fake.byNumber.get(50)?.state).toBe('closed');
    // The heavy run-time state is gone; only the lifecycle status is preserved.
    expect(store.read(SOURCE, '50')).toEqual({ status: '已完成' });
    // And it is no longer offered as a pending task.
    expect(await sp.listPendingTasks('codex')).toHaveLength(0);
  });

  it('keeps a failed task at 已失败 after a force cleanup (no resurrection to 待处理)', async () => {
    const { sp, fake } = buildStack([issue(51, 'IDEA-51')]);
    const ref: TaskRef = { taskId: 'IDEA-51', recordId: '51', source: SOURCE };

    await sp.claimTask(ref, { claimedBy: 'codex@local', claimedAt: '2026-06-02T00:00:00Z', runId: 'run-2' });
    await sp.updateReviewState(ref, { status: '已失败', lastError: 'boom', workspacePath: '/tmp/ws/51' });
    expect((await sp.getTaskById('IDEA-51'))?.status).toBe('已失败');
    // A failed task cannot be represented by closing the issue (closed ⇒ 已完成),
    // so the issue stays open — the run-time store is what holds 已失败.
    expect(fake.byNumber.get(51)?.state).toBe('open');

    await sp.updateCleanupState(ref, { progressSummary: 'force cleaned' });
    const afterCleanup = await sp.getTaskById('IDEA-51');
    expect(afterCleanup?.status).toBe('已失败');
    expect(afterCleanup?.status).not.toBe('待处理');
    expect(await sp.listPendingTasks('codex')).toHaveLength(0);
  });

  it('routes a rework rejection back to 修复中 and is re-readable', async () => {
    const { sp } = buildStack([issue(52, 'IDEA-52')]);
    const ref: TaskRef = { taskId: 'IDEA-52', recordId: '52', source: SOURCE };

    await sp.claimTask(ref, { claimedBy: 'codex@local', claimedAt: '2026-06-02T00:00:00Z', runId: 'run-3' });
    await sp.updateReviewState(ref, { status: '待复核', reviewRound: 1 });
    // review rejected ⇒ 修复中 with findings, then a re-claim for the next round.
    await sp.updateReviewState(ref, { status: '修复中', reviewRound: 1, reviewVerdict: '驳回', reviewFindings: 'fix the edge case' });
    const reworking = await sp.getTaskById('IDEA-52');
    expect(reworking?.status).toBe('修复中');
    expect(reworking?.reviewFindings).toBe('fix the edge case');
    expect(reworking?.reviewVerdict).toBe('驳回');
  });
});
