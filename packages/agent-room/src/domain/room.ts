import { RoomValidationError } from '../contracts/errors';
import type { AdmitResult, AdmitRoomEvent, RoomEvent, RoomId, RoomSeq } from '../contracts/types';

/** Aggregate root for one tenant conversation's ordered event stream. */
export class Room {
  private readonly events: RoomEvent[];
  private readonly byMessageId: Map<string, RoomEvent>;
  private readonly roomId: RoomId;

  constructor(id: RoomId, events: RoomEvent[] = []) {
    validateState(id, events);
    this.roomId = { ...id };
    this.events = events.map(cloneRoomEvent);
    this.byMessageId = new Map(this.events.map(event => [event.messageId, event]));
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
    const existing = this.byMessageId.get(input.messageId);
    if (existing) {
      return { outcome: 'duplicate', seq: existing.seq, event: cloneRoomEvent(existing) };
    }

    const event: RoomEvent = {
      seq: this.head + 1,
      roomId: { ...this.roomId },
      messageId: input.messageId,
      author: { ...input.author },
      kind: input.kind,
      body: input.body,
      origin: input.origin ?? (input.kind === 'control-plane' ? 'control-plane' : 'endpoint'),
      addressedTo: [...(input.addressedTo ?? [])],
      at,
    };
    this.events.push(event);
    this.byMessageId.set(event.messageId, event);
    return { outcome: 'admitted', seq: event.seq, event: cloneRoomEvent(event) };
  }

  snapshot(): RoomEvent[] {
    return this.events.map(cloneRoomEvent);
  }
}

function validateState(id: RoomId, events: RoomEvent[]): void {
  if (!id.tenantId.trim() || !id.conversationId.trim()) {
    throw new RoomValidationError('room identity is incomplete');
  }
  const messageIds = new Set<string>();
  for (const [index, event] of events.entries()) {
    if (!sameRoom(event.roomId, id)) {
      throw new RoomValidationError('restored event belongs to a different room');
    }
    if (event.seq !== index + 1) {
      throw new RoomValidationError('restored room sequence is not contiguous');
    }
    if (!event.messageId.trim() || messageIds.has(event.messageId)) {
      throw new RoomValidationError('restored room contains an invalid or duplicate messageId');
    }
    messageIds.add(event.messageId);
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
