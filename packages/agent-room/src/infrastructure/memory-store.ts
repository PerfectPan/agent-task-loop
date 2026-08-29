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
import { Room } from '../domain/room';

export interface MemoryRoomStreamStoreOptions {
  now?: () => number;
}

export class MemoryRoomStreamStore implements RoomStreamStore {
  private readonly rooms = new Map<string, RoomEvent[]>();
  private readonly sessions = new Map<string, AgentSession>();
  private readonly now: () => number;

  constructor(options: MemoryRoomStreamStoreOptions = {}) {
    this.now = options.now ?? Date.now;
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
    const room = this.load(input.roomId);
    const result = room.admit(input, this.isoNow());
    this.rooms.set(roomKey(input.roomId), room.snapshot());
    return result;
  }

  async head(roomId: RoomId): Promise<RoomSeq> {
    return this.load(roomId).head;
  }

  async readSlice(roomId: RoomId, afterSeq: RoomSeq, budget: SliceBudget): Promise<RoomSlice> {
    const events: RoomEvent[] = [];
    let chars = 0;
    for (const event of this.roomEvents(roomId)) {
      if (event.seq <= afterSeq) continue;
      if (events.length >= budget.maxEvents) break;
      if (budget.maxChars !== undefined && chars + event.body.length > budget.maxChars && events.length > 0) {
        break;
      }
      events.push(cloneEvent(event));
      chars += event.body.length;
    }
    return { events, head: await this.head(roomId) };
  }

  async replyInSerial(input: RoomReplyCommand): Promise<RoomReplyResult> {
    if (input.origin === 'control-plane') {
      const event = this.appendEvent(input.session.roomId, {
        messageId: controlPlaneMessageId(input.session, this.roomEvents(input.session.roomId).length + 1),
        author: { kind: 'control-plane', id: input.session.agentId },
        kind: 'control-plane',
        body: input.body,
        origin: 'control-plane',
        addressedTo: [],
      });
      return { outcome: 'posted', seq: event.seq, event };
    }

    if (input.ackHeldUpToSeq !== undefined) this.ackHold(input.session, input.ackHeldUpToSeq);
    const session = this.loadSession(input.session);
    const newer = this.roomEvents(input.session.roomId).filter(
      event => event.seq > session.seenSeq && event.author.id !== input.session.agentId,
    );
    if (newer.length > 0) {
      const heldUpToSeq = newer.at(-1)!.seq;
      session.hold(heldUpToSeq);
      this.saveSession(session);
      return { outcome: 'held', heldUpToSeq, newer: newer.map(cloneEvent) };
    }

    const event = this.appendEvent(input.session.roomId, {
      messageId: postedMessageId(input.session, this.roomEvents(input.session.roomId).length + 1),
      author: { kind: 'agent', id: input.session.agentId },
      kind: 'posted',
      body: input.body,
      origin: 'endpoint',
      addressedTo: [],
    });
    session.recordPost(event.seq);
    this.saveSession(session);
    return { outcome: 'posted', seq: event.seq, event };
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

  private roomEvents(roomId: RoomId): RoomEvent[] {
    return this.load(roomId).snapshot();
  }

  private appendEvent(roomId: RoomId, input: Omit<AdmitRoomEvent, 'roomId'>): RoomEvent {
    const room = this.load(roomId);
    const result = room.admit({ ...input, roomId }, this.isoNow());
    this.rooms.set(roomKey(roomId), room.snapshot());
    return result.event;
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

function cloneEvent(event: RoomEvent): RoomEvent {
  return {
    ...event,
    roomId: { ...event.roomId },
    author: { ...event.author },
    addressedTo: [...event.addressedTo],
  };
}

function postedMessageId(session: AgentSessionId, seq: RoomSeq): string {
  return `posted:${sessionKey(session)}:${seq}`;
}

function controlPlaneMessageId(session: AgentSessionId, seq: RoomSeq): string {
  return `control:${sessionKey(session)}:${seq}`;
}
