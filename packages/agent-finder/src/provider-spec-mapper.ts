import type { ProviderSpec } from "./types.js";

interface MoonBitProviderSpec {
  id: string;
  display_name: string;
  kind: string;
  adapter_mode: string;
  command_candidates: string[];
  app_path_candidates: string[];
  config_path_candidates: string[];
  mcp_config_path_candidates: string[];
  version_probe: string | null;
  warnings: string[];
}

export function mapProviderSpec(provider: MoonBitProviderSpec): ProviderSpec {
  return {
    id: provider.id,
    displayName: provider.display_name,
    kind: provider.kind,
    adapterMode: provider.adapter_mode,
    commandCandidates: [...provider.command_candidates],
    appPathCandidates: [...provider.app_path_candidates],
    configPathCandidates: [...provider.config_path_candidates],
    mcpConfigPathCandidates: [...provider.mcp_config_path_candidates],
    versionProbe: provider.version_probe,
    warnings: [...provider.warnings]
  };
}
