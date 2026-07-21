import { readFile } from 'node:fs/promises';
import { FsSessionProvider } from '../tui/data/fs-session-provider';
import { parseSessionHistory } from '../tui/logic/session-history-parse';
import type { SessionHistoryEntry } from '../tui/types';
import type { TaskProvider } from '../task-management/task-provider';
import type { TaskRecord } from '../types/task';
import { TaskManagerInputError } from './task-manager-error';

/** One agent round on a task — safe for desktop UI (no paths). */
export interface TaskRoundDto {
  key: string;
  round: number;
  kind: string;
  agent: string;
  at?: string;
  sessionId?: string;
  sessionName?: string;
  hasTranscript: boolean;
}

export interface TranscriptMessageDto {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'unknown';
  text: string;
}

export interface TaskTranscriptDto {
  taskId: string;
  roundKey: string;
  sessionId?: string;
  messages: TranscriptMessageDto[];
  truncated: boolean;
  lineCount: number;
}

export interface TaskLogTailDto {
  taskId: string;
  lines: string[];
  truncated: boolean;
  available: boolean;
}

export interface TaskTraceServiceDependencies {
  taskProvider: Pick<TaskProvider, 'getTaskById'>;
  sessionProvider?: Pick<FsSessionProvider, 'getTranscript' | 'listAvailableSessionIds'>;
  readFile?: (path: string) => Promise<string>;
  maxTranscriptLines?: number;
  maxLogLines?: number;
  maxMessageChars?: number;
}

/**
 * Read-only task execution evidence for the desktop console.
 * Reuses TUI session-history parsing and FsSessionProvider transcript resolution.
 */
export class TaskTraceService {
  private readonly sessions: Pick<FsSessionProvider, 'getTranscript' | 'listAvailableSessionIds'>;
  private readonly readFile: (path: string) => Promise<string>;
  private readonly maxTranscriptLines: number;
  private readonly maxLogLines: number;
  private readonly maxMessageChars: number;

  constructor(private readonly deps: TaskTraceServiceDependencies) {
    this.sessions = deps.sessionProvider ?? new FsSessionProvider({
      maxLines: deps.maxTranscriptLines ?? 200,
    });
    this.readFile = deps.readFile ?? (path => readFile(path, 'utf8'));
    this.maxTranscriptLines = deps.maxTranscriptLines ?? 200;
    this.maxLogLines = deps.maxLogLines ?? 120;
    this.maxMessageChars = deps.maxMessageChars ?? 4_000;
  }

  async listRounds(taskId: string): Promise<{ taskId: string; rounds: TaskRoundDto[] }> {
    const task = await this.requireTask(taskId);
    const history = parseSessionHistory(task.sessionHistory);
    const available = new Set(await this.sessions.listAvailableSessionIds().catch(() => [] as string[]));

    // Also treat current pointers as available hints when history is sparse.
    for (const id of [
      task.sessionId,
      task.executionSessionId,
      task.reviewSessionId,
    ]) {
      if (id) available.add(id);
    }

    const rounds = history.map((entry, index) => toRoundDto(entry, index, available));

    // If history is empty but task has a live session pointer, surface one synthetic round.
    if (rounds.length === 0) {
      const fallback = fallbackRound(task, available);
      if (fallback) rounds.push(fallback);
    }

    return { taskId, rounds };
  }

  async getTranscript(input: {
    taskId: string;
    roundKey?: string;
    sessionId?: string;
  }): Promise<TaskTranscriptDto> {
    const task = await this.requireTask(input.taskId);
    const history = parseSessionHistory(task.sessionHistory);

    let entry: SessionHistoryEntry | undefined;
    let roundKey = input.roundKey ?? '';

    if (input.sessionId) {
      entry = history.find(h => h.sessionId === input.sessionId);
      roundKey = entry ? roundKeyFor(entry, history.indexOf(entry)) : `session:${input.sessionId}`;
    } else if (input.roundKey) {
      const idx = history.findIndex((h, i) => roundKeyFor(h, i) === input.roundKey);
      entry = idx >= 0 ? history[idx] : undefined;
      roundKey = input.roundKey;
    } else {
      entry = history[history.length - 1];
      if (entry) roundKey = roundKeyFor(entry, history.length - 1);
    }

    const sessionId =
      input.sessionId ??
      entry?.sessionId ??
      task.executionSessionId ??
      task.reviewSessionId ??
      task.sessionId;

    if (!sessionId) {
      return {
        taskId: task.taskId,
        roundKey: roundKey || 'none',
        messages: [],
        truncated: false,
        lineCount: 0,
      };
    }

    const lines = await this.sessions.getTranscript(sessionId);
    const sliced = lines.slice(-this.maxTranscriptLines);
    const messages = sliced.map(parseTranscriptLine).map(m => ({
      role: m.role,
      text: bound(m.text, this.maxMessageChars),
    }));

    return {
      taskId: task.taskId,
      roundKey: roundKey || `session:${sessionId}`,
      sessionId,
      messages,
      truncated: lines.length > sliced.length,
      lineCount: lines.length,
    };
  }

