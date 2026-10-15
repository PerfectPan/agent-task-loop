import { defineCommand } from 'citty';
import { loadTranscript } from '@rivus/agent-kit/transcript';
import { createNodePlatform } from '@rivus/agent-kit/node';
import { findSession, listLocalSessions } from '../sessions/list.js';
import { resumeCommandFor } from '../sessions/resume.js';
import { renderInspect } from '../sessions/view.js';

export const sessionsInspectCommand = defineCommand({
  meta: {
    name: 'inspect',
    description: "Show a session's metadata and transcript",
  },
  args: {
    id: { type: 'positional', required: true, description: 'Session id' },
    json: { type: 'boolean', default: false, description: 'Print stable JSON' },
  },
  async run({ args }) {
    const id = String(args.id);
    const session = findSession(await listLocalSessions(), id);
    if (!session) {
      console.error(`Unknown session: ${id}`);
      process.exitCode = 1;
      return;
    }

    const platform = createNodePlatform();
    const loaded = await loadTranscript(platform, session.ref);
    const events = loaded.ok ? loaded.value.events : [];
    const resumeCommand = resumeCommandFor(session.ref.agent, session.ref.sessionId);
    if (args.json) {
      console.log(JSON.stringify({ schema_version: '0.1', session, transcript: events, resumeCommand }, null, 2));
      return;
    }

    for (const line of renderInspect(session, events, Date.now(), resumeCommand)) {
      console.log(line);
    }
  },
});
