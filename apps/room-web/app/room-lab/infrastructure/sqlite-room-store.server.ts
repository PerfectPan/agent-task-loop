import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { RoomId } from '@rivus/agent-room';
import type { RoomLabWorkspaceSnapshot } from '../application/room-lab-service.server';
import { RoomCatalog, type RoomRecord } from '../domain/room-catalog';
import {
  AgentRegistry,
  type AgentDefinition,
  type RoomLabAgentId,
} from '../domain/agent-registry';
import { defaultRoomHome } from './room-home.server';
import { runMigrations } from './migrations';
import { SqliteRoomConversation } from './sqlite-room-conversation.server';

const TENANT = 'local';

export class SqliteRoomStore {
  /**
   * Empty until `migrate()` has created and seeded the table; from then on it
   * is the one registry every caller reads, and `reload()` re-reads the rows.
   */
  agents = new AgentRegistry();

  private constructor(
    readonly db: DatabaseSync,
    private readonly root: string,
  ) {}

  static open(root = defaultRoomHome()): SqliteRoomStore {
    mkdirSync(root, { recursive: true });
    const db = new DatabaseSync(join(root, 'rooms.sqlite'));
    db.exec('PRAGMA journal_mode = WAL');
    configureConnection(db);
    const store = new SqliteRoomStore(db, root);
    store.migrate();
    store.importLegacyFiles();
    return store;
  }

  static memory(): SqliteRoomStore {
    const db = new DatabaseSync(':memory:');
    configureConnection(db);
    const store = new SqliteRoomStore(db, ':memory:');
    store.migrate();
    return store;
  }

