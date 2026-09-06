import {
  ROOM_AGENT_ROSTER,
  isRoomLabAgentId,
  type RoomLabAgentId,
} from './agent-roster';
import {
  RoomCatalogInvariantError,
  assertRoomIdentity,
} from './room-identity';
import { RoomComposition } from './room-composition';

export interface RoomRecord {
  id: string;
  title: string;
  goal?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  memberIds: RoomLabAgentId[];
}

export class RoomCatalog {
  private rooms: RoomRecord[];
  private lastOpenedId?: string;

  constructor(rooms: readonly RoomRecord[] = [], lastOpenedId?: string) {
    this.rooms = rooms.map(cloneRecord);
    this.lastOpenedId = lastOpenedId && this.rooms.some(room => room.id === lastOpenedId)
      ? lastOpenedId
      : this.rooms[0]?.id;
  }

  create(input: {
    id: string;
    title: string;
    goal?: string;
    memberIds?: readonly RoomLabAgentId[];
    now: string;
  }): RoomRecord {
    const id = assertRoomIdentity(input.id);
    if (this.rooms.some(room => room.id === id)) {
      throw new RoomCatalogInvariantError(`Room already exists: ${id}`);
    }
    const record: RoomRecord = {
      id,
      title: validateTitle(input.title),
      createdAt: input.now,
      updatedAt: input.now,
      lastOpenedAt: input.now,
      memberIds: new RoomComposition(input.memberIds ?? defaultMembers()).snapshot(),
      ...(optionalGoal(input.goal) === undefined ? {} : { goal: optionalGoal(input.goal) }),
    };
    this.rooms.push(record);
    this.lastOpenedId = id;
    return cloneRecord(record);
  }

  list(): RoomRecord[] {
    return [...this.rooms].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  get(id: string): RoomRecord {
    const room = this.rooms.find(candidate => candidate.id === id);
    if (!room) throw new RoomCatalogInvariantError(`Unknown Room: ${id}`);
    return cloneRecord(room);
  }

  lastOpened(): RoomRecord | undefined {
    return this.lastOpenedId ? this.get(this.lastOpenedId) : undefined;
  }

  rename(id: string, title: string, now: string): RoomRecord {
    return this.update(id, room => {
      room.title = validateTitle(title);
      room.updatedAt = now;
    });
  }

  touch(id: string, now: string): RoomRecord {
    return this.update(id, room => {
      room.lastOpenedAt = now;
      this.lastOpenedId = id;
    });
  }

  replaceMembers(id: string, memberIds: readonly RoomLabAgentId[], now: string): RoomRecord {
    return this.update(id, room => {
      room.memberIds = new RoomComposition(memberIds).snapshot();
      room.updatedAt = now;
    });
  }

  snapshot(): { rooms: RoomRecord[]; lastOpenedId?: string } {
    return {
      rooms: this.rooms.map(cloneRecord),
      ...(this.lastOpenedId === undefined ? {} : { lastOpenedId: this.lastOpenedId }),
    };
  }

  private update(id: string, change: (room: RoomRecord) => void): RoomRecord {
    const index = this.rooms.findIndex(room => room.id === id);
    if (index < 0) throw new RoomCatalogInvariantError(`Unknown Room: ${id}`);
    const next = cloneRecord(this.rooms[index]!);
    change(next);
    this.rooms[index] = next;
    return cloneRecord(next);
  }
}

export { RoomCatalogInvariantError };

function defaultMembers(): RoomLabAgentId[] {
  return ROOM_AGENT_ROSTER.map(agent => agent.id);
}

function validateTitle(value: string): string {
  const title = value.trim().replace(/\s+/g, ' ');
  if (!title) throw new RoomCatalogInvariantError('Room title is required');
  if (title.length > 80) throw new RoomCatalogInvariantError('Room title must be at most 80 characters');
  return title;
}

function optionalGoal(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const goal = value.trim();
  if (!goal) return undefined;
  if (goal.length > 400) throw new RoomCatalogInvariantError('Room goal must be at most 400 characters');
  return goal;
}

function cloneRecord(room: RoomRecord): RoomRecord {
  return {
    ...room,
    memberIds: [...room.memberIds],
  };
}

export function isRoomLabAgentIdList(value: unknown): value is RoomLabAgentId[] {
  return Array.isArray(value) && value.every(isRoomLabAgentId);
}
