import type { RoomAdmissionStore } from '../contracts/store';
import type {
  AdmitResult,
  AdmitRoomEvent,
  AgentSession,
  AgentSessionId,
  RoomEvent,
  RoomId,
  RoomSeq,
} from '../contracts/types';
import { roomKey, sessionKey } from '../contracts/types';
import { AgentSessionAggregate } from '../domain/agent-session';
import { Room } from '../domain/room';

export interface MemoryRoomStreamStoreOptions {
  now?: () => number;
}

export class MemoryRoomStreamStore implements RoomAdmissionStore {
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

  /**
   * One-shot ack bound to `heldUpToSeq`. A preemptive ack, or an ack for a
   * different hold watermark, is ignored and returns false.
   */
  ackHold(id: AgentSessionId, heldUpToSeq: RoomSeq): boolean {
    if (!this.sessions.has(sessionKey(id))) return false;
    const session = this.loadSession(id);
    const acked = session.ackHold(heldUpToSeq);
    if (acked) this.saveSession(session);
    return acked;
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
}

export function createMemoryRoomStreamStore(
  options: MemoryRoomStreamStoreOptions = {},
): RoomAdmissionStore {
  return new MemoryRoomStreamStore(options);
}
function cloneSessionId(id: AgentSessionId): AgentSessionId {
  return {
    tenantId: id.tenantId,
    agentId: id.agentId,
    roomId: { ...id.roomId },
    runtimeGenerationId: id.runtimeGenerationId,
  };
}

function cloneSession(session: AgentSession): AgentSession {
  return {
    id: cloneSessionId(session.id),
    seenSeq: session.seenSeq,
    ...(session.heldUpToSeq === undefined ? {} : { heldUpToSeq: session.heldUpToSeq }),
  };
}
