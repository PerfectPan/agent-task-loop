import { RoomValidationError } from '../contracts/errors';
import type {
  AdmitResult,
  AdmitRoomEvent,
  PostRoomEvent,
  RoomEvent,
  RoomId,
  RoomSeq,
  RoomSlice,
  SliceBudget,
} from '../contracts/types';

/** Aggregate root for one tenant conversation's ordered event stream. */
export class Room {
  private readonly events: RoomEvent[];
  private readonly byTransportMessageId: Map<string, RoomEvent>;
  private readonly roomId: RoomId;

  constructor(id: RoomId, events: RoomEvent[] = []) {
    validateState(id, events);
    this.roomId = { ...id };
    this.events = events.map(cloneRoomEvent);
    this.byTransportMessageId = new Map(
      this.events.flatMap(event =>
        event.transportMessageId ? [[event.transportMessageId, event] as const] : [],
      ),
    );
  }

  get id(): RoomId {
    return { ...this.roomId };
  }

  get head(): RoomSeq {
    return this.events.at(-1)?.seq ?? 0;
  }

  admit(input: AdmitRoomEvent, at: string): AdmitResult {
    if (!sameRoom(input.roomId, this.roomId)) {
      throw new RoomValidationError('admitted event belongs to a different room');
    }
    if (!input.messageId.trim()) {
      throw new RoomValidationError('admit requires a transport messageId');
    }
    const existing = this.byTransportMessageId.get(input.messageId);
    if (existing) {
      return { outcome: 'duplicate', seq: existing.seq, event: cloneRoomEvent(existing) };
    }

    const event = this.append(
      {
        messageId: input.messageId,
        transportMessageId: input.messageId,
        author: input.author,
        kind: input.kind,
        body: input.body,
        origin: input.origin ?? (input.kind === 'control-plane' ? 'control-plane' : 'endpoint'),
        addressedTo: input.addressedTo ?? [],
      },
      at,
    );
    return { outcome: 'admitted', seq: event.seq, event: cloneRoomEvent(event) };
  }

  post(input: PostRoomEvent, at: string): RoomEvent {
    return this.append(input, at);
  }

  eventsAfter(seq: RoomSeq, excludingAuthorId?: string): RoomEvent[] {
    return this.events
      .filter(event => event.seq > seq && event.author.id !== excludingAuthorId)
      .map(cloneRoomEvent);
  }

  readSlice(afterSeq: RoomSeq, budget: SliceBudget): RoomSlice {
    assertSeq(afterSeq, 'slice cursor');
    if (!Number.isSafeInteger(budget.maxEvents) || budget.maxEvents < 0) {
      throw new RoomValidationError('maxEvents must be a non-negative integer');
    }
    if (
      budget.maxChars !== undefined &&
      (!Number.isSafeInteger(budget.maxChars) || budget.maxChars < 0)
    ) {
      throw new RoomValidationError('maxChars must be a non-negative integer');
    }
    const events: RoomEvent[] = [];
    let chars = 0;
    for (const event of this.events) {
      if (event.seq <= afterSeq) continue;
      if (events.length >= budget.maxEvents) break;
      if (budget.maxChars !== undefined && chars + event.body.length > budget.maxChars) break;
      events.push(cloneRoomEvent(event));
      chars += event.body.length;
    }
    return { events, head: this.head };
  }

  snapshot(): RoomEvent[] {
    return this.events.map(cloneRoomEvent);
  }

  private append(input: PostRoomEvent & { transportMessageId?: string }, at: string): RoomEvent {
    if (!input.messageId.trim()) {
      throw new RoomValidationError('room event messageId cannot be blank');
    }
    const event: RoomEvent = {
      seq: this.head + 1,
      roomId: { ...this.roomId },
      messageId: input.messageId,
      ...(input.transportMessageId ? { transportMessageId: input.transportMessageId } : {}),
      author: { ...input.author },
      kind: input.kind,
      body: input.body,
      origin: input.origin,
      addressedTo: [...input.addressedTo],
      at,
    };
    this.events.push(event);
    if (event.transportMessageId) this.byTransportMessageId.set(event.transportMessageId, event);
    return cloneRoomEvent(event);
  }
}

function validateState(id: RoomId, events: RoomEvent[]): void {
  if (!id.tenantId.trim() || !id.conversationId.trim()) {
    throw new RoomValidationError('room identity is incomplete');
  }
  const transportMessageIds = new Set<string>();
  for (const [index, event] of events.entries()) {
    if (!sameRoom(event.roomId, id)) {
      throw new RoomValidationError('restored event belongs to a different room');
    }
    if (event.seq !== index + 1) {
      throw new RoomValidationError('restored room sequence is not contiguous');
    }
    if (!event.messageId.trim()) {
      throw new RoomValidationError('restored room contains a blank messageId');
    }
    if (
      event.transportMessageId !== undefined &&
      (!event.transportMessageId.trim() || transportMessageIds.has(event.transportMessageId))
    ) {
      throw new RoomValidationError(
        'restored room contains an invalid or duplicate transport messageId',
      );
    }
    if (event.transportMessageId) transportMessageIds.add(event.transportMessageId);
  }
}

function assertSeq(seq: RoomSeq, label: string): void {
  if (!Number.isSafeInteger(seq) || seq < 0) {
    throw new RoomValidationError(`${label} must be a non-negative integer`);
  }
}

function sameRoom(left: RoomId, right: RoomId): boolean {
  return left.tenantId === right.tenantId && left.conversationId === right.conversationId;
}

function cloneRoomEvent(event: RoomEvent): RoomEvent {
  return {
    ...event,
    roomId: { ...event.roomId },
    author: { ...event.author },
    addressedTo: [...event.addressedTo],
  };
}
