import { moonbitApi } from "./moonbit-api.js";

export function listPathCandidates(): string[] {
  return moonbitApi.listPathCandidates();
}
