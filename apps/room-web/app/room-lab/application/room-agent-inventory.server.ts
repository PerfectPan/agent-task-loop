import { existsSync } from 'node:fs';
import { delimiter } from 'node:path';
import {
  collectHostProbe,
  discover,
  resolveCommand,
  type DiscoveryReport,
} from '@rivus/agent-finder-core';
import {
  ROOM_AGENT_ROSTER,
  type RoomLabAgentId,
} from '../domain/agent-roster';
import type { RoomAgentAvailability, RoomAgentInventoryItem } from '../read-model';

const ROOM_TO_FINDER: Partial<Record<RoomLabAgentId, string>> = {
  claude: 'claude-code',
  codex: 'codex',
  opencode: 'opencode',
};

const ROOM_COMMAND: Record<RoomLabAgentId, string> = {
  'claude-relay': 'claude-relay',
  claude: 'claude',
  codex: 'codex',
  opencode: 'opencode',
  dsh: 'dsh',
};

export function listRoomAgentInventory(
  report: DiscoveryReport = discover(collectHostProbe({ readVersion: () => null })),
  resolveExtra: (command: string) => string | null = resolveOnPath,
): RoomAgentInventoryItem[] {
  const byFinderId = new Map(report.agents.map(agent => [agent.id, agent]));
  return ROOM_AGENT_ROSTER.map(agent => {
    const finderId = ROOM_TO_FINDER[agent.id];
    const found = finderId ? byFinderId.get(finderId) : undefined;
    const extraPath = found ? null : resolveExtra(ROOM_COMMAND[agent.id]);
    const availability = availabilityOf(found, extraPath);
    return {
      id: agent.id,
      label: agent.label,
      role: agent.role,
      availability,
      ...(found?.command || extraPath ? { command: found?.command ?? extraPath ?? undefined } : {}),
      ...(found?.version ? { version: found.version } : {}),
    };
  });
}

export function runnableInventory(): RoomAgentInventoryItem[] {
  return ROOM_AGENT_ROSTER.map(agent => ({
    id: agent.id,
    label: agent.label,
    role: agent.role,
    availability: 'runnable' as const,
  }));
}

function availabilityOf(
  found: DiscoveryReport['agents'][number] | undefined,
  extraPath: string | null,
): RoomAgentAvailability {
  if (found?.status === 'runnable' || extraPath || found?.command) return 'runnable';
  if (found?.status === 'found') return 'found';
  return 'missing';
}

function resolveOnPath(command: string): string | null {
  return resolveCommand(command, {
    path: process.env.PATH ?? '',
    pathExt: process.env.PATHEXT,
    delimiter,
    fileExists: existsSync,
  });
}
