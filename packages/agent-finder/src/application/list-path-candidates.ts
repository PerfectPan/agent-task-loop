import { moonbitApi } from "../infrastructure/moonbit-api.js";

export function listPathCandidates(): string[] {
  return moonbitApi.listPathCandidates();
}
