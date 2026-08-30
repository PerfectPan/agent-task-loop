import type {
  RoomEvent,
  RoomSlice,
} from '@rivus/agent-room';
import type {
  TaskDeliveryEvent,
  TaskDeliveryView,
} from '@rivus/agent-task-loop/task-delivery';
import type { RoomLabAgentId } from '../domain/agent-roster';

export interface RoomConversationPort {
  readonly displayId: string;
  admitHuman(input: {
    messageId: string;
    body: string;
    addressedTo: RoomLabAgentId[];
  }): Promise<RoomEvent>;
  shouldWake(event: RoomEvent, agentId: RoomLabAgentId): boolean;
  prepareTurn(agentId: RoomLabAgentId): Promise<RoomEvent[]>;
  prepareHeldRetry(
    agentId: RoomLabAgentId,
    heldUpToSeq: number,
  ): Promise<{ events: RoomEvent[]; consumedUpToSeq: number; caughtUp: boolean }>;
  advanceHeldRetry(agentId: RoomLabAgentId, consumedUpToSeq: number): void;
  reply(input: {
    agentId: RoomLabAgentId;
    body: string;
    ackHeldUpToSeq?: number;
  }): Promise<RoomConversationReplyResult>;
  ackHeld(agentId: RoomLabAgentId, heldUpToSeq: number): boolean;
  inspectAgent(agentId: RoomLabAgentId): { seenSeq: number };
  snapshot(): Promise<RoomSlice>;
  project(event: TaskDeliveryEvent): Promise<void>;
  reset(): void;
}

export type RoomConversationReplyResult =
  | { outcome: 'posted'; seq: number; event: RoomEvent }
  | { outcome: 'held'; heldUpToSeq: number };

export interface RoomLabTextPresenterPort {
  error(error: unknown): string;
  text(value: string): string;
}

export interface AgentRunResult {
  text: string;
  latencyMs: number;
}

export type AgentRunner = (
  agentId: RoomLabAgentId,
  prompt: string,
  signal?: AbortSignal,
) => Promise<AgentRunResult>;

export interface TaskDeliveryCoordinatorPort {
  run(
    input: { taskId: string; title: string; maxRounds: number },
    observers: {
      onUpdate(view: TaskDeliveryView): void;
      onSeatStart(seat: 'impl' | 'review'): void;
      onSeatSuccess(
        seat: 'impl' | 'review',
        output: { text: string; latencyMs: number },
      ): void;
      onSeatError(seat: 'impl' | 'review', error: unknown): void;
      project(event: TaskDeliveryEvent): Promise<void>;
    },
  ): Promise<TaskDeliveryView>;
  reset(): void;
}
