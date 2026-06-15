/** The coding-agent tool a session belongs to. */
export type AgentKind = "codex" | "claude" | "opencode" | "unknown";

/**
 * A tool-agnostic coding-agent session. Filesystem-backed tools (Codex, Claude)
 * always have a `path`; db-backed tools (OpenCode, SQLite) do not — hence
 * `path` is optional. `updatedAt` is always present (file mtime when no richer
 * metadata exists). `title` / `cwd` / `messageCount` are best-effort and may be
 * filled lazily by a provider.
 */
export interface Session {
  id: string;
  agent: AgentKind;
  path?: string;
  updatedAt: string;
  createdAt?: string;
  title?: string;
  cwd?: string;
  messageCount?: number;
}
