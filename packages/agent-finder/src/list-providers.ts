import { moonbitApi } from "./moonbit-api.js";
import type { ProviderSpec } from "./types.js";

export function listProviders(): ProviderSpec[] {
  return moonbitApi.listProviders();
}
