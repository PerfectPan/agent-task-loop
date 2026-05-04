import type { ProviderSpec } from "./types.js";

export const providerSpecs: ProviderSpec[] = [
  cli("opencode", "OpenCode", ["opencode"], ["~/.config/opencode"], [], ["~/.config/opencode/opencode.json"], ["Provider metadata is conservative until exact OpenCode install variants are verified."]),
  app("openhands", "OpenHands", ["openhands"], ["~/.openhands"], [], [], ["OpenHands may be local, containerized, or remote; discovery is conservative."]),
  cli("claude-code", "Claude Code", ["claude"], ["~/.claude", "~/.claude.json"], [], ["~/.claude.json", "~/.claude/settings.json"], []),
  extension("cline", "Cline", [], ["~/.vscode/extensions"], [], [], ["Cline extension presence is not validated without reading extension metadata."]),
  cli("codebuddy", "CodeBuddy", ["codebuddy"], ["~/.codebuddy"], [], [], ["CodeBuddy command and config paths may vary by distribution."]),
  cli("codex", "Codex", ["codex"], ["~/.codex"], [], ["~/.codex/config.toml"], []),
  cli("command-code", "Command Code", ["command-code"], ["~/.command-code"], [], [], ["Command Code provider metadata needs validation."]),
  cli("kiro-cli", "Kiro CLI", ["kiro"], ["~/.kiro"], [], [], ["Kiro CLI provider metadata needs validation."]),
  app("cursor", "Cursor", ["cursor"], ["~/Library/Application Support/Cursor/User", "~/.config/Cursor/User", "~/AppData/Roaming/Cursor/User"], ["/Applications/Cursor.app"], ["~/.cursor/mcp.json", "~/Library/Application Support/Cursor/User/mcp.json"], []),
  app("antigravity", "Antigravity", ["antigravity"], ["~/.antigravity"], [], [], ["Antigravity provider metadata needs validation."]),
  extension("roo-code", "Roo Code", [], ["~/.vscode/extensions"], [], [], ["Roo Code extension presence is not validated without reading extension metadata."]),
  cli("github-copilot", "GitHub Copilot", ["gh", "copilot"], ["~/.config/gh"], [], [], ["GitHub Copilot CLI support is detected conservatively through command metadata."]),
  cli("amp", "Amp", ["amp"], ["~/.amp"], [], [], ["Amp provider metadata needs validation."]),
  cli("openclaw", "OpenClaw", ["openclaw"], ["~/.openclaw"], [], [], ["OpenClaw provider metadata needs validation."]),
  cli("neovate", "Neovate", ["neovate"], ["~/.neovate"], [], [], ["Neovate provider metadata needs validation."]),
  cli("pi", "Pi", ["pi"], ["~/.pi"], [], [], ["Pi provider metadata needs validation."]),
  cli("qoder", "Qoder", ["qoder"], ["~/.qoder"], [], [], ["Qoder provider metadata needs validation."]),
  cli("zencoder", "Zencoder", ["zencoder"], ["~/.zencoder"], [], [], ["Zencoder provider metadata needs validation."]),
  cli("kimi-code-cli", "Kimi Code CLI", ["kimi"], ["~/.kimi"], [], [], ["Kimi Code CLI provider metadata needs validation."]),
  cli("gemini-cli", "Gemini CLI", ["gemini"], ["~/.gemini"], [], ["~/.gemini/settings.json"], []),
  app("windsurf", "Windsurf", ["windsurf"], ["~/Library/Application Support/Windsurf/User", "~/.config/Windsurf/User", "~/.codeium"], ["/Applications/Windsurf.app"], ["~/.codeium/windsurf/mcp_config.json", "~/Library/Application Support/Windsurf/User/mcp.json"], []),
  extension("vscode-copilot", "VS Code Copilot", ["code"], ["~/Library/Application Support/Code/User", "~/.config/Code/User", "~/AppData/Roaming/Code/User"], [], ["~/Library/Application Support/Code/User/mcp.json"], ["VS Code Copilot extension presence is not validated without reading extension metadata."]),
  app("codex-desktop", "Codex Desktop", [], ["~/.codex"], ["/Applications/Codex.app"], ["~/.codex/config.toml"], []),
  cli("aider", "aider", ["aider"], ["~/.aider.conf.yml", "~/.config/aider"], [], [], []),
  cli("hermes", "Hermes", ["hermes"], ["~/.hermes"], [], [], ["Hermes provider metadata needs validation."]),
  cli("trae", "Trae", ["trae"], ["~/.trae"], [], [], ["Trae provider metadata needs validation."])
];

export function listProviders(): ProviderSpec[] {
  return providerSpecs.map((provider) => ({
    ...provider,
    commandCandidates: [...provider.commandCandidates],
    appPathCandidates: [...provider.appPathCandidates],
    configPathCandidates: [...provider.configPathCandidates],
    mcpConfigPathCandidates: [...provider.mcpConfigPathCandidates],
    warnings: [...provider.warnings]
  }));
}

export function inspectProvider(id: string): ProviderSpec | null {
  return listProviders().find((provider) => provider.id === id) ?? null;
}

export function knownCommandCandidates(): string[] {
  return unique(providerSpecs.flatMap((provider) => provider.commandCandidates));
}

export function knownPathCandidates(): string[] {
  return unique(
    providerSpecs.flatMap((provider) => [
      ...provider.appPathCandidates,
      ...provider.configPathCandidates,
      ...provider.mcpConfigPathCandidates
    ])
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function cli(
  id: string,
  displayName: string,
  commandCandidates: string[],
  configPathCandidates: string[],
  appPathCandidates: string[],
  mcpConfigPathCandidates: string[],
  warnings: string[]
): ProviderSpec {
  return {
    id,
    displayName,
    kind: "cli",
    adapterMode: "versioned-cli",
    commandCandidates,
    appPathCandidates,
    configPathCandidates,
    mcpConfigPathCandidates,
    versionProbe: "--version",
    warnings
  };
}

function app(
  id: string,
  displayName: string,
  commandCandidates: string[],
  configPathCandidates: string[],
  appPathCandidates: string[],
  mcpConfigPathCandidates: string[],
  warnings: string[]
): ProviderSpec {
  return {
    id,
    displayName,
    kind: "app",
    adapterMode: "app-only",
    commandCandidates,
    appPathCandidates,
    configPathCandidates,
    mcpConfigPathCandidates,
    versionProbe: null,
    warnings
  };
}

function extension(
  id: string,
  displayName: string,
  commandCandidates: string[],
  configPathCandidates: string[],
  appPathCandidates: string[],
  mcpConfigPathCandidates: string[],
  warnings: string[]
): ProviderSpec {
  return {
    id,
    displayName,
    kind: "extension",
    adapterMode: "extension",
    commandCandidates,
    appPathCandidates,
    configPathCandidates,
    mcpConfigPathCandidates,
    versionProbe: null,
    warnings
  };
}
