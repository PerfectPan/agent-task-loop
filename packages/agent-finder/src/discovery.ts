import { providerSpecs } from "./providers.js";
import type { AgentRecord, DiscoveryReport, Evidence, HostProbe, ProviderSpec } from "./types.js";
import { expandPath } from "./paths.js";

export function discover(probe: HostProbe): DiscoveryReport {
  const agents = providerSpecs.map((provider) => scanProvider(provider, probe));
  return {
    schema_version: "0.1",
    generated_at: probe.generatedAt,
    host: { os: probe.os, arch: probe.arch },
    agents
  };
}

function scanProvider(provider: ProviderSpec, probe: HostProbe): AgentRecord {
  const evidence: Evidence[] = [];
  const command = firstCommand(provider.commandCandidates, probe.commands);
  const appPath = firstExistingPath(provider.appPathCandidates, probe);
  let version: string | null = null;

  if (command) {
    evidence.push({
      kind: "command",
      value: command,
      exists: true,
      reason: "command resolved on PATH"
    });

    if (provider.versionProbe && probe.executablePaths[command]) {
      const versionKey = `${command} ${provider.versionProbe}`;
      const versionText = probe.versions[versionKey];
      if (versionText) {
        version = versionText;
        evidence.push({
          kind: "version",
          value: versionKey,
          exists: true,
          reason: "version probe exited successfully"
        });
      }
    }
  }

  if (appPath) {
    evidence.push({
      kind: "app_path",
      value: appPath,
      exists: true,
      reason: "app path exists"
    });
  }

  const hasConfig = pushPathEvidence(
    evidence,
    "config",
    provider.configPathCandidates,
    probe,
    "config path exists"
  );
  const hasMcpConfig = pushPathEvidence(
    evidence,
    "mcp_config",
    provider.mcpConfigPathCandidates,
    probe,
    "MCP config path exists"
  );

  return {
    id: provider.id,
    name: provider.displayName,
    type: provider.kind,
    status: deriveStatus(provider, probe, command, appPath, version, hasConfig, hasMcpConfig),
    command,
    app_path: appPath,
    version,
    evidence,
    config_paths: [...provider.configPathCandidates],
    mcp_config_paths: [...provider.mcpConfigPathCandidates],
    warnings: [...provider.warnings]
  };
}

function deriveStatus(
  provider: ProviderSpec,
  probe: HostProbe,
  command: string | null,
  appPath: string | null,
  version: string | null,
  hasConfig: boolean,
  hasMcpConfig: boolean
): AgentRecord["status"] {
  if (provider.adapterMode === "versioned-cli") {
    if (command) {
      return probe.executablePaths[command] && version ? "runnable" : "found";
    }
    return appPath || hasConfig || hasMcpConfig ? "found" : "missing";
  }

  if (provider.adapterMode === "metadata") {
    if (command) {
      return probe.executablePaths[command] ? "runnable" : "found";
    }
    return appPath || hasConfig || hasMcpConfig ? "found" : "missing";
  }

  return command || appPath || hasConfig || hasMcpConfig ? "found" : "missing";
}

function firstCommand(candidates: string[], commands: Record<string, string>): string | null {
  for (const command of candidates) {
    const resolved = commands[command];
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function firstExistingPath(paths: string[], probe: HostProbe): string | null {
  for (const path of paths) {
    const expanded = expandPath(path, probe.home);
    if (probe.existingPaths[expanded]) {
      return expanded;
    }
  }
  return null;
}

function pushPathEvidence(
  evidence: Evidence[],
  kind: string,
  paths: string[],
  probe: HostProbe,
  reason: string
): boolean {
  let found = false;
  for (const path of paths) {
    const expanded = expandPath(path, probe.home);
    if (probe.existingPaths[expanded]) {
      found = true;
      evidence.push({ kind, value: expanded, exists: true, reason });
    }
  }
  return found;
}
