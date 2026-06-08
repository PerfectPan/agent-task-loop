import type { TaskRecord } from '../types/task';

/** Which region of the dashboard currently has keyboard focus. */
export type Pane = 'list' | 'detail' | 'preview';

/** The session-preview pane reframes the same real estate between these modes. */
export type PreviewMode = 'output' | 'history' | 'logs';

export const PREVIEW_MODES: readonly PreviewMode[] = ['output', 'history', 'logs'];

/**
 * A clock injected everywhere time is read, so timeAgo / heartbeat freshness
 * are deterministic under test. `() => number` of epoch millis.
 */
export type Now = () => number;

/** One parsed line of TaskRecord.sessionHistory (see services/session-history.ts). */
export interface SessionHistoryEntry {
  timestamp?: string;
  round: number;
  kind: string;
  agent: string;
  sessionName?: string;
  sessionId?: string;
  workspacePath?: string;
  runId?: string;
  /** Original line, preserved for fallback rendering. */
  raw: string;
}

export type HeartbeatState = 'fresh' | 'stale' | 'dead' | 'none';

export interface HeartbeatInfo {
  state: HeartbeatState;
  /** Age in millis, or null when there is no heartbeat. */
  ageMs: number | null;
}

export interface RunnerInfo {
  kind?: 'execute' | 'review';
  agent?: string;
  round?: number;
  pid?: number;
}

/**
 * Everything the session-preview pane needs for one selected task. Built by a
 * SessionProvider so components never touch fs/clock directly.
 */
export interface SessionPreview {
  taskId: string;
  sessionId?: string;
  sessionName?: string;
  runner: RunnerInfo;
  heartbeat: HeartbeatInfo;
  history: SessionHistoryEntry[];
  /** Last N lines of the active log (execute or review), newest last. */
  logTail: string[];
  /** False when no readable log file exists (e.g. remote-only Feishu task). */
  hasLog: boolean;
  /** True while the runner is considered live (drives the spinner). */
  live: boolean;
}

export type FetchTasks = () => Promise<TaskRecord[]>;
