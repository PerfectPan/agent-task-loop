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
    return cloneSession(this.mutableSession(id));
  }

  inspectSession(id: AgentSessionId): AgentSession | undefined {
    const session = this.sessions.get(sessionKey(id));
    return session ? cloneSession(session) : undefined;
  }

  advanceSeen(id: AgentSessionId, seq: RoomSeq): AgentSession {
    const session = this.mutableSession(id);
    session.seenSeq = seq;
    return cloneSession(session);
  }

  hold(id: AgentSessionId, heldUpToSeq: RoomSeq): AgentSession {
    const session = this.mutableSession(id);
    session.heldUpToSeq = heldUpToSeq;
    return cloneSession(session);
  }

  /**
   * One-shot ack bound to `heldUpToSeq`. A preemptive ack, or an ack for a
   * different hold watermark, is ignored and returns false.
   */
  ackHold(id: AgentSessionId, heldUpToSeq: RoomSeq): boolean {
    const session = this.sessions.get(sessionKey(id));
    if (!session || session.heldUpToSeq !== heldUpToSeq) {
      return false;
    }
    session.seenSeq = Math.max(session.seenSeq, heldUpToSeq);
    delete session.heldUpToSeq;
    return true;
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

  private mutableSession(id: AgentSessionId): AgentSession {
    const key = sessionKey(id);
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }
    const created: AgentSession = { id: cloneSessionId(id), seenSeq: 0 };
    this.sessions.set(key, created);
    return created;
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
