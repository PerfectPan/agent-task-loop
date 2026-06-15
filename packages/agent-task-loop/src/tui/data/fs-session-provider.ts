import { readFile as nodeReadFile, readdir as nodeReaddir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FsSessionProvider as SharedFsProvider, toLines, type SessionRoot } from '@rivus/agent-sessions';
import type { TaskRecord } from '../../types/task';
import type { SessionPreview } from '../types';
import { tailLines } from '../logic/session-tail';
import { type SessionProvider, buildPreviewFromTask } from './session-provider';

/** Default number of trailing lines surfaced in the preview pane. */
const DEFAULT_MAX_LINES = 40;

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
 * task's session id.
 *
 * Session discovery and transcript parsing are delegated to the shared
 * `@rivus/agent-sessions` core (bundled into this package); the transcript is
 * mapped back through `toLines()` so this provider keeps returning the legacy
 * `string[]` shape its consumers expect. `getPreview` never throws.
 */
export class FsSessionProvider implements SessionProvider {
  private readonly maxLines: number;
  private readonly readFile: ReadFile;
  private readonly sessions: SharedFsProvider;

  constructor(opts: FsSessionProviderOptions = {}) {
    this.maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
    this.readFile = opts.readFile ?? (path => nodeReadFile(path, 'utf8'));
    const readdir: ReadDir = opts.readdir ?? (path => nodeReaddir(path, { withFileTypes: true }));
    // agent-task-loop resolves transcripts purely by session id, so the agent
    // attribution is irrelevant here — tag every root "unknown".
    const roots: SessionRoot[] = (opts.sessionRoots ?? defaultSessionRoots()).map(path => ({
      path,
      agent: 'unknown',
    }));
    this.sessions = new SharedFsProvider({ agent: 'unknown', roots, readFile: this.readFile, readdir });
  }

  async getPreview(task: TaskRecord, now: number): Promise<SessionPreview> {
    const reviewing = task.runnerKind === 'review';
    const logPath = reviewing ? task.reviewLogPath : task.logPath;

    let tail = await this.readLogTail(logPath);

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
    return toLines(await this.sessions.getTranscript(sessionId, this.maxLines));
  }

  /** Session ids that have a resolvable transcript on disk. */
  async listAvailableSessionIds(): Promise<string[]> {
    return (await this.sessions.list()).map(session => session.id);
  }

  /** Tail of the live log file (not a transcript); empty on missing/unreadable. */
  private async readLogTail(path: string | undefined | null): Promise<string[]> {
    if (!path) return [];
    try {
      return tailLines(await this.readFile(path), this.maxLines);
    } catch {
      return [];
    }
  }
}
