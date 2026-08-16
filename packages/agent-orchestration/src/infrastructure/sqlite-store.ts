import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  MemberRow,
  RunPatch,
  RunRow,
  Store,
  StoredTemplate,
  TokenRow,
} from '../contracts/store';
import type { ChannelEntry, ChannelKind } from '../contracts/types';
import { SCHEMA_SQL } from './schema';

interface SqlRow {
  [column: string]: null | number | bigint | string | Uint8Array;
}

export class SqliteStore implements Store {
  private readonly db: DatabaseSync;
  private depth = 0;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath, {
      timeout: 5000,
      enableForeignKeyConstraints: true,
    });
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
  }

  migrate(): void {
    this.db.exec(SCHEMA_SQL);
    const meta = this.db.prepare('SELECT version FROM schema_meta WHERE id = 1').get() as
      | { version: number }
      | undefined;
    if (!meta) {
      throw new Error('schema_meta is missing after migrate');
    }
    if (meta.version !== 1) {
      throw new Error(`unsupported orchestration schema version ${meta.version}`);
    }
  }

  close(): void {
    this.db.close();
  }

  withTransaction<T>(fn: (tx: Store) => T): T {
    if (this.depth > 0) {
      return fn(this);
    }
    this.db.exec('BEGIN IMMEDIATE');
    this.depth += 1;
    try {
      const result = fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.depth -= 1;
    }
  }

  upsertTemplate(spec: StoredTemplate, now: string): void {
    this.db
      .prepare(
        `INSERT INTO templates (id, start_seat, max_tokens, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           start_seat = excluded.start_seat,
           max_tokens = excluded.max_tokens,
           updated_at = excluded.updated_at`,
      )
      .run(spec.id, spec.startSeat, spec.maxTokens, now, now);
    this.db.prepare('DELETE FROM template_seats WHERE template_id = ?').run(spec.id);
    this.db.prepare('DELETE FROM template_mail WHERE template_id = ?').run(spec.id);
    const insertSeat = this.db.prepare(
      'INSERT INTO template_seats (template_id, seat, ordinal) VALUES (?, ?, ?)',
    );
    spec.seats.forEach((seat, ordinal) => {
      insertSeat.run(spec.id, seat, ordinal);
    });
    const insertMail = this.db.prepare(
      'INSERT INTO template_mail (template_id, kind, from_seat, to_seat) VALUES (?, ?, ?, ?)',
    );
    for (const route of spec.mail) {
      insertMail.run(spec.id, route.kind, route.from, route.to);
    }
  }

  getTemplate(id: string): StoredTemplate | undefined {
    const row = this.db
      .prepare('SELECT id, start_seat AS startSeat, max_tokens AS maxTokens FROM templates WHERE id = ?')
      .get(id) as { id: string; startSeat: string | null; maxTokens: number } | undefined;
    if (!row) {
      return undefined;
    }
    return this.hydrateTemplate(row);
  }

  listTemplates(): StoredTemplate[] {
    const rows = this.db
      .prepare('SELECT id, start_seat AS startSeat, max_tokens AS maxTokens FROM templates ORDER BY id')
      .all() as Array<{ id: string; startSeat: string | null; maxTokens: number }>;
    return rows.map(row => this.hydrateTemplate(row));
  }

  getRun(key: string): RunRow | undefined {
    const row = this.db
      .prepare(
        `SELECT key, template_id AS templateId, term, max_tokens AS maxTokens, status,
                supervisor_pid AS supervisorPid, last_heartbeat_at AS lastHeartbeatAt,
                last_index AS lastIndex, goal, ref_json AS refJson,
                created_at AS createdAt, updated_at AS updatedAt
         FROM runs WHERE key = ?`,
      )
      .get(key) as SqlRow | undefined;
    return row ? mapRun(row) : undefined;
  }

  insertRun(row: RunRow): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO runs (
           key, template_id, term, max_tokens, status, supervisor_pid, last_heartbeat_at,
           last_index, goal, ref_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.key,
        row.templateId,
        row.term,
        row.maxTokens,
        row.status,
        row.supervisorPid,
        row.lastHeartbeatAt,
        row.lastIndex,
        row.goal,
        row.refJson,
        row.createdAt,
        row.updatedAt,
      );
    return result.changes === 1;
  }

  upsertRun(row: RunRow): void {
    this.db
      .prepare(
        `INSERT INTO runs (
           key, template_id, term, max_tokens, status, supervisor_pid, last_heartbeat_at,
           last_index, goal, ref_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           template_id = excluded.template_id,
           term = excluded.term,
           max_tokens = excluded.max_tokens,
           status = excluded.status,
           supervisor_pid = excluded.supervisor_pid,
           last_heartbeat_at = excluded.last_heartbeat_at,
           last_index = excluded.last_index,
           goal = excluded.goal,
           ref_json = excluded.ref_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        row.key,
        row.templateId,
        row.term,
        row.maxTokens,
        row.status,
        row.supervisorPid,
        row.lastHeartbeatAt,
        row.lastIndex,
        row.goal,
        row.refJson,
        row.createdAt,
        row.updatedAt,
      );
  }

  casRun(key: string, expectedTerm: number, patch: RunPatch): boolean {
    const current = this.getRun(key);
    if (!current || current.term !== expectedTerm) {
      return false;
    }
    const next: RunRow = {
      ...current,
      term: patch.term ?? current.term,
      status: patch.status ?? current.status,
      supervisorPid: patch.supervisorPid !== undefined ? patch.supervisorPid : current.supervisorPid,
      lastHeartbeatAt:
        patch.lastHeartbeatAt !== undefined ? patch.lastHeartbeatAt : current.lastHeartbeatAt,
      goal: patch.goal !== undefined ? patch.goal : current.goal,
      refJson: patch.refJson !== undefined ? patch.refJson : current.refJson,
      updatedAt: patch.updatedAt,
    };
    const result = this.db
      .prepare(
        `UPDATE runs
         SET term = ?, status = ?, supervisor_pid = ?, last_heartbeat_at = ?,
             goal = ?, ref_json = ?, updated_at = ?
         WHERE key = ? AND term = ?`,
      )
      .run(
        next.term,
        next.status,
        next.supervisorPid,
        next.lastHeartbeatAt,
        next.goal,
        next.refJson,
        next.updatedAt,
        key,
        expectedTerm,
      );
    return result.changes === 1;
  }

  touchHeartbeat(key: string, at: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE runs SET last_heartbeat_at = ?, updated_at = ? WHERE key = ? AND status = 'open'`,
      )
      .run(at, at, key);
    return result.changes === 1;
  }

  listMembers(key: string): MemberRow[] {
    const rows = this.db
      .prepare(
        `SELECT seat, status, cmd, args_json AS argsJson, joined_at AS joinedAt, left_at AS leftAt
         FROM members WHERE run_key = ? ORDER BY joined_at, seat`,
      )
      .all(key) as SqlRow[];
    return rows.map(mapMember);
  }

  getMember(key: string, seat: string): MemberRow | undefined {
    const row = this.db
      .prepare(
        `SELECT seat, status, cmd, args_json AS argsJson, joined_at AS joinedAt, left_at AS leftAt
         FROM members WHERE run_key = ? AND seat = ?`,
      )
      .get(key, seat) as SqlRow | undefined;
    return row ? mapMember(row) : undefined;
  }

  upsertMember(key: string, member: MemberRow): void {
    this.db
      .prepare(
        `INSERT INTO members (run_key, seat, status, cmd, args_json, joined_at, left_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_key, seat) DO UPDATE SET
           status = excluded.status,
           cmd = excluded.cmd,
           args_json = excluded.args_json,
           joined_at = excluded.joined_at,
           left_at = excluded.left_at`,
      )
      .run(key, member.seat, member.status, member.cmd, member.argsJson, member.joinedAt, member.leftAt);
  }

  listTokens(key: string): TokenRow[] {
    const rows = this.db
      .prepare('SELECT seat, partition FROM tokens WHERE run_key = ? ORDER BY seat')
      .all(key) as Array<{ seat: string; partition: string }>;
    return rows.map(row => ({ seat: row.seat, partition: row.partition }));
  }

  insertToken(key: string, seat: string, partition: string): void {
    this.db.prepare('INSERT INTO tokens (run_key, seat, partition) VALUES (?, ?, ?)').run(key, seat, partition);
  }

  deleteToken(key: string, seat: string): void {
    this.db.prepare('DELETE FROM tokens WHERE run_key = ? AND seat = ?').run(key, seat);
  }

  clearTokens(key: string): void {
    this.db.prepare('DELETE FROM tokens WHERE run_key = ?').run(key);
  }

  appendChannel(entry: Omit<ChannelEntry, 'idx'>): ChannelEntry {
    const run = this.getRun(entry.key);
    if (!run) {
      throw new Error(`cannot append channel for missing run ${entry.key}`);
    }
    const idx = run.lastIndex + 1;
    this.db
      .prepare(
        `INSERT INTO channel (run_key, idx, term, kind, mail_kind, from_seat, to_seat, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.key,
        idx,
        entry.term,
        entry.kind,
        entry.mailKind,
        entry.fromSeat,
        entry.toSeat,
        entry.body,
        entry.createdAt,
      );
    this.db.prepare('UPDATE runs SET last_index = ? WHERE key = ?').run(idx, entry.key);
    return { ...entry, idx };
  }

  listChannel(key: string, fromIndex: number, limit: number): ChannelEntry[] {
    const rows = this.db
      .prepare(
        `SELECT run_key AS key, idx, term, kind, mail_kind AS mailKind,
                from_seat AS fromSeat, to_seat AS toSeat, body, created_at AS createdAt
         FROM channel WHERE run_key = ? AND idx >= ? ORDER BY idx LIMIT ?`,
      )
      .all(key, fromIndex, limit) as SqlRow[];
    return rows.map(mapChannel);
  }

  listInbox(key: string, seat: string, afterIdx: number, limit: number): ChannelEntry[] {
    const rows = this.db
      .prepare(
        `SELECT run_key AS key, idx, term, kind, mail_kind AS mailKind,
                from_seat AS fromSeat, to_seat AS toSeat, body, created_at AS createdAt
         FROM channel
         WHERE run_key = ? AND kind = 'mail' AND idx > ? AND (to_seat = ? OR to_seat IS NULL)
         ORDER BY idx LIMIT ?`,
      )
      .all(key, afterIdx, seat, limit) as SqlRow[];
    return rows.map(mapChannel);
  }

  getCursor(key: string, seat: string): number {
    const row = this.db
      .prepare('SELECT last_read_idx AS lastReadIdx FROM inbox_cursors WHERE run_key = ? AND seat = ?')
      .get(key, seat) as { lastReadIdx: number } | undefined;
    return row?.lastReadIdx ?? 0;
  }

  setCursor(key: string, seat: string, idx: number): void {
    this.db
      .prepare(
        `INSERT INTO inbox_cursors (run_key, seat, last_read_idx)
         VALUES (?, ?, ?)
         ON CONFLICT(run_key, seat) DO UPDATE SET last_read_idx = excluded.last_read_idx`,
      )
      .run(key, seat, idx);
  }

  private hydrateTemplate(row: { id: string; startSeat: string | null; maxTokens: number }): StoredTemplate {
    const seats = this.db
      .prepare('SELECT seat FROM template_seats WHERE template_id = ? ORDER BY ordinal')
      .all(row.id) as Array<{ seat: string }>;
    const mailRows = this.db
      .prepare(
        'SELECT kind, from_seat AS fromSeat, to_seat AS toSeat FROM template_mail WHERE template_id = ? ORDER BY kind, from_seat, to_seat',
      )
      .all(row.id) as Array<{ kind: string; fromSeat: string; toSeat: string }>;
    return {
      id: row.id,
      startSeat: row.startSeat,
      maxTokens: Number(row.maxTokens),
      seats: seats.map(item => item.seat),
      mail: mailRows.map(item => ({ kind: item.kind, from: item.fromSeat, to: item.toSeat })),
    };
  }
}

function mapRun(row: SqlRow): RunRow {
  return {
    key: String(row.key),
    templateId: String(row.templateId),
    term: Number(row.term),
    maxTokens: Number(row.maxTokens),
    status: row.status === 'released' ? 'released' : 'open',
    supervisorPid: row.supervisorPid == null ? null : Number(row.supervisorPid),
    lastHeartbeatAt: row.lastHeartbeatAt == null ? null : String(row.lastHeartbeatAt),
    lastIndex: Number(row.lastIndex),
    goal: row.goal == null ? null : String(row.goal),
    refJson: row.refJson == null ? null : String(row.refJson),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapMember(row: SqlRow): MemberRow {
  return {
    seat: String(row.seat),
    status: row.status === 'left' ? 'left' : 'joined',
    cmd: row.cmd == null ? null : String(row.cmd),
    argsJson: row.argsJson == null ? null : String(row.argsJson),
    joinedAt: String(row.joinedAt),
    leftAt: row.leftAt == null ? null : String(row.leftAt),
  };
}

function mapChannel(row: SqlRow): ChannelEntry {
  return {
    key: String(row.key),
    idx: Number(row.idx),
    term: Number(row.term),
    kind: String(row.kind) as ChannelKind,
    mailKind: row.mailKind == null ? null : String(row.mailKind),
    fromSeat: row.fromSeat == null ? null : String(row.fromSeat),
    toSeat: row.toSeat == null ? null : String(row.toSeat),
    body: row.body == null ? '' : String(row.body),
    createdAt: String(row.createdAt),
  };
}
