import type { DatabaseSync } from 'node:sqlite';
import { buildAgentSeedRows } from '../agent-seed.server';

/**
 * The data half of migration 2: it fills the table only while it is empty, so a
 * re-run cannot overwrite rows the person has since edited. Which rows get
 * written is `agent-seed.server.ts`.
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
