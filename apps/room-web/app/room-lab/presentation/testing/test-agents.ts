import { AgentRegistry, type AgentDefinition } from '../../domain/agent-registry';

/**
 * A registry for tests: five members, one per identity colour, in a fixed
 * order. These are rows a test writes, not a roster the product ships — the
 * product's own rows are whatever `agents` holds on the person's machine.
 */
export const TEST_AGENTS: readonly AgentDefinition[] = [
  { id: 'relay', label: 'Relay', role: '转述', command: 'relay --headless', color: 1, position: 0 },
  { id: 'claude', label: 'Claude', role: '审核', command: 'claude -p', color: 2, position: 1 },
  { id: 'codex', label: 'Codex', role: '实施', command: 'codex exec', color: 3, position: 2 },
  { id: 'opencode', label: 'OpenCode', role: '搭建', command: 'opencode run', color: 4, position: 3 },
  { id: 'dsh', label: 'DSH', role: '分析', command: 'dsh --profile headless', color: 5, position: 4 },
];

export const TEST_AGENT_IDS = TEST_AGENTS.map(agent => agent.id);

export function testRegistry(agents: readonly AgentDefinition[] = TEST_AGENTS): AgentRegistry {
  return AgentRegistry.of(agents);
}
