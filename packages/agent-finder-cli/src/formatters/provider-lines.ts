import type { ProviderSpec } from "@rivus/agent-finder-core";

export function formatProviderLines(provider: ProviderSpec): string[] {
  const lines = [
    `ID: ${provider.id}`,
    `Name: ${provider.displayName}`,
    `Kind: ${provider.kind}`,
    `Adapter: ${provider.adapterMode}`,
    `Commands: ${provider.commandCandidates.join(", ") || "-"}`,
    `App paths: ${provider.appPathCandidates.join(", ") || "-"}`,
    `Config paths: ${provider.configPathCandidates.join(", ") || "-"}`,
    `MCP config paths: ${provider.mcpConfigPathCandidates.join(", ") || "-"}`,
    `Version probe: ${provider.versionProbe ?? "-"}`
  ];

  if (provider.warnings.length > 0) {
    lines.push(`Warnings: ${provider.warnings.join("; ")}`);
  }

  return lines;
}
