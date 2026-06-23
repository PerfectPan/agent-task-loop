import { TARGET_AGENTS, type TargetAgent, type TaskRecord, type TaskStatus } from '../types/task';
import type {
  ClaimTaskPayload,
  CreateTaskPayload,
  MarkTaskFailedPayload,
  MarkTaskSucceededPayload,
  SourceProvider,
  TaskRef,
  UpdateCleanupStatePayload,
  UpdatePublishResultPayload,
  UpdateReviewStatePayload,
  UpdateRunnerStatePayload,
  UpdateTaskAssignmentPayload,
  UpdateTaskProgressPayload,
} from './task-provider';

export const GITHUB_SOURCE = 'github';

/** Source id for a GitHub-Issues-backed repo, e.g. `github:owner/repo`. */
export function githubSource(owner: string, repo: string): string {
  return `${GITHUB_SOURCE}:${owner}/${repo}`;
}

/** A single repository this provider reads/writes. */
export interface GitHubRepoTarget {
  owner: string;
  repo: string;
  token?: string;
  defaultAgent: TargetAgent;
}

const TASK_ID_MARKER = /<!--\s*task-id:\s*(\S+)\s*-->/;
const AGENT_LABEL = /^agent:(claude|codex|coco|glm)$/;
const PRIORITY_LABEL = /^P([0-9])$/;

interface GitHubLabel {
  name: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<GitHubLabel | string>;
  html_url: string;
  created_at: string;
  updated_at: string;
  /** Present only on pull requests, which the issues endpoint also returns. */
  pull_request?: unknown;
}

function labelNames(labels: GitHubIssue['labels']): string[] {
  return labels.map(label => (typeof label === 'string' ? label : label.name));
}

/**
 * Reads and creates tasks backed by GitHub Issues for one repository. Owns the
 * `github:<owner>/<repo>` source, stamps it on every record, and syncs
 * lifecycle transitions back as issue comments / state changes. Loop
 * book-keeping that has no issue-tracker analogue (runner pids, cleanup) is a
 * no-op — the issue stays the system of record for its own task.
 */
export class GitHubIssuesTaskProvider implements SourceProvider {
  readonly source: string;

  constructor(private readonly config: GitHubRepoTarget) {
    this.source = githubSource(config.owner, config.repo);
  }

  /**
   * An issue is a managed task only when it opts in: it carries our task-id
   * marker (issues we created) or an `agent:<name>` label (issues a human hands
   * off). Unmarked, unlabeled issues are ignored so the loop never adopts every
   * issue in the repo.
   */
  private isManaged(issue: GitHubIssue): boolean {
    if (TASK_ID_MARKER.test(issue.body ?? '')) {
      return true;
    }
    return labelNames(issue.labels).some(name => AGENT_LABEL.test(name));
  }

  async listTasks(): Promise<TaskRecord[]> {
    const issues = await this.listAllIssues();
    return issues
      .filter(issue => !issue.pull_request)
      .filter(issue => this.isManaged(issue))
      .map(issue => this.mapIssue(issue));
  }

