import type { RoomStreamStore } from '../contracts/store';
import type {
  AdmitResult,
  AdmitRoomEvent,
  AgentSession,
  AgentSessionId,
  RoomEvent,
  RoomId,
  RoomReplyCommand,
  RoomReplyResult,
  RoomSeq,
  RoomSlice,
  SliceBudget,
} from '../contracts/types';
import { roomKey, sessionKey } from '../contracts/types';
import { AgentSessionAggregate } from '../domain/agent-session';
import { replyInSerial } from '../domain/reply-in-serial';
import { Room } from '../domain/room';

export interface MemoryRoomStreamStoreOptions {
  now?: () => number;
  beforeCommit?: () => void;
}

export class MemoryRoomStreamStore implements RoomStreamStore {
  private readonly rooms = new Map<string, RoomEvent[]>();
  private readonly sessions = new Map<string, AgentSession>();
  private readonly now: () => number;
  private readonly beforeCommit: (() => void) | undefined;

  constructor(options: MemoryRoomStreamStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.beforeCommit = options.beforeCommit;
  }

  ensureSession(id: AgentSessionId): AgentSession {
    const session = this.loadSession(id);
    return this.saveSession(session);
  }

  inspectSession(id: AgentSessionId): AgentSession | undefined {
    const session = this.sessions.get(sessionKey(id));
    return session ? cloneSession(session) : undefined;
  }

  advanceSeen(id: AgentSessionId, seq: RoomSeq): AgentSession {
    const session = this.loadSession(id);
    session.advanceSeen(seq);
    return this.saveSession(session);
  }

  hold(id: AgentSessionId, heldUpToSeq: RoomSeq): AgentSession {
    const session = this.loadSession(id);
    session.hold(heldUpToSeq);
    return this.saveSession(session);
  }

  ackHold(id: AgentSessionId, heldUpToSeq: RoomSeq): boolean {
    if (!this.sessions.has(sessionKey(id))) return false;
    const session = this.loadSession(id);
    const acked = session.ackHold(heldUpToSeq);
    if (acked) this.saveSession(session);
    return acked;
  }

  async admit(input: AdmitRoomEvent): Promise<AdmitResult> {
    return this.withRoom(input.roomId, room => room.admit(input, this.isoNow()));
  }

  async head(roomId: RoomId): Promise<RoomSeq> {
    return this.load(roomId).head;
  }

  async readSlice(roomId: RoomId, afterSeq: RoomSeq, budget: SliceBudget): Promise<RoomSlice> {
    return this.load(roomId).readSlice(afterSeq, budget);
  }

  async replyInSerial(input: RoomReplyCommand): Promise<RoomReplyResult> {
    if (input.origin === 'control-plane') {
      return this.withRoom(input.session.roomId, room =>
        replyInSerial({
          room,
          session: new AgentSessionAggregate(input.session),
          command: input,
          at: this.isoNow(),
        }),
      );
    }
    return this.withRoomAndSession(input.session, (room, session) =>
      replyInSerial({ room, session, command: input, at: this.isoNow() }),
    );
  }

  private load(id: RoomId): Room {
    return new Room(id, this.rooms.get(roomKey(id)) ?? []);
  }

  private loadSession(id: AgentSessionId): AgentSessionAggregate {
    const key = sessionKey(id);
    const existing = this.sessions.get(key);
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

  private saveSession(session: AgentSessionAggregate): AgentSession {
    const snapshot = session.snapshot();
    this.sessions.set(sessionKey(snapshot.id), snapshot);
    return cloneSession(snapshot);
  }

  private withRoom<T>(id: RoomId, work: (room: Room) => T): T {
    const room = this.load(id);
    const result = work(room);
    this.beforeCommit?.();
    this.rooms.set(roomKey(id), room.snapshot());
    return result;
  }

  private withRoomAndSession<T>(
    id: AgentSessionId,
    work: (room: Room, session: AgentSessionAggregate) => T,
  ): T {
    const room = this.load(id.roomId);
    const session = this.loadSession(id);
    const result = work(room, session);
    const roomSnapshot = room.snapshot();
    const sessionSnapshot = session.snapshot();
    this.beforeCommit?.();
    this.rooms.set(roomKey(id.roomId), roomSnapshot);
    this.sessions.set(sessionKey(id), sessionSnapshot);
    return result;
  }

  private isoNow(): string {
    return new Date(this.now()).toISOString();
  }
}

export function createMemoryRoomStreamStore(
  options: MemoryRoomStreamStoreOptions = {},
): RoomStreamStore {
  return new MemoryRoomStreamStore(options);
}

function cloneSessionId(id: AgentSessionId): AgentSessionId {
  return { ...id, roomId: { ...id.roomId } };
}

function cloneSession(session: AgentSession): AgentSession {
  return {
    id: cloneSessionId(session.id),
    seenSeq: session.seenSeq,
    ...(session.heldUpToSeq === undefined ? {} : { heldUpToSeq: session.heldUpToSeq }),
  };
}
