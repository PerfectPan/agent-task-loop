import type {
  TaskDeliverySeat,
  TaskDeliverySnapshot,
  TaskReviewVerdict,
} from '../domain/model';

export interface TaskDeliveryRepository {
  get(taskId: string): TaskDeliverySnapshot | undefined;
  create(snapshot: TaskDeliverySnapshot): boolean;
  save(snapshot: TaskDeliverySnapshot): void;
}

export interface TaskDeliveryRuntimeView {
  occupied: boolean;
  allowedSeat: TaskDeliverySeat;
}

export interface TaskDeliveryRuntime {
  open(input: { taskId: string; title: string }): Promise<void>;
  fence<T>(
    taskId: string,
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
  run(input: {
    taskId: string;
    seat: TaskDeliverySeat;
    prompt: string;
  }): Promise<{ text: string; latencyMs: number }>;
  allow(taskId: string, seat: TaskDeliverySeat): void;
  appendFact(taskId: string, seat: TaskDeliverySeat, text: string): void;
  sendMail(taskId: string, input: { from: TaskDeliverySeat; to: TaskDeliverySeat; body: string }): void;
  inspect(taskId: string): TaskDeliveryRuntimeView;
  release(taskId: string): Promise<void>;
}

export type TaskDeliveryEvent =
  | { type: 'accepted'; task: TaskDeliverySnapshot }
  | {
      type: 'seat-output';
      task: TaskDeliverySnapshot;
      seat: TaskDeliverySeat;
      body: string;
      latencyMs: number;
    }
  | {
      type: 'reviewed';
      task: TaskDeliverySnapshot;
      verdict: TaskReviewVerdict;
      body: string;
    }
  | { type: 'completed'; task: TaskDeliverySnapshot }
  | { type: 'failed'; task: TaskDeliverySnapshot; reason: string }
  | { type: 'cleanup-failed'; task: TaskDeliverySnapshot; reason: string };

export interface TaskDeliveryEventSink {
  publish(event: TaskDeliveryEvent): Promise<void>;
}
