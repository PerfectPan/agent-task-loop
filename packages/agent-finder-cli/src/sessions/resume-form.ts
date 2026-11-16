/**
 * The copyable resume command for a session: the agent's builder applied to the
 * session id, or `null` for an unknown agent or a missing id.
 */
export function resumeCommandFrom<B extends (sessionId: string) => string>(
  resumeCommands: Readonly<Partial<Record<string, B>>>,
  agent: string | undefined,
  sessionId: string | undefined | null,
): string | null {
  return sessionId ? (agent !== undefined ? (resumeCommands[agent]?.(sessionId) ?? null) : null) : null;
}
