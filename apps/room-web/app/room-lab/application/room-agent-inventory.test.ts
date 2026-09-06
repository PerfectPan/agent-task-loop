import { describe, expect, it } from 'vitest';
import type { DiscoveryReport } from '@rivus/agent-finder-core';
import { listRoomAgentInventory } from './room-agent-inventory.server';

describe('room agent inventory', () => {
  it('maps finder status onto the seated roster and probes extra CLIs', () => {
    const report: DiscoveryReport = {
      schema_version: '0.1',
      generated_at: '2026-09-06T00:00:00.000Z',
      host: { os: 'darwin', arch: 'arm64' },
      agents: [
        record('claude-code', 'runnable', '/usr/local/bin/claude'),
        record('codex', 'found', null),
        record('opencode', 'missing', null),
      ],
    };
    const extra: Record<string, string | null> = {
      'claude-relay': '/usr/local/bin/claude-relay',
      dsh: null,
    };
    const inventory = listRoomAgentInventory(report, command => extra[command] ?? null);
    expect(inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'claude', availability: 'runnable', command: '/usr/local/bin/claude' }),
      expect.objectContaining({ id: 'codex', availability: 'found' }),
      expect.objectContaining({ id: 'opencode', availability: 'missing' }),
      expect.objectContaining({ id: 'claude-relay', availability: 'runnable', command: '/usr/local/bin/claude-relay' }),
      expect.objectContaining({ id: 'dsh', availability: 'missing' }),
    ]));
  });
});

function record(
  id: string,
  status: 'runnable' | 'found' | 'missing',
  command: string | null,
): DiscoveryReport['agents'][number] {
  return {
    id,
    name: id,
    type: 'cli',
    status,
    command,
    app_path: null,
    version: status === 'runnable' ? '1.0.0' : null,
    evidence: [],
    config_paths: [],
    mcp_config_paths: [],
    warnings: [],
  };
}
