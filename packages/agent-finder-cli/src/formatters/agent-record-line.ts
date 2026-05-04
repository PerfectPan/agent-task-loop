import type { AgentRecord } from "@rivus/agent-finder-core";

export function formatAgentRecordLine(agent: AgentRecord): string {
  return `${agent.status}\t${agent.type}\t${agent.name}\t${agent.command ?? agent.app_path ?? "-"}`;
}
