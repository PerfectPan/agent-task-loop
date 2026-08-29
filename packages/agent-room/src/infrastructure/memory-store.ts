import type { RoomAdmissionStore } from '../contracts/store';
import type { AdmitResult, AdmitRoomEvent, RoomEvent, RoomId, RoomSeq } from '../contracts/types';
import { roomKey } from '../contracts/types';
import { Room } from '../domain/room';

export interface MemoryRoomStreamStoreOptions {
  now?: () => number;
}

export class MemoryRoomStreamStore implements RoomAdmissionStore {
  private readonly rooms = new Map<string, RoomEvent[]>();
  private readonly now: () => number;

  constructor(options: MemoryRoomStreamStoreOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  async admit(input: AdmitRoomEvent): Promise<AdmitResult> {
    const room = this.load(input.roomId);
    const result = room.admit(input, new Date(this.now()).toISOString());
    this.rooms.set(roomKey(input.roomId), room.snapshot());
    return result;
  }

  async head(roomId: RoomId): Promise<RoomSeq> {
    return this.load(roomId).head;
  }

  private load(id: RoomId): Room {
    return new Room(id, this.rooms.get(roomKey(id)) ?? []);
  }
}

export function createMemoryRoomStreamStore(
  options: MemoryRoomStreamStoreOptions = {},
): RoomAdmissionStore {
  return new MemoryRoomStreamStore(options);
}
