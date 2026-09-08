import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { RoomLabAgentId } from '../domain/agent-roster';
import { RoomCatalog, type RoomRecord } from '../domain/room-catalog';
import { writeJsonAtomic } from './atomic-write.server';

interface CatalogFile {
  version: 1;
  rooms: RoomRecord[];
  lastOpenedId?: string;
}

export function defaultRoomHome(): string {
  return process.env.RIVUS_ROOM_HOME?.trim() || join(homedir(), '.rivus', 'room-web', 'v1');
}

export class FileRoomCatalogStore {
  constructor(private readonly root: string = defaultRoomHome()) {}

  load(): RoomCatalog {
    const file = join(this.root, 'catalog.json');
    if (!existsSync(file)) return new RoomCatalog();
    const data = JSON.parse(readFileSync(file, 'utf8')) as CatalogFile;
    return new RoomCatalog(data.rooms ?? [], data.lastOpenedId);
  }

  save(catalog: RoomCatalog): void {
    const snapshot = catalog.snapshot();
    writeJsonAtomic(join(this.root, 'catalog.json'), {
      version: 1,
      rooms: snapshot.rooms,
      ...(snapshot.lastOpenedId === undefined ? {} : { lastOpenedId: snapshot.lastOpenedId }),
    } satisfies CatalogFile);
  }

  roomDirectory(id: string): string {
    return join(this.root, 'rooms', id);
  }

  workspacePath(id: string): string {
    return join(this.roomDirectory(id), 'workspace.json');
  }
}

export function newRoomIdentity(): string {
  return `r_${randomBytes(5).toString('hex')}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createRoomRecordInput(input: {
  title: string;
  goal?: string;
  memberIds?: readonly RoomLabAgentId[];
}) {
  return {
    id: newRoomIdentity(),
    title: input.title,
    now: nowIso(),
    ...(input.goal === undefined ? {} : { goal: input.goal }),
    ...(input.memberIds === undefined ? {} : { memberIds: input.memberIds }),
  };
}
