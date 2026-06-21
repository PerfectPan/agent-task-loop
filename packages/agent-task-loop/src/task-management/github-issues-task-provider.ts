import type { GitHubIssuesConfig } from '../config/schema';
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
 * Reads and creates tasks backed by GitHub Issues. Proves the multi-source
 * abstraction: it owns the `'github'` source, stamps it on every record, and
 * syncs lifecycle transitions back as issue comments / state changes. Loop
 * book-keeping that has no issue-tracker analogue (runner pids, cleanup) is a
 * no-op — the issue stays the system of record for its own task.
 */
export class GitHubIssuesTaskProvider implements SourceProvider {
  readonly source = GITHUB_SOURCE;

  constructor(private readonly config: GitHubIssuesConfig) {}

  async listTasks(): Promise<TaskRecord[]> {
    const issues = await this.api<GitHubIssue[]>(
      'GET',
      `/repos/${this.config.owner}/${this.config.repo}/issues?state=all&per_page=100`,
    );
    return issues.filter(issue => !issue.pull_request).map(issue => this.mapIssue(issue));
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
    await this.comment(task, `✅ ${payload.resultSummary}${link}`);
    await this.setState(task, 'closed');
  }

  async markTaskFailed(task: TaskRef, payload: MarkTaskFailedPayload): Promise<void> {
    await this.comment(task, `❌ ${payload.lastError}`);
  }

  async updateReviewState(task: TaskRef, payload: UpdateReviewStatePayload): Promise<void> {
    const findings = payload.reviewFindings ? `\n\n${payload.reviewFindings}` : '';
    await this.comment(task, `🔎 ${payload.status}${findings}`);
  }

  async updatePublishResult(task: TaskRef, payload: UpdatePublishResultPayload): Promise<void> {
    if (payload.prLink) {
      await this.comment(task, `🚀 Published: ${payload.prLink}`);
    }
  }

  // No issue-tracker analogue — the loop owns these in its own backend.
  async updateRunnerState(_task: TaskRef, _payload: UpdateRunnerStatePayload): Promise<void> {}
  async updateTaskAssignment(_task: TaskRef, _payload: UpdateTaskAssignmentPayload): Promise<void> {}
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
      prLink: issue.html_url,
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
