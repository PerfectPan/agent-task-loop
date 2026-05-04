import type { AgentRecord } from "@rivus/agent-finder-core";

export function summarizeAgents(agents: AgentRecord[]) {
  const summary = {
    total: agents.length,
    runnable: 0,
    found: 0,
    missing: 0,
    unknown: 0,
    warnings: [] as string[]
  };

  for (const agent of agents) {
    summary[agent.status] += 1;
    for (const warning of agent.warnings) {
      summary.warnings.push(`${agent.id}: ${warning}`);
    }
  }

  return summary;
}
