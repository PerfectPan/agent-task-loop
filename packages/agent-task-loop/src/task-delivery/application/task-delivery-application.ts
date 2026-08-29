import { TaskDelivery } from '../domain/task-delivery';
import { parseTaskReviewVerdict } from '../domain/review-verdict';
import type { TaskDeliverySnapshot } from '../domain/model';
import type {
  TaskDeliveryEvent,
  TaskDeliveryEventSink,
  TaskDeliveryRepository,
  TaskDeliveryRuntime,
  TaskDeliveryRuntimeView,
} from './task-delivery-ports';

export interface TaskDeliveryView extends TaskDeliverySnapshot, TaskDeliveryRuntimeView {}

export interface TaskDeliveryApplicationOptions {
  repository: TaskDeliveryRepository;
  runtime: TaskDeliveryRuntime;
  eventSink?: TaskDeliveryEventSink;
  onUpdate?: (view: TaskDeliveryView) => void;
}

/** Coordinates the Task Delivery aggregate, occupied seats, and external projections. */
export class TaskDeliveryApplication {
  constructor(private readonly options: TaskDeliveryApplicationOptions) {}

  inspect(taskId: string): TaskDeliveryView | undefined {
    const task = this.options.repository.get(taskId);
    return task ? { ...task, ...this.runtimeView(taskId) } : undefined;
  }

  async start(input: {
    taskId: string;
    title: string;
    maxRounds?: number;
  }): Promise<TaskDeliveryView> {
    const task = TaskDelivery.start({
      taskId: input.taskId,
      title: input.title,
      maxRounds: input.maxRounds ?? 2,
    });
    const canonicalTask = task.snapshot();
    const taskId = canonicalTask.taskId;
    let opened = false;
    let created = false;

    try {
      await this.options.runtime.open({ taskId, title: canonicalTask.title });
      opened = true;
      created = await this.options.runtime.fence(taskId, async () =>
        this.options.repository.create(task.snapshot()),
      );
      if (!created) throw new Error(`Task ${taskId} already exists`);
      this.notify(task);
      await this.publish({ type: 'accepted', task: task.snapshot() });

      while (true) {
        const current = task.snapshot();
        const implementation = await this.options.runtime.run({
          taskId: current.taskId,
          seat: 'impl',
          prompt: buildImplementationPrompt(current),
        });
        task.recordImplementation(implementation.text);
        this.options.runtime.appendFact(
          current.taskId,
          'impl',
          `round ${current.round} implementation completed`,
        );
        this.options.runtime.allow(current.taskId, 'review');
        await this.save(task);
        await this.publish({
          type: 'seat-output',
          task: task.snapshot(),
          seat: 'impl',
          body: implementation.text,
          latencyMs: implementation.latencyMs,
        });

        const reviewing = task.snapshot();
        const review = await this.options.runtime.run({
          taskId: reviewing.taskId,
          seat: 'review',
          prompt: buildReviewPrompt(reviewing),
        });
        const verdict = parseTaskReviewVerdict(review.text);
        this.options.runtime.appendFact(
          reviewing.taskId,
          'review',
          `round ${reviewing.round} verdict ${verdict}`,
        );
        task.recordReview(verdict, review.text);
        await this.save(task);
        await this.publish({
          type: 'seat-output',
          task: task.snapshot(),
          seat: 'review',
          body: review.text,
          latencyMs: review.latencyMs,
        });
        await this.publish({
          type: 'reviewed',
          task: task.snapshot(),
          verdict,
          body: review.text,
        });

        if (verdict === 'PASS') {
          await this.publish({ type: 'completed', task: task.snapshot() });
          break;
        }
        if (!task.canRework()) {
          await this.publish({ type: 'completed', task: task.snapshot() });
          break;
        }

        this.options.runtime.sendMail(reviewing.taskId, {
          from: 'review',
          to: 'impl',
          body: review.text,
        });
        this.options.runtime.allow(reviewing.taskId, 'impl');
        task.beginRework();
        await this.save(task);
      }
    } catch (error) {
      if (!created) throw error;
      const reason = errorMessage(error);
      task.fail(reason);
      await this.save(task);
      await this.publish({ type: 'failed', task: task.snapshot(), reason });
    } finally {
      try {
        if (opened) await this.options.runtime.release(taskId);
      } catch (error) {
        if (created) {
          await this.publish({
            type: 'cleanup-failed',
            task: task.snapshot(),
            reason: errorMessage(error),
          });
        }
      } finally {
        if (created) this.notify(task);
      }
    }

    return this.inspect(taskId)!;
  }

  private async save(task: TaskDelivery): Promise<void> {
    await this.options.runtime.fence(task.snapshot().taskId, async () => {
      this.options.repository.save(task.snapshot());
    });
    this.notify(task);
  }

  private notify(task: TaskDelivery): void {
    this.options.onUpdate?.({ ...task.snapshot(), ...this.runtimeView(task.snapshot().taskId) });
  }

  private runtimeView(taskId: string): TaskDeliveryRuntimeView {
    try {
      return this.options.runtime.inspect(taskId);
    } catch {
      return { occupied: false, allowedSeat: 'impl' };
    }
  }

  private async publish(event: TaskDeliveryEvent): Promise<void> {
    try {
      await this.options.eventSink?.publish(event);
    } catch {
      // A Room/read-model projection is never allowed to decide Task success.
    }
  }
}

function buildImplementationPrompt(task: TaskDeliverySnapshot): string {
  const rework = task.status === 'reworking' && task.findings
    ? `Address this independent review:\n${task.findings}`
    : 'State assumptions and provide a verifiable result.';
  return `You occupy the impl seat for ${task.taskId}. Produce a concise Chinese deliverable for this task: ${task.title}. Round ${task.round}. ${rework} Do not use tools. Return only the deliverable.`;
}

function buildReviewPrompt(task: TaskDeliverySnapshot): string {
  return `You occupy the independent review seat for ${task.taskId}. Review round ${task.round} against this task: ${task.title}.\n\nImplementation:\n${task.implementation ?? ''}\n\nThe first line must be exactly VERDICT: PASS or VERDICT: CHANGES_REQUESTED. Then give concise Chinese findings. PASS only if the result directly satisfies the task and is internally consistent. Do not use tools.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Task delivery failed';
}
