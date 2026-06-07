import { readFile as nodeReadFile } from 'node:fs/promises';
import type { TaskRecord } from '../../types/task';
import type { SessionPreview } from '../types';
import { tailLines } from '../logic/session-tail';
import { type SessionProvider, buildPreviewFromTask } from './session-provider';

/** Default number of trailing log lines surfaced in the preview pane. */
const DEFAULT_MAX_LINES = 40;

/** Reads a UTF-8 text file. Matches `node:fs/promises` `readFile(path, 'utf8')`. */
type ReadFile = (path: string) => Promise<string>;

export interface FsSessionProviderOptions {
  /** Max trailing log lines to keep in the preview (default 40). */
  maxLines?: number;
  /** Injectable reader; defaults to `node:fs/promises` readFile as utf8. */
  readFile?: ReadFile;
}

/**
 * A {@link SessionProvider} backed by the local filesystem: it tails the active
 * log file for a task and delegates everything else to
 * {@link buildPreviewFromTask}. All filesystem access is injectable for tests,
 * and `getPreview` is guaranteed never to throw — read failures degrade to a
 * preview with no log.
 */
export class FsSessionProvider implements SessionProvider {
  private readonly maxLines: number;
  private readonly readFile: ReadFile;

  constructor(opts: FsSessionProviderOptions = {}) {
    this.maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
    this.readFile = opts.readFile ?? ((path) => nodeReadFile(path, 'utf8'));
  }

  /**
   * Build the preview for `task` at clock `now` (epoch millis), tailing the
   * active log file when one exists. The active log is `reviewLogPath` for a
   * review runner, otherwise `logPath`. Missing paths and read errors yield a
   * preview with an empty log tail (`hasLog: false`).
   */
  async getPreview(task: TaskRecord, now: number): Promise<SessionPreview> {
    const logPath = task.runnerKind === 'review' ? task.reviewLogPath : task.logPath;

    if (!logPath) {
      return buildPreviewFromTask(task, now, []);
    }

    let tail: string[] = [];
    try {
      const content = await this.readFile(logPath);
      tail = tailLines(content, this.maxLines);
    } catch {
      tail = [];
    }

    return buildPreviewFromTask(task, now, tail);
  }
}