  async getLogTail(taskId: string): Promise<TaskLogTailDto> {
    const task = await this.requireTask(taskId);
    const logPath =
      task.runnerKind === 'review'
        ? task.reviewLogPath ?? task.logPath
        : task.logPath;

    if (!logPath) {
      return { taskId: task.taskId, lines: [], truncated: false, available: false };
    }

    try {
      const raw = await this.readFile(logPath);
      const all = raw.split(/\r?\n/);
      const sliced = all.slice(-this.maxLogLines).map(line => redactLogLine(line));
      return {
        taskId: task.taskId,
        lines: sliced.filter(l => l.length > 0 || sliced.length <= 5),
        truncated: all.length > sliced.length,
        available: true,
      };
    } catch {
      return { taskId: task.taskId, lines: [], truncated: false, available: false };
    }
  }

  private async requireTask(taskId: string): Promise<TaskRecord> {
    const task = await this.deps.taskProvider.getTaskById(taskId);
    if (!task) {
      throw new TaskManagerInputError('task-not-found', `Task ${taskId} not found`);
    }
    return task;
  }
}

function toRoundDto(
  entry: SessionHistoryEntry,
  index: number,
  available: Set<string>,
): TaskRoundDto {
  return {
    key: roundKeyFor(entry, index),
    round: entry.round,
    kind: entry.kind,
    agent: entry.agent,
    ...(entry.timestamp ? { at: entry.timestamp } : {}),
    ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
    ...(entry.sessionName ? { sessionName: entry.sessionName } : {}),
    hasTranscript: Boolean(entry.sessionId && available.has(entry.sessionId)),
  };
}

function fallbackRound(task: TaskRecord, available: Set<string>): TaskRoundDto | undefined {
  const sessionId = task.executionSessionId ?? task.reviewSessionId ?? task.sessionId;
  if (!sessionId && !task.runnerKind) return undefined;
  const kind = task.runnerKind === 'review' ? 'review' : 'execute';
  return {
    key: `live:${kind}:${sessionId ?? 'unknown'}`,
    round: task.runnerRound ?? task.reviewRound ?? 1,
    kind,
    agent: task.runnerAgent ?? task.targetAgent,
    ...(sessionId ? { sessionId } : {}),
    ...(task.sessionName ? { sessionName: task.sessionName } : {}),
    hasTranscript: Boolean(sessionId && available.has(sessionId)),
  };
}

function roundKeyFor(entry: SessionHistoryEntry, index: number): string {
  if (entry.sessionId) return `sid:${entry.sessionId}`;
  return `r${entry.round}-${entry.kind}-${index}`;
}

function parseTranscriptLine(line: string): TranscriptMessageDto {
  if (line.startsWith('⚙ ')) {
    return { role: 'tool', text: line.slice(2).trim() };
  }
  const idx = line.indexOf(':');
  if (idx > 0) {
    const roleRaw = line.slice(0, idx).trim().toLowerCase();
    const text = line.slice(idx + 1).trim();
    if (roleRaw === 'user' || roleRaw === 'assistant' || roleRaw === 'system' || roleRaw === 'tool') {
      return { role: roleRaw, text };
    }
  }
  return { role: 'unknown', text: line };
}

function bound(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Strip obvious home paths and token-like segments from log lines. */
function redactLogLine(line: string): string {
  return line
    .replace(/\/(?:Users|home)\/[^\s:]+/g, '~/…')
    .replace(/\b(?:ghp|sk|xox[baprs])-[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .slice(0, 2_000);
}
