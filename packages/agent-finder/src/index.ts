export interface ProviderSpec {
  id: string;
  displayName: string;
  kind: string;
  adapterMode: string;
  commandCandidates: string[];
  appPathCandidates: string[];
  configPathCandidates: string[];
  mcpConfigPathCandidates: string[];
  versionProbe: string | null;
  warnings: string[];
}

export interface HostProbe {
  os: string;
  arch: string;
  home: string;
  generatedAt: string;
  commands: Record<string, string>;
  executablePaths: Record<string, boolean>;
  existingPaths: Record<string, boolean>;
  versions: Record<string, string>;
}

export interface HostProbeCollector {
  os?: string;
  arch?: string;
  home?: string;
  now?: () => string;
  resolveCommand?: (command: string) => string | null;
  isExecutable?: (path: string) => boolean;
  pathExists?: (path: string) => boolean;
  readVersion?: (path: string, args: string[]) => string | null;
}

export interface DiscoveryReport {
  schema_version: "0.1";
  generated_at: string;
  host: { os: string; arch: string };
  agents: AgentRecord[];
}

export interface AgentRecord {
  id: string;
  name: string;
  type: string;
  status: "runnable" | "found" | "missing" | "unknown";
  command: string | null;
  app_path: string | null;
  version: string | null;
  evidence: Evidence[];
  config_paths: string[];
  mcp_config_paths: string[];
  warnings: string[];
}

export interface Evidence {
  kind: string;
  value: string;
  exists: boolean;
  reason: string;
}

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

export function discover(probe: HostProbe): DiscoveryReport {
  const agents = providerSpecs.map((provider) => scanProvider(provider, probe));
  return {
    schema_version: "0.1",
    generated_at: probe.generatedAt,
    host: { os: probe.os, arch: probe.arch },
    agents
  };
}

export function resolveCommand(
  command: string,
  options: {
    path: string;
    pathExt?: string;
    delimiter?: string;
    fileExists: (candidate: string) => boolean;
  }
): string | null {
  const delimiter = options.delimiter ?? (process.platform === "win32" ? ";" : ":");
  const pathExt = options.pathExt ?? (process.platform === "win32" ? process.env.PATHEXT : "");
  const extensions = pathExt
    ? pathExt.split(";").filter(Boolean)
    : [""];
  const hasKnownExtension = extensions.some((ext) =>
    command.toLowerCase().endsWith(ext.toLowerCase())
  );
  const commandNames = hasKnownExtension
    ? [command]
    : extensions.map((ext) => `${command}${ext}`);

  for (const dir of options.path.split(delimiter).filter(Boolean)) {
    const separator = dir.includes("\\") ? "\\" : "/";
    for (const name of commandNames) {
      const candidate = `${trimTrailingSeparators(dir)}${separator}${name}`;
      if (options.fileExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export function collectHostProbe(options: HostProbeCollector = {}): HostProbe {
  const hostOs = options.os ?? platform();
  const hostArch = options.arch ?? arch();
  const home = options.home ?? homedir();
  const now = options.now ?? (() => new Date().toISOString());
  const commandResolver =
    options.resolveCommand ??
    ((command: string) =>
      resolveCommand(command, {
        path: process.env.PATH ?? "",
        pathExt: process.env.PATHEXT,
        delimiter,
        fileExists: existsSync
      }));
  const executableChecker = options.isExecutable ?? defaultIsExecutable;
  const pathChecker = options.pathExists ?? existsSync;
  const versionReader = options.readVersion ?? defaultReadVersion;
  const commands: Record<string, string> = {};
  const executablePaths: Record<string, boolean> = {};
  const existingPaths: Record<string, boolean> = {};
  const versions: Record<string, string> = {};

  for (const command of knownCommandCandidates()) {
    const resolved = commandResolver(command);
    if (resolved) {
      commands[command] = resolved;
      executablePaths[resolved] = executableChecker(resolved);
    }
  }

  for (const path of knownPathCandidates()) {
    const expanded = expandPath(path, home);
    existingPaths[expanded] = pathChecker(expanded);
  }

  for (const provider of providerSpecs) {
    if (!provider.versionProbe) {
      continue;
    }
    for (const command of provider.commandCandidates) {
      const resolved = commands[command];
      if (!resolved || !executablePaths[resolved]) {
        continue;
      }
      const args = provider.versionProbe.split(" ").filter(Boolean);
      const version = versionReader(resolved, args);
      if (version) {
        versions[`${resolved} ${provider.versionProbe}`] = version;
      }
    }
  }

  return {
    os: hostOs,
    arch: hostArch,
    home,
    generatedAt: now(),
    commands,
    executablePaths,
    existingPaths,
    versions
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

function expandPath(path: string, home: string): string {
  if (path === "~") {
    return home;
  }
  if (path.startsWith("~/")) {
    return `${home}${path.slice(1)}`;
  }
  return path;
}

function trimTrailingSeparators(value: string): string {
  return value.replace(/[\\/]+$/u, "");
}

function knownCommandCandidates(): string[] {
  return unique(providerSpecs.flatMap((provider) => provider.commandCandidates));
}

function knownPathCandidates(): string[] {
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

function defaultIsExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return process.platform === "win32" && /\.(?:com|exe|bat|cmd)$/iu.test(path);
  }
}

function defaultReadVersion(path: string, args: string[]): string | null {
  try {
    return execFileSync(path, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500
    }).trim();
  } catch {
    return null;
  }
}

const providerSpecs: ProviderSpec[] = [
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
import { accessSync, constants, existsSync } from "node:fs";
import { delimiter } from "node:path";
import { execFileSync } from "node:child_process";
import { arch, homedir, platform } from "node:os";
