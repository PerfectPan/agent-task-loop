import { DatabaseSync } from 'node:sqlite';
import {
  AgentSessionAggregate,
  Room,
  RoomStreamService,
  sessionKey,
  type AgentId,
  type AgentSession,
  type AgentSessionId,
  type AdmitResult,
  type AdmitRoomEvent,
  type RoomAuthor,
  type RoomEvent,
  type RoomId,
  type RoomSeq,
  type RoomSlice,
  type RoomUnitOfWork,
  type SliceBudget,
  type PassCommand,
  type PassResult,
  type SpeakCommand,
  type SpeakResult,
} from '@rivus/agent-room';

/**
 * One room's record and cursors over the sqlite tables. A unit of work is one
 * `BEGIN IMMEDIATE` around three steps — re-read the room's rows, run the
 * domain work, write back only what changed — so two instances of this class
 * on the same room (the service keeps one, the private-room gateway opens one
 * per post) cannot overwrite each other's events, and an append's HELD check
 * cannot race another writer: it runs inside the same write lock the append
 * commits under. Nothing is cached across units of work; every one starts
 * from the rows as committed.
 */
export class SqliteRoomUnitOfWork implements RoomUnitOfWork {
  private events: RoomEvent[];
  private readonly sessions = new Map<string, AgentSession>();
  /** What the rows held when they were last read: the diff base of the next write. */
  private dbHead = 0;
  private readonly dbSessions = new Map<string, AgentSession>();

  constructor(
    private readonly db: DatabaseSync,
    private readonly roomId: RoomId,
  ) {
    this.events = [];
  }

  readRoom<T>(id: RoomId, query: (room: Room) => T): T {
    this.assertRoom(id);
    this.reload();
    return query(new Room(id, this.events));
  }

  withRoom<T>(id: RoomId, work: (room: Room) => T): T {
    return this.transact(() => {
      const room = this.openRoom(id);
      const result = work(room);
      this.events = room.snapshot();
      return result;
    });
  }

  withRoomAndSession<T>(id: AgentSessionId, work: (room: Room, session: AgentSessionAggregate) => T): T {
    return this.transact(() => {
      const room = this.openRoom(id.roomId);
      const session = this.loadSession(id);
      const result = work(room, session);
      this.events = room.snapshot();
      this.sessions.set(sessionKey(id), session.snapshot());
      return result;
    });
  }

  ensureSession(id: AgentSessionId): AgentSession {
    return this.transact(() => {
      const snapshot = this.loadSession(id).snapshot();
      this.sessions.set(sessionKey(id), snapshot);
      return snapshot;
    });
  }

  inspectSession(id: AgentSessionId): AgentSession | undefined {
    this.reload();
    const snapshot = this.sessions.get(sessionKey(id));
    return snapshot ? cloneSession(snapshot) : undefined;
  }

  clear(): void {
    const roomId = this.roomId.conversationId;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM room_events WHERE room_id = ?').run(roomId);
      this.db.prepare('DELETE FROM agent_sessions WHERE room_id = ?').run(roomId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.events = [];
    this.sessions.clear();
    this.dbHead = 0;
    this.dbSessions.clear();
  }

  private transact<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    let result: T;
    try {
      this.reload();
      result = work();
      this.write();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      // A failed unit of work leaves nothing of itself behind: the cache is
      // rebuilt off the rows, so an append that never committed is never
      // served as if it had been.
      this.reload();
      throw error;
    }
    return result;
  }

  private openRoom(id: RoomId): Room {
    this.assertRoom(id);
    return new Room(id, this.events);
  }

  private loadSession(id: AgentSessionId): AgentSessionAggregate {
    const existing = this.sessions.get(sessionKey(id));
    return new AgentSessionAggregate(id, existing ? { seenSeq: existing.seenSeq } : undefined);
  }

  private reload(): void {
    const roomId = this.roomId.conversationId;
    const eventRows = this.db
      .prepare(`
      SELECT seq, message_id, transport_message_id, author_kind, author_id, kind, body, addressed_to, origin, wake_depth, at
      FROM room_events WHERE room_id = ? ORDER BY seq ASC
    `)
      .all(roomId) as unknown as EventRow[];
    this.events = eventRows.map((row) => toEvent(this.roomId, row));
    const sessionRows = this.db
      .prepare(`
      SELECT tenant_id, agent_id, room_id, runtime_generation_id, seen_seq
      FROM agent_sessions WHERE room_id = ?
    `)
      .all(roomId) as unknown as SessionRow[];
    this.sessions.clear();
    for (const row of sessionRows) {
      const session = toSession(row);
      this.sessions.set(sessionKey(session.id), session);
    }
    this.dbHead = this.events.at(-1)?.seq ?? 0;
    this.dbSessions.clear();
    for (const session of this.sessions.values()) {
      this.dbSessions.set(sessionKey(session.id), cloneSession(session));
    }
  }

