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
/** Upper bound on directory entries scanned while resolving a transcript. */
const SCAN_BUDGET = 20_000;
const MAX_DEPTH = 6;

/** Reads a UTF-8 text file. Matches `node:fs/promises` `readFile(path, 'utf8')`. */
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
  /** Max trailing lines to keep in the preview (default 40). */
  maxLines?: number;
  /** Injectable reader; defaults to `node:fs/promises` readFile as utf8. */
  readFile?: ReadFile;
  /** Injectable directory reader; defaults to `node:fs/promises` readdir. */
  readdir?: ReadDir;
  /** Roots searched for a transcript file by session id. */
  sessionRoots?: string[];
}

/**
 * A {@link SessionProvider} backed by the local filesystem. It surfaces, in
 * order of preference: the tail of the task's active log file, or — when that
 * file is gone (common once a worktree is cleaned up) — the tail of the agent's
 * session transcript, resolved from the task's session id under the standard
 * agent session roots (`~/.codex/sessions`, `~/.claude/projects`). Transcript
 * lookups are cached per id. `getPreview` never throws.
 */
export class FsSessionProvider implements SessionProvider {
  private readonly maxLines: number;
  private readonly readFile: ReadFile;
  private readonly readdir: ReadDir;
  private readonly roots: string[];
  private readonly transcriptCache = new Map<string, string | null>();

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
      if (sessionId) {
        const path = await this.resolveTranscript(sessionId);
        tail = await this.readTail(path, content => parseTranscript(content, this.maxLines));
      }
    }

    return buildPreviewFromTask(task, now, tail);
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

  /** Find (and cache) the transcript file whose name contains `sessionId`. */
  private async resolveTranscript(sessionId: string): Promise<string | null> {
    const cached = this.transcriptCache.get(sessionId);
    if (cached !== undefined) return cached;

    let budget = SCAN_BUDGET;
    const walk = async (dir: string, depth: number): Promise<string | null> => {
      if (depth > MAX_DEPTH || budget <= 0) return null;
      let entries: DirEntry[];
      try {
        entries = await this.readdir(dir);
      } catch {
        return null;
      }
      const dirs: string[] = [];
      for (const entry of entries) {
        if (--budget <= 0) return null;
        if (entry.isDirectory()) {
          dirs.push(join(dir, entry.name));
        } else if (entry.name.includes(sessionId)) {
          return join(dir, entry.name);
        }
      }
      for (const sub of dirs) {
        const hit = await walk(sub, depth + 1);
        if (hit) return hit;
      }
      return null;
    };

    let found: string | null = null;
    for (const root of this.roots) {
      found = await walk(root, 0);
      if (found) break;
    }
    this.transcriptCache.set(sessionId, found);
    return found;
  }
}
