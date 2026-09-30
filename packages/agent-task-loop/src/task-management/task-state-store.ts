import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RuntimeTaskState } from './runtime-state';

/**
 * Persists the loop's run-time state per task, keyed by `(source, recordId)`.
 * Source-agnostic: the providers never see it; a {@link StatefulTaskProvider}
 * decorator writes/reads it around the provider tree.
 */
export interface TaskStateStore {
  read(source: string, recordId: string): RuntimeTaskState | undefined;
  /** Shallow-merge a patch; present keys overwrite, including cleared values. */
  merge(source: string, recordId: string, patch: RuntimeTaskState): void;
  clear(source: string, recordId: string): void;
}

/**
 * A filesystem-safe, **collision-free** path segment for an arbitrary id. The
 * readable prefix aids debugging; the short content hash guarantees two distinct
 * ids never map to the same segment (e.g. `github:a_b/c` vs `github:a/b_c`, both
 * of which would otherwise sanitize to `github_a_b_c`).
 */
export function safeSegment(id: string): string {
  const readable = id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
  const hash = createHash('sha1').update(id).digest('hex').slice(0, 8);
  return `${readable}-${hash}`;
}

/** The on-disk path for a task's run-time state. Exported for tests. */
export function stateFilePath(baseDir: string, source: string, recordId: string): string {
  return path.join(baseDir, safeSegment(source), `${safeSegment(recordId)}.json`);
}

interface CacheEntry {
  mtimeNs: bigint;
  state: RuntimeTaskState;
}

/**
 * File-backed store at `~/.agent-task-loop/state/<source>/<recordId>.json`.
 *
 * - Writes are atomic (temp file + `rename`) so a concurrent reader never sees a
 *   torn JSON.
 * - Reads use an mtime-aware in-process cache, so polling (the TUI) avoids
 *   re-parsing unchanged files while still picking up another process's writes.
 * - All filesystem access is best-effort: failures degrade to "no state" and are
 *   never thrown into the loop or a source write.
 */
export class FileTaskStateStore implements TaskStateStore {
  private readonly baseDir: string;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(os.homedir(), '.agent-task-loop', 'state');
  }

  private fileFor(source: string, recordId: string): string {
    return stateFilePath(this.baseDir, source, recordId);
  }

  private cacheKey(source: string, recordId: string): string {
    return JSON.stringify([source, recordId]);
  }

  read(source: string, recordId: string): RuntimeTaskState | undefined {
    const file = this.fileFor(source, recordId);
    try {
      const stat = statSync(file, { bigint: true });
      const key = this.cacheKey(source, recordId);
      const cached = this.cache.get(key);
      if (cached && cached.mtimeNs === stat.mtimeNs) {
        return cached.state;
      }
      const state = JSON.parse(readFileSync(file, 'utf8')) as RuntimeTaskState;
      this.cache.set(key, { mtimeNs: stat.mtimeNs, state });
      return state;
    } catch {
      // Missing or corrupt → no local state.
      return undefined;
    }
  }

  merge(source: string, recordId: string, patch: RuntimeTaskState): void {
    try {
      const current = this.read(source, recordId) ?? {};
      const next = { ...current, ...patch };
      const file = this.fileFor(source, recordId);
      mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(next), 'utf8');
      renameSync(tmp, file);
      const stat = statSync(file, { bigint: true });
      this.cache.set(this.cacheKey(source, recordId), { mtimeNs: stat.mtimeNs, state: next });
    } catch {
      // best-effort
    }
  }

  clear(source: string, recordId: string): void {
    try {
      rmSync(this.fileFor(source, recordId), { force: true });
    } catch {
      // best-effort
    }
    this.cache.delete(this.cacheKey(source, recordId));
  }

  /** Remove state files whose mtime is older than `maxAgeMs` (orphan sweep). */
  prune(maxAgeMs: number, now: number = Date.now()): void {
    try {
      if (!existsSync(this.baseDir)) {
        return;
      }
      for (const sourceDir of readdirSync(this.baseDir)) {
        const dir = path.join(this.baseDir, sourceDir);
        let files: string[];
        try {
          files = readdirSync(dir);
        } catch {
          continue;
        }
        for (const name of files) {
          const file = path.join(dir, name);
          try {
            if (now - statSync(file).mtimeMs > maxAgeMs) {
              rmSync(file, { force: true });
            }
          } catch {
            // skip
          }
        }
      }
    } catch {
      // best-effort
    }
    this.cache.clear();
  }
}
