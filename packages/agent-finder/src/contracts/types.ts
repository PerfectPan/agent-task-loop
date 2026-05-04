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
