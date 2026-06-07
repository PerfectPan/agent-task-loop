import type { TaskRecord } from '../../types/task';
import type { SessionPreview } from '../types';
import { parseSessionHistory } from '../logic/session-history-parse';
import { heartbeatFreshness } from '../logic/heartbeat';
import { isLiveStatus } from '../logic/status';

/**
 * Source of session-preview data for a selected task. Implementations may read
 * the filesystem (real) or return fixtures (fake); components depend only on
 * this interface and never touch fs/clock directly.
 */
export interface SessionProvider {
  /**
   * Build the full preview for `task` as of the injected `now` (epoch ms). May
   * be sync (fixtures) or async (fs-backed); consumers await the result either
   * way.
   */
  getPreview(task: TaskRecord, now: number): SessionPreview | Promise<SessionPreview>;
  /**
   * Resolve and read the transcript for a single session id (one round). Returns
   * readable lines, or [] when no transcript can be found.
   */
  getTranscript(sessionId: string): string[] | Promise<string[]>;
}

/**
 * Pure builder that derives a {@link SessionPreview} from a TaskRecord using the
 * foundation logic (history parsing, heartbeat freshness, live status). It does
 * no I/O: callers pass any already-read `logTail` (defaults to none).
 */
export function buildPreviewFromTask(
  task: TaskRecord,
  now: number,
  logTail?: string[],
): SessionPreview {
  const tail = logTail ?? [];
  return {
    taskId: task.taskId,
    sessionId: task.executionSessionId ?? task.sessionId,
    sessionName: task.executionSessionName ?? task.sessionName,
    runner: {
      kind: task.runnerKind,
      agent: task.runnerAgent ?? task.targetAgent,
      round: task.runnerRound,
      pid: task.runnerPid,
    },
    heartbeat: heartbeatFreshness(task.lastHeartbeatAt, now),
    history: parseSessionHistory(task.sessionHistory),
    logTail: tail,
    hasLog: tail.length > 0,
    live: isLiveStatus(task.status),
  };
}

/**
 * Test double whose {@link SessionProvider.getPreview} returns
 * {@link buildPreviewFromTask}, shallow-merged with any per-taskId override.
 */
export function createFakeSessionProvider(
  overrides: Record<string, Partial<SessionPreview>> = {},
  transcripts: Record<string, string[]> = {},
): SessionProvider {
  return {
    async getPreview(task: TaskRecord, now: number): Promise<SessionPreview> {
      const base = buildPreviewFromTask(task, now);
      const override = overrides[task.taskId];
      return override ? { ...base, ...override } : base;
    },
    async getTranscript(sessionId: string): Promise<string[]> {
      return transcripts[sessionId] ?? [];
    },
  };
}
