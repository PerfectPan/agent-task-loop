import { moonbitApi } from "./moonbit-api.js";

export function listCommandCandidates(): string[] {
  return moonbitApi.listCommandCandidates();
}
