import type { ProcessRunner } from '@rivus/agent-orchestration';
import type { TaskDeliveryRuntime } from '@rivus/agent-task-loop/task-delivery';
import {
  MemoryOrchestratedTaskRuntime,
  MemoryTaskDeliveryRepository,
  TaskDeliveryApplication,
} from '@rivus/agent-task-loop/task-delivery';
import type { TaskDeliveryCoordinatorPort } from '../application/ports';
import {
  agentSeatBinding,
  localAgentProcessRunner,
} from './local-agent-runner.server';

export class LocalTaskDelivery implements TaskDeliveryCoordinatorPort {
  private repository = new MemoryTaskDeliveryRepository();
  private readonly runtime: MemoryOrchestratedTaskRuntime;

  constructor(runner: ProcessRunner = localAgentProcessRunner) {
    this.runtime = new MemoryOrchestratedTaskRuntime({
      runner,
      bindings: {
        impl: agentSeatBinding('codex'),
        review: agentSeatBinding('claude'),
      },
    });
  }

  run(
    input: { taskId: string; title: string; maxRounds: number },
    observers: Parameters<TaskDeliveryCoordinatorPort['run']>[1],
  ) {
    const runtime = new ObservableTaskRuntime(this.runtime, observers);
    const application = new TaskDeliveryApplication({
      repository: this.repository,
      runtime,
      eventSink: { publish: observers.project },
      onUpdate: observers.onUpdate,
    });
    return application.start(input);
  }

  reset(): void {
    this.runtime.reset();
    this.repository = new MemoryTaskDeliveryRepository();
  }
}

class ObservableTaskRuntime implements TaskDeliveryRuntime {
  constructor(
    private readonly runtime: TaskDeliveryRuntime,
    private readonly observers: Parameters<TaskDeliveryCoordinatorPort['run']>[1],
  ) {}

  open(input: { taskId: string; title: string }) {
    return this.runtime.open(input);
  }

  fence<T>(taskId: string, operation: () => Promise<T>, signal?: AbortSignal) {
    return this.runtime.fence(taskId, operation, signal);
  }

  async run(input: { taskId: string; seat: 'impl' | 'review'; prompt: string }) {
    this.observers.onSeatStart(input.seat);
    try {
      const output = await this.runtime.run(input);
      this.observers.onSeatSuccess(input.seat, output);
      return output;
    } catch (error) {
      this.observers.onSeatError(input.seat, error);
      throw error;
    }
  }

  allow(taskId: string, seat: 'impl' | 'review') {
    this.runtime.allow(taskId, seat);
  }

  appendFact(taskId: string, seat: 'impl' | 'review', text: string) {
    this.runtime.appendFact(taskId, seat, text);
  }

  sendMail(
    taskId: string,
    input: { from: 'impl' | 'review'; to: 'impl' | 'review'; body: string },
  ) {
    this.runtime.sendMail(taskId, input);
  }

  inspect(taskId: string) {
    return this.runtime.inspect(taskId);
  }

  release(taskId: string) {
    return this.runtime.release(taskId);
  }
}
