import { randomInt } from 'node:crypto';
import {
  AGENT_COLOR_COUNT,
  type AgentDefinition,
} from '../domain/agent-registry';

/**
 * Migration 2 turns the five members that used to be a constant table in the
 * source into rows. Two groups of rows are written, once, into an empty table:
 *
 *  - The four agents this project ships a headless command for.
 *  - Every agent id an existing library already refers to — a room member or a
 *    saved system prompt — that the first group does not cover. Those are
 *    whatever the person had seated before; the fallback command is the id run
 *    as a headless CLI, which is enough for an already-seated member to keep
 *    answering until the person edits the row.
 *
 * Colour is drawn at creation and persisted, so the identity hue is a fact
 * about the row rather than a function of seating order.
 */
export interface AgentSeed {
  id: string;
  label: string;
  role: string;
  command: string;
}

export const DEFAULT_AGENT_SEEDS: readonly AgentSeed[] = [
  {
    id: 'claude',
    label: 'Claude',
    role: '审核',
    command: 'claude -p --safe-mode --restricted --no-session-persistence --output-format text',
  },
  {
    id: 'codex',
    label: 'Codex',
    role: '实施',
    command: 'codex exec --ignore-user-config --ephemeral --sandbox read-only --skip-git-repo-check --ignore-rules --color never',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    role: '搭建',
    command: 'NO_COLOR=1 opencode run --pure --model opencode/ling-3.0-flash-fin-free',
  },
  {
    id: 'dsh',
    label: 'DSH',
    role: '分析',
    command: 'NO_COLOR=1 dsh --profile headless',
  },
];

/** What an id that only exists in an old library gets until it is edited. */
export function inheritedAgentSeed(id: string): AgentSeed {
  return {
    id,
    label: id,
    role: '成员',
    command: `${id} -p --no-session-persistence --output-format text`,
  };
}

export function randomAgentColor(): number {
  return randomInt(1, AGENT_COLOR_COUNT + 1);
}

/**
 * Builds the rows for an empty table: the shipped seeds first, then one row per
 * inherited id, in the order the library reports them.
 */
export function buildAgentSeedRows(
  inheritedIds: readonly string[],
  now: string,
  color: () => number = randomAgentColor,
): Array<AgentDefinition & { createdAt: string }> {
  const seeded = new Set(DEFAULT_AGENT_SEEDS.map(agent => agent.id));
  const inherited = [...new Set(inheritedIds)].filter(id => !seeded.has(id));
  return [...DEFAULT_AGENT_SEEDS, ...inherited.map(inheritedAgentSeed)].map((agent, index) => ({
    ...agent,
    color: color(),
    position: index,
    createdAt: now,
  }));
}
