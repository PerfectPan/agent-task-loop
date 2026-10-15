import { defineCommand } from 'citty';
import { listLocalSessions, matchesFilter, parseAgentFilter } from '../sessions/list.js';
import { byLastActiveDesc, renderSessionTable } from '../sessions/view.js';

export const sessionsListCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List local agent sessions across tools',
  },
  args: {
    agent: { type: 'string', description: 'Filter by agent (codex, claude/claude-code, grok)' },
    filter: { type: 'string', description: 'Substring match on session id / path / prompt' },
    json: { type: 'boolean', default: false, description: 'Print stable JSON' },
  },
  async run({ args }) {
    const agent = typeof args.agent === 'string' ? parseAgentFilter(args.agent) : undefined;
    if (args.agent !== undefined && agent === null) {
      console.error(`Unknown agent: ${String(args.agent)}`);
      process.exitCode = 1;
      return;
    }

    const sessions = await listLocalSessions(agent ? [agent] : undefined);
    const filtered =
      typeof args.filter === 'string' ? sessions.filter((s) => matchesFilter(s, args.filter as string)) : sessions;
    filtered.sort(byLastActiveDesc);

    if (args.json) {
      console.log(JSON.stringify({ schema_version: '0.1', sessions: filtered }, null, 2));
      return;
    }

    for (const line of renderSessionTable(filtered, Date.now())) {
      console.log(line);
    }
  },
});
