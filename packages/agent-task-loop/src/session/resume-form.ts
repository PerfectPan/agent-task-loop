/**
 * The copyable resume command for a session, from a per-agent builder table.
 * `null` when the agent has no known resume form or the session id is missing.
 */
export function resumeCommandFrom<B extends (sessionId: string) => string>(
  resumeCommands: Readonly<Partial<Record<string, B>>>,
  agent: string | undefined,
  sessionId: string | undefined | null,
): string | null {
  if (!sessionId) {
    return null;
  }
  const build = agent === undefined ? undefined : resumeCommands[agent];
  return build ? build(sessionId) : null;
}
