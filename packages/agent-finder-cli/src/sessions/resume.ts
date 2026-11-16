import type { CodingAgentId } from '@rivus/agent-kit/catalog';

import { resumeCommandFrom } from './resume-form';

/**
 * The one application-side table of copyable resume commands. `@rivus/agent-kit`
 * deliberately leaves resume knowledge to hosts, so every resume string this
 * CLI prints is built here: `sessions resume`, `sessions inspect` and the
 * interactive browser all read this table.
 *
 * Verified against `codex resume --help` (`codex resume <SESSION_ID>`) and
 * `claude --help` (`-r, --resume <session ID>`). Agents without a verified
 * resume form (grok today) resolve to `null`.
 */
const RESUME_COMMANDS: Partial<Record<CodingAgentId, (sessionId: string) => string>> = {
  codex: (sessionId) => `codex resume ${sessionId}`,
  'claude-code': (sessionId) => `claude --resume ${sessionId}`,
};

/** The copyable resume command for a session, or `null` when unsupported. */
export function resumeCommandFor(
  agent: CodingAgentId | undefined,
  sessionId: string | undefined | null,
): string | null {
  return resumeCommandFrom(RESUME_COMMANDS, agent, sessionId);
}
