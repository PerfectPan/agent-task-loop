import type { DatabaseSync } from 'node:sqlite';
import type { Agent, AgentRegistry } from '../application/ports';
import { INHERITED_AGENT_ROLE, randomAgentColor } from './agent-seed.server';
import { nowIso } from './room-home.server';

interface AgentRow {
  id: string;
  label: string;
  role: string;
  command: string;
  color: number;
  position: number;
  system_prompt: string;
  timeout_ms: number | null;
}

function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    label: row.label,
    command: row.command,
    systemPrompt: row.system_prompt,
    ...(row.timeout_ms === null ? {} : { timeoutMs: Number(row.timeout_ms) }),
  };
}

/**
 * The `agents` table implementing the endpoint's `AgentRegistry` port
 * (application/ports.ts): the one roster, read and written through the port.
 * The endpoint's own columns — `role`, `color`, `position` — ride along in the
 * same row and stay invisible to the port: `save` updates only what the port
 * sees and leaves them standing, and a row created through the port starts on
 * the generic role and the next seat at the end of the desk.
 *
 * The port carries the one command line the ACP profile starts, so `save`
 * persists `command` alone and a read hands it back as it was written.
 */
export class SqliteAgentRegistry implements AgentRegistry {
  constructor(private readonly db: DatabaseSync) {}

  async list(): Promise<Agent[]> {
    const rows = this.db
      .prepare(`
      SELECT id, label, role, command, color, position, system_prompt, timeout_ms
      FROM agents ORDER BY position ASC, id ASC
    `)
      .all() as unknown as AgentRow[];
    return rows.map(toAgent);
  }

  async get(id: string): Promise<Agent | undefined> {
    const row = this.db
      .prepare(`
      SELECT id, label, role, command, color, position, system_prompt, timeout_ms
      FROM agents WHERE id = ?
    `)
      .get(id) as unknown as AgentRow | undefined;
    return row ? toAgent(row) : undefined;
  }

  async save(agent: Agent): Promise<void> {
    const timeoutMs = agent.timeoutMs === undefined ? null : agent.timeoutMs;
    if (this.readRow(agent.id)) {
      // The endpoint's columns keep their values: the port cannot see them, so
      // a save through the port cannot change them.
      this.db
        .prepare(`
        UPDATE agents
        SET label = ?, command = ?, system_prompt = ?, timeout_ms = ?
        WHERE id = ?
      `)
        .run(agent.label, agent.command, agent.systemPrompt, timeoutMs, agent.id);
      return;
    }
    const last = this.db.prepare('SELECT MAX(position) AS position FROM agents').get() as unknown as {
      position: number | null;
    };
    this.db
      .prepare(`
      INSERT INTO agents (
        id, label, role, command, color, position, created_at, system_prompt, timeout_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        agent.id,
        agent.label,
        // The role an inherited row starts on, until the desk assigns a real one.
        INHERITED_AGENT_ROLE,
        agent.command,
        // The hue is drawn when the row is created, as the seed rows' are.
        randomAgentColor(),
        (last.position === null ? -1 : Number(last.position)) + 1,
        nowIso(),
        agent.systemPrompt,
        timeoutMs,
      );
  }

  async remove(id: string): Promise<void> {
    // `room_members` has no foreign key to `agents`, so a seated member keeps
    // its seat; the catalog filters an id without a row until the row is back.
    this.db.prepare('DELETE FROM agents WHERE id = ?').run(id);
  }

  private readRow(id: string): AgentRow | undefined {
    return this.db.prepare('SELECT id FROM agents WHERE id = ?').get(id) as unknown as AgentRow | undefined;
  }
}
