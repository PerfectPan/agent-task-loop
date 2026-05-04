import {
  command_candidates_json,
  path_candidates_json,
  providers_json,
  scan_json
} from "./moonbit/agent_discovery_core.js";
import type { DiscoveryReport, HostProbe, ProviderSpec } from "./types.js";

interface MoonBitError {
  error: string;
}

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

export const moonbitApi = {
  listCommandCandidates(): string[] {
    return parseJson(command_candidates_json());
  },

  listPathCandidates(): string[] {
    return parseJson(path_candidates_json());
  },

  listProviders(): ProviderSpec[] {
    return parseJson<MoonBitProviderSpec[]>(providers_json()).map(mapProviderSpec);
  },

  discover(probe: HostProbe): DiscoveryReport {
    return parseMoonBitResult(scan_json(JSON.stringify(toMoonBitProbe(probe))));
  }
};

function parseMoonBitResult<T>(json: string): T {
  const value = parseJson<T | MoonBitError>(json);
  if (isMoonBitError(value)) {
    throw new Error(value.error);
  }
  return value;
}

function parseJson<T>(json: string): T {
  return JSON.parse(json) as T;
}

function isMoonBitError(value: unknown): value is MoonBitError {
  return typeof value === "object" && value !== null && "error" in value;
}

function toMoonBitProbe(probe: HostProbe) {
  return {
    os: probe.os,
    arch: probe.arch,
    home: probe.home,
    generated_at: probe.generatedAt,
    commands: probe.commands,
    executable_paths: probe.executablePaths,
    existing_paths: probe.existingPaths,
    versions: probe.versions
  };
}

function mapProviderSpec(provider: MoonBitProviderSpec): ProviderSpec {
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
