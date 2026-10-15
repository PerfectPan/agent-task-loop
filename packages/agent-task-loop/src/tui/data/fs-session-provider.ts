import { listSessions, isSessionHead, type SessionHead, type SessionPlatform } from '@rivus/agent-kit/sessions';
import { loadTranscript, type TranscriptEvent } from '@rivus/agent-kit/transcript';
import { createNodePlatform } from '@rivus/agent-kit/node';
import type { Platform } from '@rivus/agent-kit/platform';
import type { TaskRecord } from '../../types/task';
import type { SessionPreview } from '../types';
import { tailLines } from '../logic/session-tail';
import { type SessionProvider, buildPreviewFromTask } from './session-provider';

/** Default number of trailing lines surfaced in the preview pane. */
const DEFAULT_MAX_LINES = 40;

/**
 * How stale the session listing may be before a lookup miss is allowed to
 * rebuild it. Sessions created after the first listing aren't in the cached
 * map; rebuilding on every miss would re-list the FS on each poll of a
 * genuinely-absent id, so we only refresh once the listing is older than this
 * window.
 */
const REFRESH_AFTER_MS = 3000;

/**
 * What this provider reads through: the session use cases' file access, plus
 * `env`/`home` so `listSessions` can derive each agent's roots. A whole
 * `Platform` satisfies it, and so does the test platform.
 */
export type FsSessionHost = SessionPlatform & Pick<Platform, 'env' | 'home'>;

export interface FsSessionProviderOptions {
  maxLines?: number;
  /**
   * The host every read goes through. Defaults to a Node platform over the
   * real filesystem and environment; tests inject a memory platform seeded
   * with session and log files.
   */
  platform?: FsSessionHost;
}

/** Collapse a payload text to one preview line, as the previous parser did. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * One preview line of a transcript event, or `null` for events the preview
 * drops. Message and reasoning kinds render as `kind: text`; tool calls as
 * `⚙ name`. Tool results, requests, system markers, compactions and hooks are
 * bookkeeping here, and `unknown` keeps the events the kit did not attribute —
 * for Codex that is exactly the `event_msg` copy of a message, whose
 * `response_item` twin is the one real turn.
 */
function previewLine(event: TranscriptEvent): string | null {
  if (event.kind === 'user' || event.kind === 'assistant' || event.kind === 'reasoning') {
    const text = typeof event.payload.text === 'string' ? collapse(event.payload.text) : '';
    return text ? `${event.kind}: ${text}` : null;
  }
  if (event.kind === 'tool_call') {
    const name = typeof event.payload.name === 'string' && event.payload.name !== '' ? event.payload.name : 'tool';
    return `⚙ ${name}`;
  }
  return null;
}

/** The last `maxLines` preview lines of a transcript, oldest first. */
function previewLines(events: readonly TranscriptEvent[], maxLines: number): string[] {
  if (maxLines <= 0) {
    return [];
  }
  const lines: string[] = [];
  for (const event of events) {
    const line = previewLine(event);
    if (line) {
      lines.push(line);
    }
  }
  return lines.slice(-maxLines);
}

/** The whole file as text; rejects like the platform reads do, so callers guard. */
async function readTextFile(platform: FsSessionHost, path: string): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of platform.fs.read(path)) {
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * A {@link SessionProvider} backed by the local filesystem. It surfaces the tail
 * of a task's active log file, or — when that file is gone (common once a
 * worktree is cleaned up) — the agent session transcript resolved from the
 * task's session id.
 *
 * Session discovery and transcript parsing come from `@rivus/agent-kit`'s
 * `/sessions` and `/transcript` entries: `listSessions` yields one head per
 * session file across every built-in agent's roots, and `loadTranscript`
 * returns the session's structured events, its Result failures collapsing back
 * to the empty tail this provider's contract promises. `getPreview` never
 * throws.
 */
export class FsSessionProvider implements SessionProvider {
  private readonly maxLines: number;
  private readonly platform: FsSessionHost;
  private headsPromise: Promise<Map<string, SessionHead>> | null = null;
  private listedAtMs = 0;

  constructor(opts: FsSessionProviderOptions = {}) {
    this.maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
    this.platform = opts.platform ?? createNodePlatform();
  }

  async getPreview(task: TaskRecord, now: number): Promise<SessionPreview> {
    const reviewing = task.runnerKind === 'review';
    const logPath = reviewing ? task.reviewLogPath : task.logPath;

    let tail = await this.readLogTail(logPath);

    if (tail.length === 0) {
      const sessionId = reviewing
        ? (task.reviewSessionId ?? task.sessionId)
        : (task.executionSessionId ?? task.sessionId);
      if (sessionId) {
        tail = await this.getTranscript(sessionId);
      }
    }

    return buildPreviewFromTask(task, now, tail);
  }

  /** Resolve and parse the transcript for a single session id (one round). */
  async getTranscript(sessionId: string): Promise<string[]> {
    if (!sessionId) {
      return [];
    }
    const head = await this.resolve(sessionId);
    if (!head) {
      return [];
    }
    const transcript = await loadTranscript(this.platform, head.ref);
    // Expected failures (missing file, no adapter, unreadable) degrade to an
    // empty tail, keeping the never-throws contract; only platform defects
    // reject.
    if (!transcript.ok) {
      return [];
    }
    return previewLines(transcript.value.events, this.maxLines);
  }

  /** Session ids that have a resolvable transcript on disk. */
  async listAvailableSessionIds(): Promise<string[]> {
    const ids: string[] = [];
    for (const head of (await this.listHeads()).values()) {
      if (head.ref.sessionId !== undefined) {
        ids.push(head.ref.sessionId);
      }
    }
    return ids;
  }

  /**
   * Look up a session by id, rebuilding the (otherwise memoized) listing once
   * on a miss if it has gone stale — so a session created after startup
   * becomes resolvable instead of permanently reading "not found".
   */
  private async resolve(sessionId: string): Promise<SessionHead | undefined> {
    const hit = (await this.listHeads()).get(sessionId);
    if (hit) {
      return hit;
    }
    if (Date.now() - this.listedAtMs > REFRESH_AFTER_MS) {
      return (await this.listHeadsFresh()).get(sessionId);
    }
    return undefined;
  }

  private listHeads(): Promise<Map<string, SessionHead>> {
    return this.headsPromise ?? this.listHeadsFresh();
  }

  /** One head per listed session, keyed by session id; the first id wins. */
  private async listHeadsFresh(): Promise<Map<string, SessionHead>> {
    this.listedAtMs = Date.now();
    const listing = (async () => {
      const heads = new Map<string, SessionHead>();
      for await (const item of listSessions(this.platform)) {
        if (isSessionHead(item) && item.ref.sessionId !== undefined && !heads.has(item.ref.sessionId)) {
          heads.set(item.ref.sessionId, item);
        }
      }
      return heads;
    })();
    this.headsPromise = listing;
    try {
      return await listing;
    } catch (error) {
      // A rejected listing (abort or platform defect) must not poison the
      // cache: forget it so the next call lists again.
      this.headsPromise = null;
      throw error;
    }
  }

  /** Tail of the live log file (not a transcript); empty on missing/unreadable. */
  private async readLogTail(path: string | undefined | null): Promise<string[]> {
    if (!path) {
      return [];
    }
    try {
      return tailLines(await readTextFile(this.platform, path), this.maxLines);
    } catch {
      return [];
    }
  }
}
