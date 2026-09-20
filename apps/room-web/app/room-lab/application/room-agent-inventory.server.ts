import { spawnSync } from 'node:child_process';
import type { AgentDefinition } from '../domain/agent-registry';
import type { RoomAgentAvailability, RoomAgentInventoryItem } from '../read-model';

/**
 * One probe for every member, because every member is the same kind of thing: a
 * shell command. The first word of the command that is not a `KEY=value` prefix
 * is looked up with `whence -w` inside an interactive login zsh — the same
 * shell the runner will use — so an alias or a shell function counts as
 * installed exactly when it will actually run.
 *
 * All the words go to one shell. `whence -w` answers one line per word, which
 * is the shape this file already reads, and starting an interactive login zsh
 * costs ~0.3s on its own — once, not once per member.
 *
 * What is shown is the row's own command text. An alias body is never expanded:
 * the person's alias may carry a token, and the desk is a page, not a vault.
 */
const RUNNABLE_KINDS = new Set(['command', 'alias', 'function', 'builtin']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

export type WhenceProbe = (words: readonly string[]) => string;

export function listRoomAgentInventory(
  agents: readonly AgentDefinition[],
  probe: WhenceProbe = probeWithWhence,
): RoomAgentInventoryItem[] {
  const words = agents.map(agent => commandWord(agent.command));
  const asked = [...new Set(words.filter((word): word is string => word !== undefined))];
  const answer = asked.length > 0 ? probe(asked) : '';
  return agents.map((agent, index) => {
    const word = words[index];
    return {
      id: agent.id,
      label: agent.label,
      role: agent.role,
      color: agent.color,
      availability: word ? readWhence(answer, word) : 'missing',
      command: agent.command,
    };
  });
}

export function runnableInventory(agents: readonly AgentDefinition[]): RoomAgentInventoryItem[] {
  return agents.map(agent => ({
    id: agent.id,
    label: agent.label,
    role: agent.role,
    color: agent.color,
    availability: 'runnable' as const,
    command: agent.command,
  }));
}

/** The executable in a command line, past any `KEY=value` prefixes. */
export function commandWord(command: string): string | undefined {
  return command.trim().split(/\s+/).find(word => word && !ASSIGNMENT.test(word));
}

/**
 * `whence -w <word>` answers `<word>: <kind>`, where kind is one of command,
 * alias, function, builtin, hashed, reserved or none.
 */
export function readWhence(output: string, word: string): RoomAgentAvailability {
  for (const line of output.split('\n')) {
    const [name, kind] = line.split(':');
    if (name?.trim() !== word) continue;
    if (RUNNABLE_KINDS.has(kind?.trim() ?? '')) return 'runnable';
  }
  return 'missing';
}

function probeWithWhence(words: readonly string[]): string {
  const result = spawnSync('zsh', ['-lic', 'whence -w -- "$@"', 'rivus-room', ...words], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  return result.stdout ?? '';
}
