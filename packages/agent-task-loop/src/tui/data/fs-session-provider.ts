import { readFile as nodeReadFile, readdir as nodeReaddir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { TaskRecord } from '../../types/task';
import type { SessionPreview } from '../types';
import { tailLines } from '../logic/session-tail';
import { parseTranscript } from '../logic/transcript';
import { type SessionProvider, buildPreviewFromTask } from './session-provider';

/** Default number of trailing lines surfaced in the preview pane. */
const DEFAULT_MAX_LINES = 40;
/** Upper bound on directory entries scanned while indexing transcripts. */
const SCAN_BUDGET = 50_000;
const MAX_DEPTH = 6;
/** Session ids are UUIDs, embedded in codex filenames and naming claude files. */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type ReadFile = (path: string) => Promise<string>;

interface DirEntry {
  name: string;
  isDirectory(): boolean;
}
type ReadDir = (path: string) => Promise<DirEntry[]>;

/** Where coding agents persist their session transcripts. */
function defaultSessionRoots(): string[] {
  const home = homedir();
  return [join(home, '.codex', 'sessions'), join(home, '.claude', 'projects')];
}

export interface FsSessionProviderOptions {
  maxLines?: number;
  readFile?: ReadFile;
  readdir?: ReadDir;
  sessionRoots?: string[];
}

/**
 * A {@link SessionProvider} backed by the local filesystem. It surfaces the tail
 * of a task's active log file, or — when that file is gone (common once a
 * worktree is cleaned up) — the agent session transcript resolved from the
 * task's session id. Transcripts live under the standard roots
 * (`~/.codex/sessions`, `~/.claude/projects`); the provider indexes them once
 * (session-id → path) so lookups and availability checks are O(1).
 * `getPreview` never throws.
 */
export class FsSessionProvider implements SessionProvider {
  private readonly maxLines: number;
  private readonly readFile: ReadFile;
  private readonly readdir: ReadDir;
  private readonly roots: string[];
  private indexPromise: Promise<Map<string, string>> | null = null;

  constructor(opts: FsSessionProviderOptions = {}) {
    this.maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
    this.readFile = opts.readFile ?? (path => nodeReadFile(path, 'utf8'));
    this.readdir = opts.readdir ?? (path => nodeReaddir(path, { withFileTypes: true }));
    this.roots = opts.sessionRoots ?? defaultSessionRoots();
  }

  async getPreview(task: TaskRecord, now: number): Promise<SessionPreview> {
    const reviewing = task.runnerKind === 'review';
    const logPath = reviewing ? task.reviewLogPath : task.logPath;

    let tail = await this.readTail(logPath, content => tailLines(content, this.maxLines));

    if (tail.length === 0) {
      const sessionId = reviewing
        ? task.reviewSessionId ?? task.sessionId
        : task.executionSessionId ?? task.sessionId;
      if (sessionId) tail = await this.getTranscript(sessionId);
    }

    return buildPreviewFromTask(task, now, tail);
  }

  /** Resolve and parse the transcript for a single session id (one round). */
  async getTranscript(sessionId: string): Promise<string[]> {
    if (!sessionId) return [];
    const path = (await this.index()).get(sessionId);
    return this.readTail(path, content => parseTranscript(content, this.maxLines));
  }

  /** Session ids that have a resolvable transcript on disk. */
  async listAvailableSessionIds(): Promise<string[]> {
    return [...(await this.index()).keys()];
  }

  private async readTail(
    path: string | undefined | null,
    parse: (content: string) => string[],
  ): Promise<string[]> {
    if (!path) return [];
    try {
      return parse(await this.readFile(path));
    } catch {
      return [];
    }
  }

  /** Lazily build (once) a map of session id → transcript file path. */
  private index(): Promise<Map<string, string>> {
    if (!this.indexPromise) this.indexPromise = this.buildIndex();
    return this.indexPromise;
  }

  private async buildIndex(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    let budget = SCAN_BUDGET;

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > MAX_DEPTH || budget <= 0) return;
      let entries: DirEntry[];
      try {
        entries = await this.readdir(dir);
      } catch {
        return;
      }
      const dirs: string[] = [];
      for (const entry of entries) {
        if (--budget <= 0) return;
        if (entry.isDirectory()) {
          dirs.push(join(dir, entry.name));
        } else {
          const match = entry.name.match(UUID_RE);
          if (match && !map.has(match[0])) map.set(match[0], join(dir, entry.name));
        }
      }
      for (const sub of dirs) await walk(sub, depth + 1);
    };

    for (const root of this.roots) await walk(root, 0);
    return map;
  }
}
