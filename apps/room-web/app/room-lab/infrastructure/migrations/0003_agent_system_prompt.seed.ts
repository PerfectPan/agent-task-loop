import type { DatabaseSync } from 'node:sqlite';

/**
 * What a member is told about how to behave, once the room's own prompt stopped
 * carrying it. Seeded identically for every row, because it is a starting
 * point, not a description of anyone in particular: from here it is data the
 * person edits per member on the agents page.
 *
 * It says only what the room cannot say for someone: read first, answer in
 * Chinese, be concrete and short, speak from your own angle.
 */
export const DEFAULT_AGENT_SYSTEM_PROMPT =
  '你在一个多人房间里发言。回答前先读完所有公开消息，然后用中文给出具体、简洁的回答，只讲你自己视角下的判断。';

/**
 * The data half of migration 3, in the order the move has to happen:
 *
 *  1. Whatever `agent_system_prompts` held moves onto the matching row. A
 *     library where that table is empty — which is the common case — simply
 *     moves nothing.
 *  2. Every row still without a prompt gets the default.
 *  3. The old table is dropped: its contents are now on the rows.
 *
 * A blank or whitespace-only stored prompt is treated as no prompt, which is
 * what the old `saveSystemPrompt` meant by deleting the row.
 */
export function adoptSystemPrompts(
  db: DatabaseSync,
  fallback: string = DEFAULT_AGENT_SYSTEM_PROMPT,
): void {
  if (hasTable(db, 'agent_system_prompts')) {
    db.exec(`
      UPDATE agents SET system_prompt = (
        SELECT prompt FROM agent_system_prompts WHERE agent_id = agents.id
      )
      WHERE EXISTS (
        SELECT 1 FROM agent_system_prompts
        WHERE agent_id = agents.id AND trim(prompt) <> ''
      );
    `);
    db.exec('DROP TABLE agent_system_prompts');
  }
  db.prepare(`UPDATE agents SET system_prompt = ? WHERE trim(system_prompt) = ''`).run(fallback);
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name);
  return row !== undefined;
}
