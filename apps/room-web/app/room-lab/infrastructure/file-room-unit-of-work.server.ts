import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AgentSessionAggregate,
  Room,
  type AgentSession,
  type AgentSessionId,
  type RoomEvent,
  type RoomId,
  type RoomSeq,
  type RoomUnitOfWork,
} from '@rivus/agent-room';
import { writeJsonAtomic } from './atomic-write.server';

export class FileRoomUnitOfWork implements RoomUnitOfWork {
  private events: RoomEvent[];
  private readonly sessions = new Map<string, AgentSession>();

  constructor(
    private readonly directory: string,
    private readonly roomId: RoomId,
  ) {
    this.events = readJson<RoomEvent[]>(join(directory, 'events.json'), []);
    for (const session of readJson<AgentSession[]>(join(directory, 'sessions.json'), [])) {
      this.sessions.set(sessionStorageKey(session.id), session);
    }
  }

  readRoom<T>(id: RoomId, query: (room: Room) => T): T {
    return query(this.loadRoom(id));
  }

  withRoom<T>(id: RoomId, work: (room: Room) => T): T {
    const room = this.loadRoom(id);
    const result = work(room);
    this.events = room.snapshot();
    this.persist();
    return result;
  }

  withRoomAndSession<T>(
    id: AgentSessionId,
    work: (room: Room, session: AgentSessionAggregate) => T,
  ): T {
    const room = this.loadRoom(id.roomId);
    const session = this.loadSession(id);
    const result = work(room, session);
    this.events = room.snapshot();
    this.sessions.set(sessionStorageKey(id), session.snapshot());
    this.persist();
    return result;
  }

  ensureSession(id: AgentSessionId): AgentSession {
    const snapshot = this.loadSession(id).snapshot();
    this.sessions.set(sessionStorageKey(id), snapshot);
    this.persist();
    return snapshot;
  }

  inspectSession(id: AgentSessionId): AgentSession | undefined {
    const snapshot = this.sessions.get(sessionStorageKey(id));
    return snapshot ? cloneSession(snapshot) : undefined;
  }

  advanceSeen(id: AgentSessionId, seq: RoomSeq): AgentSession {
    return this.changeSession(id, session => session.advanceSeen(seq));
  }

  hold(id: AgentSessionId, heldUpToSeq: RoomSeq): AgentSession {
    return this.changeSession(id, session => session.hold(heldUpToSeq));
  }

  ackHold(id: AgentSessionId, heldUpToSeq: RoomSeq): boolean {
    if (!this.sessions.has(sessionStorageKey(id))) return false;
    const session = this.loadSession(id);
    const acked = session.ackHold(heldUpToSeq);
    if (acked) {
      this.sessions.set(sessionStorageKey(id), session.snapshot());
      this.persist();
    }
    return acked;
  }

  private loadRoom(id: RoomId): Room {
    if (id.tenantId !== this.roomId.tenantId || id.conversationId !== this.roomId.conversationId) {
      throw new Error('file room store was opened for a different room');
    }
    return new Room(id, this.events);
  }

  private loadSession(id: AgentSessionId): AgentSessionAggregate {
    const existing = this.sessions.get(sessionStorageKey(id));
    return new AgentSessionAggregate(
      id,
      existing
        ? {
            seenSeq: existing.seenSeq,
            ...(existing.heldUpToSeq === undefined ? {} : { heldUpToSeq: existing.heldUpToSeq }),
          }
        : undefined,
    );
  }

  private changeSession(id: AgentSessionId, change: (session: AgentSessionAggregate) => void): AgentSession {
    const session = this.loadSession(id);
    change(session);
    const snapshot = session.snapshot();
    this.sessions.set(sessionStorageKey(id), snapshot);
    this.persist();
    return snapshot;
  }

  private persist(): void {
    writeJsonAtomic(join(this.directory, 'events.json'), this.events);
    writeJsonAtomic(join(this.directory, 'sessions.json'), [...this.sessions.values()]);
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function sessionStorageKey(id: AgentSessionId): string {
  return JSON.stringify([
    id.tenantId,
    id.agentId,
    id.roomId.tenantId,
    id.roomId.conversationId,
    id.runtimeGenerationId,
  ]);
}

function cloneSession(session: AgentSession): AgentSession {
  return {
    id: {
      ...session.id,
      roomId: { ...session.id.roomId },
    },
    seenSeq: session.seenSeq,
    ...(session.heldUpToSeq === undefined ? {} : { heldUpToSeq: session.heldUpToSeq }),
  };
}