  /**
   * The diff against `reload`'s read: events past the head the rows held —
   * the record is append-only, so a seq is either already stored or this
   * unit's — and sessions whose cursor moved. Another instance's events sit
   * below the diff line and survive untouched.
   */
  private write(): void {
    const roomId = this.roomId.conversationId;
    const insertEvent = this.db.prepare(`
      INSERT INTO room_events (
        room_id, seq, message_id, transport_message_id, author_kind, author_id, kind, body, addressed_to, origin, wake_depth, at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const event of this.events) {
      if (event.seq <= this.dbHead) {
        continue;
      }
      insertEvent.run(
        roomId,
        event.seq,
        event.messageId,
        event.transportMessageId ?? null,
        event.author.kind,
        event.author.id,
        event.kind,
        event.body,
        JSON.stringify(event.addressedTo),
        event.origin,
        event.wakeDepth,
        event.at,
      );
    }
    const upsertSession = this.db.prepare(`
      INSERT INTO agent_sessions (
        tenant_id, agent_id, room_id, runtime_generation_id, seen_seq
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, agent_id, room_id, runtime_generation_id) DO UPDATE SET seen_seq = excluded.seen_seq
    `);
    for (const session of this.sessions.values()) {
      if (this.dbSessions.get(sessionKey(session.id))?.seenSeq === session.seenSeq) {
        continue;
      }
      upsertSession.run(
        session.id.tenantId,
        session.id.agentId,
        session.id.roomId.conversationId,
        session.id.runtimeGenerationId,
        session.seenSeq,
      );
    }
    this.dbHead = this.events.at(-1)?.seq ?? this.dbHead;
    this.dbSessions.clear();
    for (const session of this.sessions.values()) {
      this.dbSessions.set(sessionKey(session.id), cloneSession(session));
    }
  }

  private assertRoom(id: RoomId): void {
    if (id.tenantId !== this.roomId.tenantId || id.conversationId !== this.roomId.conversationId) {
      throw new Error('sqlite room store was opened for a different room');
    }
  }
}

export class SqliteRoomStreamStore {
  private readonly unitOfWork: SqliteRoomUnitOfWork;
  private readonly service: RoomStreamService;

  constructor(
    db: DatabaseSync,
    private readonly roomId: RoomId,
    private readonly now: () => number = Date.now,
  ) {
    this.unitOfWork = new SqliteRoomUnitOfWork(db, roomId);
    this.service = new RoomStreamService(this.unitOfWork, now);
  }

  ensureSession(id: AgentSessionId): AgentSession {
    return this.unitOfWork.ensureSession(id);
  }

  inspectSession(id: AgentSessionId): AgentSession | undefined {
    return this.unitOfWork.inspectSession(id);
  }

  clear(): void {
    this.unitOfWork.clear();
  }

  admit(input: AdmitRoomEvent): Promise<AdmitResult> {
    return this.service.admit(input);
  }

  head(roomId: RoomId): Promise<RoomSeq> {
    return this.service.head(roomId);
  }

  readSlice(roomId: RoomId, afterSeq: RoomSeq, budget: SliceBudget): Promise<RoomSlice> {
    return this.service.readSlice(roomId, afterSeq, budget);
  }

  speak(input: SpeakCommand): Promise<SpeakResult> {
    return this.service.speak(input);
  }

  pass(input: PassCommand): Promise<PassResult> {
    return this.service.pass(input);
  }

  /**
   * Appends an endpoint-authored member post (room_dm): the write the
   * private-room gateway makes in a child room. Its depth names the parent
   * trigger's plus one rather than an in-room trigger's, it never HELDs, and
   * it moves no cursor — the room's own protocol takes over from the next
   * event on. `messageId` goes in without the seq; the record stamps it, the
   * way speak's own ids do.
   */
  async post(input: {
    messageId: string;
    author: RoomAuthor;
    body: string;
    addressedTo: AgentId[];
    wakeDepth: number;
  }): Promise<RoomEvent> {
    return this.unitOfWork.withRoom(this.roomIdOf(), (room) =>
      room.post(
        {
          messageId: `${input.messageId}:${room.head + 1}`,
          author: input.author,
          kind: 'posted',
          body: input.body,
          origin: 'endpoint',
          addressedTo: [...input.addressedTo],
          wakeDepth: input.wakeDepth,
        },
        new Date(this.now()).toISOString(),
      ),
    );
  }

  private roomIdOf(): RoomId {
    return { tenantId: this.roomId.tenantId, conversationId: this.roomId.conversationId };
  }
}

interface EventRow {
  seq: number;
  message_id: string;
  transport_message_id: string | null;
  author_kind: RoomEvent['author']['kind'];
  author_id: string;
  kind: RoomEvent['kind'];
  body: string;
  addressed_to: string;
  origin: RoomEvent['origin'];
  wake_depth: number;
  at: string;
}

interface SessionRow {
  tenant_id: string;
  agent_id: string;
  room_id: string;
  runtime_generation_id: string;
  seen_seq: number;
}

function toEvent(roomId: RoomId, row: EventRow): RoomEvent {
  return {
    seq: Number(row.seq),
    roomId,
    messageId: row.message_id,
    ...(row.transport_message_id ? { transportMessageId: row.transport_message_id } : {}),
    author: { kind: row.author_kind, id: row.author_id },
    kind: row.kind,
    body: row.body,
    origin: row.origin,
    addressedTo: JSON.parse(row.addressed_to) as string[],
    wakeDepth: Number(row.wake_depth),
    at: row.at,
  };
}

function toSession(row: SessionRow): AgentSession {
  return {
    id: {
      tenantId: row.tenant_id,
      agentId: row.agent_id,
      roomId: { tenantId: row.tenant_id, conversationId: row.room_id },
      runtimeGenerationId: row.runtime_generation_id,
    },
    seenSeq: Number(row.seen_seq),
  };
}

function cloneSession(session: AgentSession): AgentSession {
  return {
    id: {
      ...session.id,
      roomId: { ...session.id.roomId },
    },
    seenSeq: session.seenSeq,
  };
}
