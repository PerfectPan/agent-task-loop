import type { DatabaseSync } from 'node:sqlite';
import { buildAgentSeedRows } from '../agent-seed.server';

/**
 * The data half of migration 2. `0002_agents.sql` makes the table; this fills
 * it once, and only while it is empty, so re-running the migration on a library
 * whose rows have since been edited cannot overwrite them.
 *
 * Ids that only an older library refers to — a room member or a saved system
 * prompt from before members were rows — get a row too, so an existing Room
 * keeps the crew it was saved with. The row data itself comes from
 * `agent-seed.server.ts`, which is where the shipped agents are written down.
 */
export function seedAgents(db: DatabaseSync, now = new Date().toISOString()): void {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM agents').get() as unknown as { n: number };
  if (Number(existing.n) > 0) return;
  const inherited = db.prepare(`
    SELECT agent_id FROM room_members
    UNION
    SELECT agent_id FROM agent_system_prompts
    ORDER BY agent_id ASC
  `).all() as unknown as Array<{ agent_id: string }>;
  const rows = buildAgentSeedRows(inherited.map(row => row.agent_id), now);
  const insert = db.prepare(`
    INSERT INTO agents (id, label, role, command, color, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    insert.run(row.id, row.label, row.role, row.command, row.color, row.position, row.createdAt);
  }
}
