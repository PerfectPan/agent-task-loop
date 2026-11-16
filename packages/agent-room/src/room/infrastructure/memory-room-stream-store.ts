import { AgentSessionAggregate } from '../../agent-session/domain/agent-session';
import {
  cloneSession,
  sessionForwarders,
  sessionKey,
  type AgentSession,
  type AgentSessionId,
} from '../../agent-session/domain/model';
import type { RoomStreamStore } from '../application/room-stream-store';
import { RoomStreamService } from '../application/room-stream-service';
import type { RoomUnitOfWork } from '../application/room-unit-of-work';
import type { AdmitResult, AdmitRoomEvent, RoomId, RoomEvent, RoomSeq, RoomSlice, SliceBudget } from '../domain/model';
import type { PassCommand, PassResult } from '../domain/pass';
import type { SpeakCommand, SpeakResult } from '../domain/speak';
import { Room } from '../domain/room';

export interface MemoryRoomStreamStoreOptions {
  now?: () => number;
  beforeCommit?: () => void;
}

function roomStorageKey(id: RoomId): string {
  return JSON.stringify([id.tenantId, id.conversationId]);
}

export class MemoryRoomUnitOfWork implements RoomUnitOfWork {
  private readonly rooms = new Map<string, RoomEvent[]>();
  private readonly sessions = new Map<string, AgentSession>();

  constructor(private readonly beforeCommit?: () => void) {}

  readRoom<T>(id: RoomId, query: (room: Room) => T): T {
    return query(this.loadRoom(id));
  }

  withRoom<T>(id: RoomId, work: (room: Room) => T): T {
    const room = this.loadRoom(id);
    const result = work(room);
    this.beforeCommit?.();
    this.rooms.set(roomStorageKey(id), room.snapshot());
    return result;
  }

  withRoomAndSession<T>(id: AgentSessionId, work: (room: Room, session: AgentSessionAggregate) => T): T {
    const room = this.loadRoom(id.roomId);
    const session = this.loadSession(id);
    const result = work(room, session);
    const roomSnapshot = room.snapshot();
    const sessionSnapshot = session.snapshot();
    this.beforeCommit?.();
    this.rooms.set(roomStorageKey(id.roomId), roomSnapshot);
    this.sessions.set(sessionKey(id), sessionSnapshot);
    return result;
  }

  ensureSession(id: AgentSessionId): AgentSession {
    const session = this.loadSession(id);
    const snapshot = session.snapshot();
    this.sessions.set(sessionKey(id), snapshot);
    return snapshot;
  }

  inspectSession(id: AgentSessionId): AgentSession | undefined {
    const snapshot = this.sessions.get(sessionKey(id));
    return snapshot ? cloneSession(snapshot) : undefined;
  }

  advanceSeen(id: AgentSessionId, seq: RoomSeq): AgentSession {
    return this.changeSession(id, (session) => session.advanceSeen(seq));
  }

  private loadRoom(id: RoomId): Room {
    return new Room(id, this.rooms.get(roomStorageKey(id)) ?? []);
  }

  private loadSession(id: AgentSessionId): AgentSessionAggregate {
    // A stored snapshot already carries `seenSeq`; an absent one starts fresh.
    return AgentSessionAggregate.fromStored(id, this.sessions.get(sessionKey(id)));
  }

  private changeSession(id: AgentSessionId, change: (session: AgentSessionAggregate) => void): AgentSession {
    const session = this.loadSession(id);
    change(session);
    const snapshot = session.snapshot();
    this.sessions.set(sessionKey(id), snapshot);
    return snapshot;
  }
}

export class MemoryRoomStreamStore implements RoomStreamStore {
  private readonly unitOfWork: MemoryRoomUnitOfWork;
  private readonly service: RoomStreamService;
  private sessionAccess: ReturnType<typeof sessionForwarders> | undefined;

  constructor(options: MemoryRoomStreamStoreOptions = {}) {
    this.unitOfWork = new MemoryRoomUnitOfWork(options.beforeCommit);
    this.service = new RoomStreamService(this.unitOfWork, options.now ?? Date.now);
  }

  private forwarders(): ReturnType<typeof sessionForwarders> {
    return (this.sessionAccess ??= sessionForwarders(this.unitOfWork));
  }

  ensureSession(id: AgentSessionId): AgentSession {
    return this.forwarders().ensureSession(id);
  }

  inspectSession(id: AgentSessionId): AgentSession | undefined {
    return this.forwarders().inspectSession(id);
  }

  advanceSeen(id: AgentSessionId, seq: RoomSeq): AgentSession {
    return this.forwarders().advanceSeen(id, seq);
  }

  async admit(input: AdmitRoomEvent): Promise<AdmitResult> {
    return this.service.admit(input);
  }

  async head(roomId: RoomId): Promise<RoomSeq> {
    return this.service.head(roomId);
  }

  async readSlice(roomId: RoomId, afterSeq: RoomSeq, budget: SliceBudget): Promise<RoomSlice> {
    return this.service.readSlice(roomId, afterSeq, budget);
  }

  async speak(input: SpeakCommand): Promise<SpeakResult> {
    return this.service.speak(input);
  }

  async pass(input: PassCommand): Promise<PassResult> {
    return this.service.pass(input);
  }
}

export function createMemoryRoomStreamStore(options: MemoryRoomStreamStoreOptions = {}): RoomStreamStore {
  return new MemoryRoomStreamStore(options);
}
