import type { TargetAgent, TaskRecord } from '../types/task';
import type {
  ClaimTaskPayload,
  CreateTaskPayload,
  MarkTaskFailedPayload,
  MarkTaskSucceededPayload,
  SourceProvider,
  TaskProvider,
  TaskRef,
  UpdateCleanupStatePayload,
  UpdatePublishResultPayload,
  UpdateReviewStatePayload,
  UpdateRunnerStatePayload,
  UpdateTaskAssignmentPayload,
  UpdateTaskProgressPayload,
} from './task-provider';

export interface CompositeTaskProviderOptions {
  /**
   * Source used when a create/write has no explicit target (e.g. a CLI create
   * with no `--source`). Defaults to the first provider. Must match one of the
   * provider source ids.
   */
  defaultSource?: string;
}

/**
 * Aggregates several leaf {@link SourceProvider}s into one {@link TaskProvider}.
 *
 * Reads fan out to every source and merge (each record already carries its
 * `source`). Writes route back to the single backend that owns the task —
 * keyed by `TaskRef.source` (or `CreateTaskPayload.source` for creates),
 * falling back to {@link CompositeTaskProviderOptions.defaultSource}.
 *
 * There is no global task store and no cross-source sync: each task's system of
 * record stays its own backend. The TUI is an integration layer over them.
 */
export class CompositeTaskProvider implements TaskProvider {
  private readonly providers: readonly SourceProvider[];
  private readonly bySource: Map<string, SourceProvider>;
  private readonly defaultSource: string;

  constructor(providers: SourceProvider[], options: CompositeTaskProviderOptions = {}) {
    if (providers.length === 0) {
      throw new Error('CompositeTaskProvider requires at least one source provider');
    }
    this.bySource = new Map();
    for (const provider of providers) {
      if (this.bySource.has(provider.source)) {
        throw new Error(`Duplicate task source "${provider.source}"`);
      }
      this.bySource.set(provider.source, provider);
    }
    this.providers = providers;
    this.defaultSource = options.defaultSource ?? providers[0]!.source;
    if (!this.bySource.has(this.defaultSource)) {
      throw new Error(`Unknown default source "${this.defaultSource}"`);
    }
  }

  /** Source ids backing this provider, in registration order. */
  get sources(): string[] {
    return this.providers.map(provider => provider.source);
  }

  private route(source: string | undefined): SourceProvider {
    const id = source ?? this.defaultSource;
    const provider = this.bySource.get(id);
    if (!provider) {
      throw new Error(`No task source registered for "${id}"`);
    }
    return provider;
  }

  private warnSourceFailure(source: string, reason: unknown): void {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.warn(`[agent-task-loop] task source "${source}" failed to read; skipping it: ${message}`);
  }

  /**
   * Reads from every source and merges. A source that fails is **skipped with a
   * warning** rather than failing the whole read — one unreachable or
   * misconfigured backend (e.g. an expired Feishu scope) must not blank out the
   * others.
   */
  private async mergeReads(read: (provider: SourceProvider) => Promise<TaskRecord[]>): Promise<TaskRecord[]> {
    const settled = await Promise.allSettled(this.providers.map(read));
    const tasks: TaskRecord[] = [];
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        tasks.push(...result.value);
      } else {
        this.warnSourceFailure(this.providers[index]!.source, result.reason);
      }
    });
    return tasks;
  }

  async listTasks(): Promise<TaskRecord[]> {
    return this.mergeReads(provider => provider.listTasks());
  }

  async listPendingTasks(agent: TargetAgent): Promise<TaskRecord[]> {
    return this.mergeReads(provider => provider.listPendingTasks(agent));
  }

  async getTaskById(taskId: string): Promise<TaskRecord | undefined> {
    for (const provider of this.providers) {
      try {
        const task = await provider.getTaskById(taskId);
        if (task) {
          return task;
        }
      } catch (reason) {
        // Skip a failing source so it can't hide a task owned by a healthy one.
        this.warnSourceFailure(provider.source, reason);
      }
    }
    return undefined;
  }

  async createTask(payload: CreateTaskPayload): Promise<void> {
    await this.route(payload.source).createTask(payload);
  }

  async claimTask(task: TaskRef, payload: ClaimTaskPayload): Promise<void> {
    await this.route(task.source).claimTask(task, payload);
  }

  async updateTaskProgress(task: TaskRef, payload: UpdateTaskProgressPayload): Promise<void> {
    await this.route(task.source).updateTaskProgress(task, payload);
  }

  async updateRunnerState(task: TaskRef, payload: UpdateRunnerStatePayload): Promise<void> {
    await this.route(task.source).updateRunnerState(task, payload);
  }

  async updateTaskAssignment(task: TaskRef, payload: UpdateTaskAssignmentPayload): Promise<void> {
    await this.route(task.source).updateTaskAssignment(task, payload);
  }

  async markTaskSucceeded(task: TaskRef, payload: MarkTaskSucceededPayload): Promise<void> {
    await this.route(task.source).markTaskSucceeded(task, payload);
  }

  async markTaskFailed(task: TaskRef, payload: MarkTaskFailedPayload): Promise<void> {
    await this.route(task.source).markTaskFailed(task, payload);
  }

  async updateReviewState(task: TaskRef, payload: UpdateReviewStatePayload): Promise<void> {
    await this.route(task.source).updateReviewState(task, payload);
  }

  async updatePublishResult(task: TaskRef, payload: UpdatePublishResultPayload): Promise<void> {
    await this.route(task.source).updatePublishResult(task, payload);
  }

  async updateCleanupState(task: TaskRef, payload: UpdateCleanupStatePayload): Promise<void> {
    await this.route(task.source).updateCleanupState(task, payload);
  }
}
