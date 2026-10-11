import { defineCommand } from 'citty';
import { render } from 'ink';
import { loadTranscript } from '@rivus/agent-kit/transcript';
import { createNodePlatform } from '@rivus/agent-kit/node';
import { findSession, listLocalSessions, sessionIdOf } from '../sessions/list.js';
import { resumeCommandFor } from '../sessions/resume.js';
import { transcriptLines } from '../sessions/view.js';
import { SessionsBrowser } from '../tui/sessions-browser.js';

const ENTER_ALT_SCREEN = '[?1049h';
const LEAVE_ALT_SCREEN = '[?1049l';

export const sessionsBrowseCommand = defineCommand({
  meta: {
    name: 'browse',
    description: 'Interactively browse sessions and preview transcripts (requires a TTY)',
  },
  async run() {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error(
        '`sessions browse` requires an interactive terminal (TTY). Use `agent-finder sessions list` for non-interactive output.',
      );
      process.exitCode = 1;
      return;
    }

    const sessions = await listLocalSessions();
    // Newest first, so the browser opens on the most recent session.
    sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    const platform = createNodePlatform();

    // Take over the alternate screen buffer; restore scrollback on exit.
    process.stdout.write(ENTER_ALT_SCREEN);
    const restore = () => process.stdout.write(LEAVE_ALT_SCREEN);
    process.once('exit', restore);

    const instance = render(
      <SessionsBrowser
        sessions={sessions}
        loadTranscript={async (id) => {
          const session = findSession(sessions, id);
          if (!session) {
            return [];
          }
          const loaded = await loadTranscript(platform, session.ref);
          return loaded.ok ? transcriptLines(loaded.value.events) : [];
        }}
        loadResume={async (id) => {
          const session = findSession(sessions, id);
          return resumeCommandFor(session?.ref.agent, session ? sessionIdOf(session) : id);
        }}
        nowMs={Date.now()}
      />,
    );

    try {
      await instance.waitUntilExit();
    } finally {
      restore();
    }
  },
});
