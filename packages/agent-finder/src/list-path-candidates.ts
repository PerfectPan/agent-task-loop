import { path_candidates_json } from "./moonbit/agent_discovery_core.js";

export function listPathCandidates(): string[] {
  return JSON.parse(path_candidates_json()) as string[];
}