  /**
   * Pages through `issues?state=all` (100 per page) so a repo with more than one
   * page of issues still surfaces every task — parity with Feishu's full list.
   * Capped at 10 pages (1000 issues) as a runaway guard.
   */
  private async listAllIssues(): Promise<GitHubIssue[]> {
    const all: GitHubIssue[] = [];
    const PER_PAGE = 100;
    const MAX_PAGES = 10;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const batch = await this.api<GitHubIssue[]>(
        'GET',
        `/repos/${this.config.owner}/${this.config.repo}/issues?state=all&per_page=${PER_PAGE}&page=${page}`,
      );
      all.push(...batch);
      if (batch.length < PER_PAGE) {
        return all;
      }
    }
    // Hit the page cap with a still-full last page — there are more issues than
    // we read. Warn instead of silently truncating the task list.
    console.warn(
      `[agent-task-loop] ${this.config.owner}/${this.config.repo} has more than ${PER_PAGE * MAX_PAGES} issues; ` +
        `only the first ${PER_PAGE * MAX_PAGES} were read — some tasks may be missing.`,
    );
    return all;
  }

  async listPendingTasks(agent: TargetAgent): Promise<TaskRecord[]> {
    return (await this.listTasks()).filter(task => task.targetAgent === agent && task.status === '待处理');
  }

  async getTaskById(taskId: string): Promise<TaskRecord | undefined> {
    return (await this.listTasks()).find(task => task.taskId === taskId);
  }

  async createTask(payload: CreateTaskPayload): Promise<void> {
    const body = `${payload.description ?? ''}\n\n<!-- task-id: ${payload.taskId} -->`.trim();
    await this.api('POST', `/repos/${this.config.owner}/${this.config.repo}/issues`, {
      title: payload.title,
      body,
      labels: [`agent:${payload.targetAgent}`, `P${payload.priority}`],
    });
  }

  async claimTask(task: TaskRef, payload: ClaimTaskPayload): Promise<void> {
    await this.comment(task, `🤖 Claimed by \`${payload.claimedBy}\` (run \`${payload.runId}\`).`);
  }

  async updateTaskProgress(task: TaskRef, payload: UpdateTaskProgressPayload): Promise<void> {
    if (payload.progressSummary) {
      await this.comment(task, `⏳ ${payload.progressSummary}`);
    }
  }

  async markTaskSucceeded(task: TaskRef, payload: MarkTaskSucceededPayload): Promise<void> {
    const link = payload.prLink ? `\n\nPR: ${payload.prLink}` : '';
    // Execution succeeded ⇒ awaiting acceptance (待验收), NOT done — keep the
    // issue open. It only closes on the terminal 已完成 transition below.
    await this.comment(task, `✅ ${payload.resultSummary}${link}`);
  }

  async markTaskFailed(task: TaskRef, payload: MarkTaskFailedPayload): Promise<void> {
    await this.comment(task, `❌ ${payload.lastError}`);
  }

  async updateReviewState(task: TaskRef, payload: UpdateReviewStatePayload): Promise<void> {
    const findings = payload.reviewFindings ? `\n\n${payload.reviewFindings}` : '';
    await this.comment(task, `🔎 ${payload.status}${findings}`);
    // Terminal completion closes the issue so the binary backend itself records
    // 已完成. The run-time store may later be cleared (cleanup), yet a closed
    // issue still maps back to 已完成 instead of resurrecting as 待处理.
    if (payload.status === '已完成') {
      await this.setState(task, 'closed');
    }
  }

  async updatePublishResult(task: TaskRef, payload: UpdatePublishResultPayload): Promise<void> {
    if (payload.prLink) {
      await this.comment(task, `🚀 Published: ${payload.prLink}`);
    }
  }

  async updateTaskAssignment(task: TaskRef, payload: UpdateTaskAssignmentPayload): Promise<void> {
    // The agent lives in the issue's `agent:<name>` label (mapIssue derives
    // targetAgent from it), so a reassignment must rewrite that label — otherwise
    // a re-read re-derives the old agent and listPendingTasks keeps offering the
    // task to the wrong agent.
    const number = this.issueNumber(task);
    const issue = await this.api<GitHubIssue>('GET', `/repos/${this.config.owner}/${this.config.repo}/issues/${number}`);
    const kept = labelNames(issue.labels).filter(name => !AGENT_LABEL.test(name));
    await this.api('PATCH', `/repos/${this.config.owner}/${this.config.repo}/issues/${number}`, {
      labels: [...kept, `agent:${payload.targetAgent}`],
    });
  }

  // No issue-tracker analogue — the loop owns these in its own backend.
  async updateRunnerState(_task: TaskRef, _payload: UpdateRunnerStatePayload): Promise<void> {}
  async updateCleanupState(_task: TaskRef, _payload: UpdateCleanupStatePayload): Promise<void> {}

  private async comment(task: TaskRef, body: string): Promise<void> {
    const number = this.issueNumber(task);
    await this.api('POST', `/repos/${this.config.owner}/${this.config.repo}/issues/${number}/comments`, { body });
  }

  private async setState(task: TaskRef, state: 'open' | 'closed'): Promise<void> {
    const number = this.issueNumber(task);
    await this.api('PATCH', `/repos/${this.config.owner}/${this.config.repo}/issues/${number}`, { state });
  }

  private issueNumber(task: TaskRef): number {
    const number = Number(task.recordId);
    if (!Number.isInteger(number) || number <= 0) {
      throw new Error(`GitHub task ${task.taskId} is missing its issue number (recordId)`);
    }
    return number;
  }

  private mapIssue(issue: GitHubIssue): TaskRecord {
    const names = labelNames(issue.labels);
    const agent = names.map(name => AGENT_LABEL.exec(name)?.[1]).find(Boolean) as TargetAgent | undefined;
    const priorityLabel = names.map(name => PRIORITY_LABEL.exec(name)?.[1]).find(Boolean);
    const body = issue.body ?? '';
    const taskId = TASK_ID_MARKER.exec(body)?.[1] ?? `GH-${issue.number}`;
    const status: TaskStatus = issue.state === 'closed' ? '已完成' : '待处理';

    return {
      source: this.source,
      recordId: String(issue.number),
      taskId,
      title: issue.title,
      description: body.replace(TASK_ID_MARKER, '').trim(),
      project: this.config.repo,
      repository: `${this.config.owner}/${this.config.repo}`,
      targetAgent: agent && TARGET_AGENTS.includes(agent) ? agent : this.config.defaultAgent,
      priority: priorityLabel ? Number(priorityLabel) : 3,
      status,
      // NB: do NOT use the issue URL as prLink. prLink means "the pull request",
      // and a non-empty prLink makes DeliveryCheckService treat the task as
      // already published. The real PR link is written to the run-time store by
      // complete/markTaskSucceeded and overlaid back on reads.
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    };
  }

  private tokenPromise?: Promise<string | undefined>;

  /**
   * Resolves the GitHub token from, in order: config, `GITHUB_TOKEN`, then the
   * `gh` CLI (`gh auth token`). The lookup is memoized as a single Promise so
   * concurrent `api()` calls share one `gh` invocation, and degrades to no
   * token (unauthenticated request) when `gh` is missing or errors.
   */
  private resolveToken(): Promise<string | undefined> {
    if (!this.tokenPromise) {
      this.tokenPromise = (async () => {
        let token = this.config.token ?? process.env.GITHUB_TOKEN;
        if (!token) {
          try {
            const { execa } = await import('execa');
            const result = await execa('gh', ['auth', 'token'], { reject: false });
            const candidate = result.stdout?.trim();
            if (candidate) {
              token = candidate;
            }
          } catch {
            // `gh` missing or errored — fall through to an unauthenticated request.
          }
        }
        return token;
      })();
    }
    return this.tokenPromise;
  }

  private async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.resolveToken();
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`GitHub API ${method} ${path} failed: ${response.status} ${detail}`.trim());
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
}
