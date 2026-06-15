import type { ProviderSpec } from "@rivus/agent-finder-core";
import { renderKeyValues, style, type KeyValue } from "./render.js";

export function formatProviderLines(provider: ProviderSpec): string[] {
  const rows: KeyValue[] = [
    { label: "ID", value: provider.id },
    { label: "Name", value: provider.displayName },
    { label: "Kind", value: provider.kind },
    { label: "Adapter", value: provider.adapterMode },
    { label: "Commands", value: provider.commandCandidates.join(", ") || "-" },
    { label: "App paths", value: provider.appPathCandidates.join(", ") || "-" },
    { label: "Config paths", value: provider.configPathCandidates.join(", ") || "-" },
    { label: "MCP config paths", value: provider.mcpConfigPathCandidates.join(", ") || "-" },
    { label: "Version probe", value: provider.versionProbe ?? "-" }
  ];

  const lines = [style.bold(provider.displayName), ...renderKeyValues(rows)];

  if (provider.warnings.length > 0) {
    lines.push(style.yellow(`Warnings: ${provider.warnings.join("; ")}`));
  }

  return lines;
}
