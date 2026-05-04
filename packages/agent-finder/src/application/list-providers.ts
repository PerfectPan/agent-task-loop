import { moonbitApi } from "../infrastructure/moonbit-api.js";
import type { ProviderSpec } from "../contracts/types.js";

export function listProviders(): ProviderSpec[] {
  return moonbitApi.listProviders();
}
