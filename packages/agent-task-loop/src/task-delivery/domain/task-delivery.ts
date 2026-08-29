import { TaskDeliveryTransitionError, TaskDeliveryValidationError } from './errors';
import type {
  TaskDeliverySnapshot,
  TaskReviewVerdict,
} from './model';

const MAX_TEXT_LENGTH = 2_000;

/** Aggregate root for one implementation/review delivery lifecycle. */
export class TaskDelivery {
  private constructor(private state: TaskDeliverySnapshot) {}

  static start(input: {
    taskId: string;
    title: string;
    maxRounds: number;
  }): TaskDelivery {
    const taskId = input.taskId.trim();
    const title = input.title.trim();
    if (!taskId) throw new TaskDeliveryValidationError('task id is required');
    if (!title) throw new TaskDeliveryValidationError('task title is required');
    if (title.length > MAX_TEXT_LENGTH) {
      throw new TaskDeliveryValidationError(`task title must be at most ${MAX_TEXT_LENGTH} characters`);
    }
    if (!Number.isSafeInteger(input.maxRounds) || input.maxRounds < 1 || input.maxRounds > 10) {
      throw new TaskDeliveryValidationError('max rounds must be an integer from 1 to 10');
    }
    return new TaskDelivery({
      taskId,
      title,
      status: 'executing',
      round: 1,
      maxRounds: input.maxRounds,
    });
  }

  recordImplementation(body: string): void {
    if (this.state.status !== 'executing' && this.state.status !== 'reworking') {
      throw new TaskDeliveryTransitionError(
        `cannot record implementation while task is ${this.state.status}`,
      );
    }
    const implementation = requireOutput(body, 'implementation');
    this.state = {
      ...this.state,
      status: 'reviewing',
      implementation,
      verdict: undefined,
      findings: undefined,
    };
  }

  recordReview(verdict: TaskReviewVerdict, findings: string): void {
    if (this.state.status !== 'reviewing') {
      throw new TaskDeliveryTransitionError(`cannot record review while task is ${this.state.status}`);
    }
    const reviewFindings = requireOutput(findings, 'review findings');
    this.state = {
      ...this.state,
      status: verdict === 'PASS' ? 'passed' : 'changes-requested',
      verdict,
      findings: reviewFindings,
    };
  }

  beginRework(): void {
    if (this.state.status !== 'changes-requested') {
      throw new TaskDeliveryTransitionError(`cannot begin rework while task is ${this.state.status}`);
    }
    if (this.state.round >= this.state.maxRounds) {
      throw new TaskDeliveryTransitionError('cannot rework after the final review round');
    }
    this.state = {
      ...this.state,
      status: 'reworking',
      round: this.state.round + 1,
      implementation: undefined,
      verdict: undefined,
    };
  }

  fail(reason: string): void {
    if (this.state.status === 'passed') {
      throw new TaskDeliveryTransitionError('a passed task cannot fail');
    }
    this.state = {
      ...this.state,
      status: 'failed',
      findings: requireOutput(reason, 'failure reason'),
    };
  }

  canRework(): boolean {
    return this.state.status === 'changes-requested' && this.state.round < this.state.maxRounds;
  }

  snapshot(): TaskDeliverySnapshot {
    return cloneSnapshot(this.state);
  }
}

function requireOutput(value: string, label: string): string {
  const output = value.trim();
  if (!output) throw new TaskDeliveryValidationError(`${label} is required`);
  return output;
}

function cloneSnapshot(snapshot: TaskDeliverySnapshot): TaskDeliverySnapshot {
  return { ...snapshot };
}
