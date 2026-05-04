import { command_candidates_json } from "./moonbit/agent_discovery_core.js";

export function listCommandCandidates(): string[] {
  return JSON.parse(command_candidates_json()) as string[];
}
