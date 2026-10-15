import { defineCommand } from 'citty';
import { findSession, listLocalSessions, sessionIdOf } from '../sessions/list.js';
import { resumeCommandFor } from '../sessions/resume.js';

export const sessionsResumeCommand = defineCommand({
  meta: {
    name: 'resume',
    description: 'Print the command to resume a session in its agent (does not execute it)',
  },
  args: {
    id: { type: 'positional', required: true, description: 'Session id' },
  },
  async run({ args }) {
    const id = String(args.id);
    const session = findSession(await listLocalSessions(), id);
    // The id the session's own records name resumes; the file stem is the fallback.
    const command = resumeCommandFor(session?.ref.agent, session ? sessionIdOf(session) : id);
    if (!command) {
      console.error(`No resume command available for session: ${id}`);
      process.exitCode = 1;
      return;
    }
    // Print only — the user copies/runs it. v1 never spawns the agent itself.
    console.log(command);
  },
});
