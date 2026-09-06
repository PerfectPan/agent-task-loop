import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { RoomId } from '@rivus/agent-room';
import type { RoomLabWorkspaceSnapshot } from '../application/room-lab-service.server';
import { RoomCatalog, type RoomRecord } from '../domain/room-catalog';
import { isRoomLabAgentId, type RoomLabAgentId } from '../domain/agent-roster';
import { defaultRoomHome } from './file-room-catalog.server';
import { ROOM_SQLITE_SCHEMA } from './sqlite-schema.server';
import { SqliteRoomConversation } from './sqlite-room-conversation.server';

const TENANT = 'local';

export class SqliteRoomStore {
  private constructor(
    readonly db: DatabaseSync,
    private readonly root: string,
  ) {}

  static open(root = defaultRoomHome()): SqliteRoomStore {
    mkdirSync(root, { recursive: true });
    const db = new DatabaseSync(join(root, 'rooms.sqlite'));
    db.exec('PRAGMA journal_mode = WAL');
    const store = new SqliteRoomStore(db, root);
    store.migrate();
    store.importLegacyFiles();
    return store;
  }

  static memory(): SqliteRoomStore {
    const db = new DatabaseSync(':memory:');
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
      if (!isRoomLabAgentId(row.agent_id)) continue;
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
      memberIds: membersByRoom.get(row.id) ?? ['codex'],
      ...(row.goal ? { goal: row.goal } : {}),
    }));
    const lastOpenedId = this.meta('last_opened_id');
    return new RoomCatalog(records, lastOpenedId);
  }

  saveCatalog(catalog: RoomCatalog): void {
    const snapshot = catalog.snapshot();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const upsert = this.db.prepare(`
        INSERT INTO rooms (id, title, goal, created_at, updated_at, last_opened_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          goal = excluded.goal,
          updated_at = excluded.updated_at,
          last_opened_at = excluded.last_opened_at
      `);
      const deleteMembers = this.db.prepare('DELETE FROM room_members WHERE room_id = ?');
      const insertMember = this.db.prepare(`
        INSERT INTO room_members (room_id, agent_id, seat_order) VALUES (?, ?, ?)
      `);
      for (const room of snapshot.rooms) {
        upsert.run(room.id, room.title, room.goal ?? null, room.createdAt, room.updatedAt, room.lastOpenedAt);
        deleteMembers.run(room.id);
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

  conversation(roomId: string): SqliteRoomConversation {
    const id: RoomId = { tenantId: TENANT, conversationId: roomId };
    return new SqliteRoomConversation(this.db, id);
  }

  private migrate(): void {
    this.db.exec(ROOM_SQLITE_SCHEMA);
    const applied = this.db.prepare('SELECT version FROM schema_migrations WHERE version = 1').get();
    if (!applied) {
      this.db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(new Date().toISOString());
    }
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
    this.saveCatalog(new RoomCatalog(catalog.rooms ?? [], catalog.lastOpenedId));
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
