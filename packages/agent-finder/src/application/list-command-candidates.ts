import { moonbitApi } from "../infrastructure/moonbit-api.js";

export function listCommandCandidates(): string[] {
  return moonbitApi.listCommandCandidates();
}
