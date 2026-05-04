import { listProviders } from "./list-providers.js";
import type { ProviderSpec } from "./types.js";

export function inspectProvider(id: string): ProviderSpec | null {
  return listProviders().find((provider) => provider.id === id) ?? null;
}
