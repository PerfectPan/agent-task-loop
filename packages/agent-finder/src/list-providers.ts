import { provider_specs_json } from "./moonbit/agent_discovery_core.js";
import { mapProviderSpec } from "./provider-spec-mapper.js";
import type { ProviderSpec } from "./types.js";

export function listProviders(): ProviderSpec[] {
  return (JSON.parse(provider_specs_json()) as unknown[]).map((provider) =>
    mapProviderSpec(provider as Parameters<typeof mapProviderSpec>[0])
  );
}
