import type { CodingAgentId } from '@rivus/agent-kit/catalog';
import { builtinProviders } from '@rivus/agent-kit/providers';
import { isSessionHead, listSessions, type SessionHead } from '@rivus/agent-kit/sessions';
import { createNodePlatform } from '@rivus/agent-kit/node';

function basenameStem(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return base.replace(/\.jsonl$/, '');
}

/** The session's display id: the id its records name, else the file name. */
export function sessionIdOf(head: SessionHead): string {
  if (head.ref.sessionId !== undefined) {
    return head.ref.sessionId;
  }
  return basenameStem(head.ref.path);
}

/**
 * Every local session across the kit's built-in session agents, newest last
 * (the adapters list roots in their own order; callers sort for display).
 * Listing failures — a missing root, an unreadable file — are dropped here; the
 * CLI surfaces sessions, not per-root errors.
 */
export async function listLocalSessions(agents?: readonly CodingAgentId[]): Promise<SessionHead[]> {
  const heads: SessionHead[] = [];
  for await (const item of listSessions(createNodePlatform(), agents === undefined ? {} : { agents })) {
    if (isSessionHead(item)) {
      heads.push(item);
    }
  }
  return heads;
}

/** Case-insensitive substring match on id / title / cwd / path / first prompt. */
export function matchesFilter(head: SessionHead, filter: string): boolean {
  const needle = filter.toLowerCase();
  return [sessionIdOf(head), head.ref.path, head.cwd, head.title, head.firstPrompt]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(needle));
}

/** Accepts the kit's agent ids and their catalog aliases (`claude` → `claude-code`). */
export function parseAgentFilter(input: string): CodingAgentId | null {
  const agent = builtinProviders.find(
    ({ identity }) => identity && (identity.id === input || identity.aliases.includes(input)),
  )?.identity;
  return agent ? agent.id : null;
}

/** The session whose id matches, searching listed heads in order. */
export function findSession(heads: readonly SessionHead[], id: string): SessionHead | undefined {
  return heads.find((head) => sessionIdOf(head) === id);
}