  loadCatalog(): RoomCatalog {
    const rooms = this.db.prepare(`
      SELECT id, title, goal, created_at, updated_at, last_opened_at
      FROM rooms
    `).all() as unknown as RoomRow[];
    const members = this.db.prepare(`
      SELECT room_id, agent_id, seat_order FROM room_members ORDER BY seat_order ASC
    `).all() as unknown as MemberRow[];
    const membersByRoom = new Map<string, RoomLabAgentId[]>();
    for (const row of members) {
      if (!this.agents.has(row.agent_id)) continue;
      const list = membersByRoom.get(row.room_id) ?? [];
      list.push(row.agent_id);
      membersByRoom.set(row.room_id, list);
    }
    const records: RoomRecord[] = rooms.map(row => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastOpenedAt: row.last_opened_at,
      // A seat whose agent has no row is dropped for this read only, and a room
      // left with none falls back to one agent so it can still be opened. Both
      // are display values: `saveRoom` is the only writer of seating.
      memberIds: membersByRoom.get(row.id) ?? this.agents.ids().slice(0, 1),
      ...(row.goal ? { goal: row.goal } : {}),
    }));
    const lastOpenedId = this.meta('last_opened_id');
    return new RoomCatalog(records, lastOpenedId, this.agents);
  }

  /**
   * One room's row and its seating.
   *
   * Seating is written only from a caller that actually changed it. What
   * `loadCatalog` hands out has had ids without an `agents` row filtered off it,
   * and writing that back would delete the seating for good: `room_members` has
   * no foreign key to `agents`, so a row removed by hand leaves its seat behind
   * on purpose, and the seat comes back when the row does.
   */
  saveRoom(record: RoomRecord): void {
    this.inTransaction(() => {
      this.upsertRoom(record);
      this.db.prepare('DELETE FROM room_members WHERE room_id = ?').run(record.id);
      const insertMember = this.db.prepare(`
        INSERT INTO room_members (room_id, agent_id, seat_order) VALUES (?, ?, ?)
      `);
      record.memberIds.forEach((agentId, index) => {
        insertMember.run(record.id, agentId, index);
      });
    });
  }

  /** Which room was opened last, and when. Touches no seating. */
  saveLastOpened(record: RoomRecord): void {
    this.inTransaction(() => {
      this.upsertRoom(record);
      this.db.prepare(`
        INSERT INTO app_meta (key, value) VALUES ('last_opened_id', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(record.id);
    });
  }

  /** Every room at once. For the one-time import of a pre-sqlite library. */
  saveCatalog(catalog: RoomCatalog): void {
    const snapshot = catalog.snapshot();
    this.inTransaction(() => {
      for (const room of snapshot.rooms) {
        this.upsertRoom(room);
        this.db.prepare('DELETE FROM room_members WHERE room_id = ?').run(room.id);
        const insertMember = this.db.prepare(`
          INSERT INTO room_members (room_id, agent_id, seat_order) VALUES (?, ?, ?)
        `);
        room.memberIds.forEach((agentId, index) => {
          insertMember.run(room.id, agentId, index);
        });
      }
      if (snapshot.lastOpenedId) {
        this.db.prepare(`
          INSERT INTO app_meta (key, value) VALUES ('last_opened_id', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(snapshot.lastOpenedId);
      }
    });
  }

  private upsertRoom(room: RoomRecord): void {
    this.db.prepare(`
      INSERT INTO rooms (id, title, goal, created_at, updated_at, last_opened_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        goal = excluded.goal,
        updated_at = excluded.updated_at,
        last_opened_at = excluded.last_opened_at
    `).run(room.id, room.title, room.goal ?? null, room.createdAt, room.updatedAt, room.lastOpenedAt);
  }

  private inTransaction(work: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      work();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  loadWorkspace(roomId: string): RoomLabWorkspaceSnapshot | undefined {
    const row = this.db.prepare('SELECT snapshot FROM room_workspace WHERE room_id = ?').get(roomId) as unknown as
      | { snapshot: string }
      | undefined;
    if (!row) return undefined;
    return JSON.parse(row.snapshot) as RoomLabWorkspaceSnapshot;
  }

  saveWorkspace(roomId: string, snapshot: RoomLabWorkspaceSnapshot, now: string): void {
    this.db.prepare(`
      INSERT INTO room_workspace (room_id, snapshot, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(room_id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at
    `).run(roomId, JSON.stringify(snapshot), now);
  }

  preview(roomId: string): { lastLine?: string; lastAt?: string } {
    const row = this.db.prepare(`
      SELECT body, at FROM room_events WHERE room_id = ? ORDER BY seq DESC LIMIT 1
    `).get(roomId) as unknown as { body: string; at: string } | undefined;
    if (!row?.body) return {};
    return {
      lastLine: row.body.replace(/\s+/g, ' ').slice(0, 48),
      lastAt: row.at,
    };
  }

  /**
   * The prompt is a column on the member's own row, so saving it is an update
   * to that row. An empty prompt is stored as empty rather than deleted: the
   * row still exists, it just adds nothing to a turn.
   */
  saveSystemPrompt(agentId: RoomLabAgentId, prompt: string): void {
    this.db
      .prepare('UPDATE agents SET system_prompt = ? WHERE id = ?')
      .run(prompt.trim(), agentId);
  }

  conversation(roomId: string): SqliteRoomConversation {
    const id: RoomId = { tenantId: TENANT, conversationId: roomId };
    return new SqliteRoomConversation(this.db, id, this.agents.ids());
  }

  private migrate(): void {
    runMigrations(this.db);
    this.agents = new AgentRegistry(() => this.loadAgents());
  }

  loadAgents(): AgentDefinition[] {
    const rows = this.db.prepare(`
      SELECT id, label, role, command, color, position, system_prompt
      FROM agents ORDER BY position ASC
    `).all() as unknown as AgentRow[];
    return rows.map(row => ({
      id: row.id,
      label: row.label,
      role: row.role,
      command: row.command,
      color: Number(row.color),
      position: Number(row.position),
      systemPrompt: row.system_prompt ?? '',
    }));
  }

  private meta(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as unknown as { value: string } | undefined;
    return row?.value;
  }

  private setMeta(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO app_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  private importLegacyFiles(): void {
    if (this.meta('legacy_imported') === '1') return;
    const catalogFile = join(this.root, 'catalog.json');
    if (this.root === ':memory:' || !existsSync(catalogFile)) {
      this.setMeta('legacy_imported', '1');
      return;
    }
    const existing = this.db.prepare('SELECT COUNT(*) AS n FROM rooms').get() as unknown as { n: number };
    if (Number(existing.n) > 0) {
      this.setMeta('legacy_imported', '1');
      return;
    }
    const catalog = JSON.parse(readFileSync(catalogFile, 'utf8')) as {
      rooms?: RoomRecord[];
      lastOpenedId?: string;
    };
    this.saveCatalog(new RoomCatalog(catalog.rooms ?? [], catalog.lastOpenedId, this.agents));
    for (const room of catalog.rooms ?? []) {
      const directory = join(this.root, 'rooms', room.id);
      const conversation = this.conversation(room.id);
      conversation.importLegacy(directory);
      const workspaceFile = join(directory, 'workspace.json');
      if (existsSync(workspaceFile)) {
        const snapshot = JSON.parse(readFileSync(workspaceFile, 'utf8')) as RoomLabWorkspaceSnapshot;
        this.saveWorkspace(room.id, snapshot, room.updatedAt);
      }
    }
    this.setMeta('legacy_imported', '1');
  }
}

/**
 * Per-connection settings, not schema: they are lost with the connection, so
 * they are applied every time one is opened rather than recorded as a version.
 */
function configureConnection(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
}

interface RoomRow {
  id: string;
  title: string;
  goal: string | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string;
}

interface MemberRow {
  room_id: string;
  agent_id: string;
  seat_order: number;
}

interface AgentRow {
  id: string;
  label: string;
  role: string;
  command: string;
  color: number;
  position: number;
  system_prompt: string;
}
