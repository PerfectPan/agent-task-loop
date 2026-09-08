import {
  shouldWake,
  type AgentSessionId,
  type RoomEvent,
  type RoomId,
} from '@rivus/agent-room';
import type { TaskDeliveryEvent } from '@rivus/agent-task-loop/task-delivery';
import type { RoomConversationPort, RoomHumanAdmitResult } from '../application/ports';
import {
  ROOM_AGENT_ROSTER,
  type RoomLabAgentId,
} from '../domain/agent-roster';
import type { FileRoomStreamStore } from './file-room-stream-store.server';
import type { SqliteRoomStreamStore } from './sqlite-room-unit-of-work.server';
import { MemoryRoomStreamStore } from '@rivus/agent-room';

const TURN_BUDGET = { maxEvents: 50, maxChars: 48_000 } as const;
const RETRY_EVENT_BUDGET = { maxEvents: 50, maxChars: 30_000 } as const;

export type RoomSessionStore = MemoryRoomStreamStore | FileRoomStreamStore | SqliteRoomStreamStore;

export class StoredRoomConversation implements RoomConversationPort {
  readonly conversationId: string;
  readonly displayId: string;
  protected store: RoomSessionStore;

  constructor(
    protected readonly roomId: RoomId,
    store: RoomSessionStore,
  ) {
    this.conversationId = roomId.conversationId;
    this.displayId = `${roomId.tenantId}/${roomId.conversationId}`;
    this.store = store;
    this.ensureSessions();
  }

  async admitHuman(input: {
    messageId: string;
    body: string;
    addressedTo: RoomLabAgentId[];
  }): Promise<RoomHumanAdmitResult> {
    const admitted = await this.store.admit({
      roomId: this.roomId,
      messageId: input.messageId,
      author: { kind: 'human', id: 'director' },
      kind: 'human',
      body: input.body,
      addressedTo: input.addressedTo,
    });
    return {
      event: admitted.event,
      duplicate: admitted.outcome === 'duplicate',
    };
  }

  shouldWake(event: RoomEvent, agentId: RoomLabAgentId): boolean {
    return shouldWake({
      event,
      agentId,
      policy: event.addressedTo.length > 0 ? 'mention-only' : 'all-human-messages',
    });
  }

  async prepareTurn(agentId: RoomLabAgentId): Promise<RoomEvent[]> {
    const session = this.sessionId(agentId);
    const seenSeq = this.store.inspectSession(session)?.seenSeq ?? 0;
    const slice = await this.store.readSlice(this.roomId, seenSeq, TURN_BUDGET);
    const consumedSeq = slice.events.at(-1)?.seq;
    if (consumedSeq !== undefined) {
      this.store.advanceSeen(session, consumedSeq);
      return slice.events;
    }
    if (slice.head > seenSeq) {
      throw new Error('The next Room event exceeds the agent context budget');
    }
    return [];
  }

  async prepareHeldRetry(
    agentId: RoomLabAgentId,
    heldUpToSeq: number,
  ): Promise<{ events: RoomEvent[]; consumedUpToSeq: number; caughtUp: boolean }> {
    const session = this.sessionId(agentId);
    const seenSeq = this.store.inspectSession(session)?.seenSeq ?? 0;
    const slice = await this.store.readSlice(this.roomId, seenSeq, RETRY_EVENT_BUDGET);
    const events = slice.events.filter(event => event.seq <= heldUpToSeq);
    const consumedSeq = events.at(-1)?.seq;
    if (consumedSeq !== undefined) {
      return {
        events,
        consumedUpToSeq: consumedSeq,
        caughtUp: consumedSeq >= heldUpToSeq,
      };
    }
    if (seenSeq < heldUpToSeq) {
      throw new Error('The next held Room event exceeds the agent context budget');
    }
    return { events: [], consumedUpToSeq: seenSeq, caughtUp: true };
  }

  advanceHeldRetry(agentId: RoomLabAgentId, consumedUpToSeq: number): void {
    this.store.advanceSeen(this.sessionId(agentId), consumedUpToSeq);
  }

