import { RoomNotImplementedError, RoomValidationError } from '../contracts/errors';
import type { RoomStreamStore } from '../contracts/store';
import type {
  AdmitResult,
  AdmitRoomEvent,
  RoomEvent,
  RoomId,
  RoomReplyCommand,
  RoomReplyResult,
  RoomSeq,
  RoomSlice,
  SliceBudget,
} from '../contracts/types';
import { roomKey } from '../contracts/types';

interface RoomState {
  events: RoomEvent[];
  byMessageId: Map<string, RoomEvent>;
}

export interface MemoryRoomStreamStoreOptions {
  now?: () => number;
}

export class MemoryRoomStreamStore implements RoomStreamStore {
  private readonly rooms = new Map<string, RoomState>();
  private readonly now: () => number;

  constructor(options: MemoryRoomStreamStoreOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  async admit(input: AdmitRoomEvent): Promise<AdmitResult> {
    if (!input.messageId.trim()) {
      throw new RoomValidationError('admit requires a transport messageId');
    }
    const key = roomKey(input.roomId);
    const room = this.rooms.get(key) ?? emptyRoom();
    const existing = room.byMessageId.get(input.messageId);
    if (existing) {
      return { outcome: 'duplicate', seq: existing.seq, event: existing };
    }

    const event: RoomEvent = {
      seq: room.events.length + 1,
      roomId: input.roomId,
      messageId: input.messageId,
      author: { ...input.author },
      kind: input.kind,
      body: input.body,
      origin: input.origin ?? (input.kind === 'control-plane' ? 'control-plane' : 'endpoint'),
      addressedTo: [...(input.addressedTo ?? [])],
      at: new Date(this.now()).toISOString(),
    };
    room.events.push(event);
    room.byMessageId.set(event.messageId, event);
    this.rooms.set(key, room);
    return { outcome: 'admitted', seq: event.seq, event };
  }

  async head(roomId: RoomId): Promise<RoomSeq> {
    const room = this.rooms.get(roomKey(roomId));
    return room?.events.at(-1)?.seq ?? 0;
  }

  async readSlice(
    _roomId: RoomId,
    _afterSeq: RoomSeq,
    _budget: SliceBudget,
  ): Promise<RoomSlice> {
    throw new RoomNotImplementedError('readSlice');
  }

  async replyInSerial(_input: RoomReplyCommand): Promise<RoomReplyResult> {
    throw new RoomNotImplementedError('replyInSerial');
  }
}

export function createMemoryRoomStreamStore(
  options: MemoryRoomStreamStoreOptions = {},
): RoomStreamStore {
  return new MemoryRoomStreamStore(options);
}

function emptyRoom(): RoomState {
  return { events: [], byMessageId: new Map() };
}
