import type { Installation } from '@rivus/agent-kit/discovery';

export function summarizeAgents(agents: Installation[]) {
  const summary = {
    total: agents.length,
    runnable: 0,
    found: 0,
    missing: 0,
    unknown: 0,
    warnings: [] as string[],
  };

  for (const agent of agents) {
    summary[agent.status] += 1;
    for (const warning of agent.warnings) {
      summary.warnings.push(`${agent.agent}: ${warning}`);
    }
  }

  return summary;
}
