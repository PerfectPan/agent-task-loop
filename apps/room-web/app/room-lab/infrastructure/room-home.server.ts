import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { RoomLabAgentId } from '../domain/agent-registry';

/** Where the sqlite library and every room's workspace live on this machine. */
export function defaultRoomHome(): string {
  return process.env.RIVUS_ROOM_HOME?.trim() || join(homedir(), '.rivus', 'room-web', 'v1');
}

function newRoomIdentity(): string {
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
