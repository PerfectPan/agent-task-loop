import { readFile as nodeReadFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentKind, Session } from "./types.js";
import type { TranscriptEntry } from "../transcript/types.js";
import { parseTranscript } from "../transcript/parse.js";
import { buildFsIndex, type SessionRoot } from "./fs-index.js";

const DEFAULT_MAX_LINES = 200;

export interface ListOptions {
  /** Case-insensitive substring matched against id / title / cwd / path. */
  filter?: string;
}

/** A source of coding-agent sessions for one tool. */
export interface SessionProvider {
  readonly agent: AgentKind;
  /** Root directories this provider scans. */
  roots(): string[];
  /** Enumerate sessions (newest first), optionally filtered. */
  list(opts?: ListOptions): Promise<Session[]>;
  /** Parsed transcript for one session id; `[]` when not found (never throws). */
  getTranscript(id: string, maxLines?: number): Promise<TranscriptEntry[]>;
  /** A copyable resume command for the id, or `null` when unsupported. */
  resumeCommand(id: string): Promise<string | null>;
}

type ReadFile = (path: string) => Promise<string>;
interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

export interface FsSessionProviderOptions {
  agent: AgentKind;
  roots: SessionRoot[];
  readFile?: ReadFile;
  readdir?: (path: string) => Promise<DirEntry[]>;
  stat?: (path: string) => Promise<{ mtimeMs: number }>;
  scanBudget?: number;
  maxDepth?: number;
  /**
   * Build a resume command for a session, or `null`/undefined when the tool
   * can't resume. Left unset by default — verified per-tool resume commands
   * are wired in P5 (see docs/plans/issue-25-shared-sessions.md), not guessed.
   */
  resume?: (session: Session) => string | null;
}

/** A {@link SessionProvider} for filesystem-backed tools (Codex, Claude). */
export class FsSessionProvider implements SessionProvider {
  readonly agent: AgentKind;
  private readonly opts: FsSessionProviderOptions;
  private readonly readFile: ReadFile;
  private indexPromise: Promise<Map<string, Session>> | null = null;

  constructor(opts: FsSessionProviderOptions) {
    this.agent = opts.agent;
    this.opts = opts;
    this.readFile = opts.readFile ?? ((path) => nodeReadFile(path, "utf8"));
  }

  roots(): string[] {
    return this.opts.roots.map((r) => r.path);
  }

  private index(): Promise<Map<string, Session>> {
    if (!this.indexPromise) {
      this.indexPromise = buildFsIndex({
        roots: this.opts.roots,
        readdir: this.opts.readdir,
        stat: this.opts.stat,
        scanBudget: this.opts.scanBudget,
        maxDepth: this.opts.maxDepth
      });
    }
    return this.indexPromise;
  }

  async list(opts: ListOptions = {}): Promise<Session[]> {
    const sessions = [...(await this.index()).values()];
    const filtered = opts.filter ? sessions.filter((s) => matches(s, opts.filter as string)) : sessions;
    return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getTranscript(id: string, maxLines = DEFAULT_MAX_LINES): Promise<TranscriptEntry[]> {
    const session = (await this.index()).get(id);
    if (!session?.path) return [];
    try {
      return parseTranscript(await this.readFile(session.path), maxLines);
    } catch {
      return [];
    }
  }

  async resumeCommand(id: string): Promise<string | null> {
    const session = (await this.index()).get(id);
    if (!session || !this.opts.resume) return null;
    return this.opts.resume(session);
  }
}

function matches(session: Session, needle: string): boolean {
  const q = needle.toLowerCase();
  return [session.id, session.title, session.cwd, session.path]
    .filter((v): v is string => typeof v === "string")
    .some((v) => v.toLowerCase().includes(q));
}

export interface ProviderFactoryOptions extends Partial<Omit<FsSessionProviderOptions, "agent" | "roots">> {
  /** Override the home directory the default root is derived from. */
  home?: string;
}

export function codexProvider(opts: ProviderFactoryOptions = {}): FsSessionProvider {
  const { home = homedir(), ...rest } = opts;
  return new FsSessionProvider({
    agent: "codex",
    roots: [{ path: join(home, ".codex", "sessions"), agent: "codex" }],
    ...rest
  });
}

export function claudeProvider(opts: ProviderFactoryOptions = {}): FsSessionProvider {
  const { home = homedir(), ...rest } = opts;
  return new FsSessionProvider({
    agent: "claude",
    roots: [{ path: join(home, ".claude", "projects"), agent: "claude" }],
    ...rest
  });
}
