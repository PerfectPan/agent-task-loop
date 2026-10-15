import type { TargetAgent } from '../types/task';

/**
 * The one application-side table of copyable resume commands. `@rivus/agent-kit`
 * deliberately leaves resume knowledge to hosts, so every resume string this
 * tool prints is built here: `agent-task-loop resume` is the only caller.
 *
 * Verified against `codex resume --help` (`codex resume <SESSION_ID>`) and
 * `claude --help` (`-r, --resume <session ID>`). Review rounds run on codex
 * (`review-loop-service`), so a review session id resumes with the codex form.
 */
const RESUME_COMMANDS: Partial<Record<TargetAgent, (sessionId: string) => string>> = {
  codex: (sessionId) => `codex resume ${sessionId}`,
  claude: (sessionId) => `claude --resume ${sessionId}`,
};

/**
 * The copyable resume command for one of this tool's sessions, or `null` when
 * the agent has no known resume form (coco, glm) or the session id is missing.
 */
export function resumeCommandFor(agent: TargetAgent | undefined, sessionId: string | undefined | null): string | null {
  if (!sessionId) {
    return null;
  }
  const build = agent === undefined ? undefined : RESUME_COMMANDS[agent];
  return build ? build(sessionId) : null;
}