  reply(input: {
    agentId: RoomLabAgentId;
    body: string;
    ackHeldUpToSeq?: number;
  }) {
    return this.store.replyInSerial({
      session: this.sessionId(input.agentId),
      body: input.body,
      ...(input.ackHeldUpToSeq === undefined
        ? {}
        : { ackHeldUpToSeq: input.ackHeldUpToSeq }),
    }).then(result => result.outcome === 'posted'
      ? result
      : { outcome: 'held' as const, heldUpToSeq: result.heldUpToSeq });
  }

  completeSilently(agentId: RoomLabAgentId, ackHeldUpToSeq: number) {
    return this.store.completeSilentlyInSerial({
      session: this.sessionId(agentId),
      ackHeldUpToSeq,
    }).then(result => result.outcome === 'silent'
      ? result
      : { outcome: 'held' as const, heldUpToSeq: result.heldUpToSeq });
  }

  ackHeld(agentId: RoomLabAgentId, heldUpToSeq: number): boolean {
    const current = this.store.inspectSession(this.sessionId(agentId));
    if (current && current.seenSeq >= heldUpToSeq) return true;
    return this.store.ackHold(this.sessionId(agentId), heldUpToSeq);
  }

  inspectAgent(agentId: RoomLabAgentId): { seenSeq: number } {
    return { seenSeq: this.store.inspectSession(this.sessionId(agentId))?.seenSeq ?? 0 };
  }

  snapshot() {
    return this.store.readSlice(this.roomId, 0, {
      maxEvents: 200,
      maxChars: 200_000,
    });
  }

  async project(event: TaskDeliveryEvent): Promise<void> {
    const projection = toRoomProjection(event);
    if (!projection) return;
    await this.store.admit({
      roomId: this.roomId,
      messageId: projection.messageId,
      author: projection.author,
      kind: projection.kind,
      body: projection.body,
      origin: 'control-plane',
    });
  }

  reset(): void {
    throw new Error('A persisted Room cannot be reset by replacing the store');
  }

  protected sessionId(agentId: RoomLabAgentId): AgentSessionId {
    return {
      tenantId: this.roomId.tenantId,
      agentId,
      roomId: this.roomId,
      runtimeGenerationId: 'web-v1',
    };
  }

  protected ensureSessions(): void {
    for (const agent of ROOM_AGENT_ROSTER) {
      this.store.ensureSession(this.sessionId(agent.id));
    }
  }
}

function toRoomProjection(event: TaskDeliveryEvent): {
  messageId: string;
  author: { kind: 'agent' | 'control-plane'; id: string };
  kind: 'posted' | 'control-plane';
  body: string;
} | undefined {
  const task = event.task;
  switch (event.type) {
    case 'accepted':
      return {
        messageId: `task:${task.taskId}:accepted`,
        author: { kind: 'control-plane', id: 'task-control' },
        kind: 'control-plane',
        body: `Task ${task.taskId} accepted: ${task.title}`,
      };
    case 'seat-output':
      return {
        messageId: `task:${task.taskId}:round:${task.round}:${event.seat}`,
        author: { kind: 'agent', id: event.seat === 'impl' ? 'codex' : 'claude' },
        kind: 'posted',
        body: event.body,
      };
    case 'completed':
      return {
        messageId: `task:${task.taskId}:completed`,
        author: { kind: 'control-plane', id: 'task-control' },
        kind: 'control-plane',
        body: task.status === 'passed'
          ? `Task ${task.taskId} passed independent review in round ${task.round}.`
          : `Task ${task.taskId} stopped after ${task.round} review rounds with changes requested.`,
      };
    case 'failed':
      return {
        messageId: `task:${task.taskId}:failed`,
        author: { kind: 'control-plane', id: 'task-control' },
        kind: 'control-plane',
        body: `Task ${task.taskId} failed: ${event.reason}`,
      };
    case 'cleanup-failed':
      return {
        messageId: `task:${task.taskId}:cleanup-failed`,
        author: { kind: 'control-plane', id: 'task-control' },
        kind: 'control-plane',
        body: `Task ${task.taskId} completed, but local cleanup failed: ${event.reason}`,
      };
    case 'reviewed':
      return undefined;
  }
}
