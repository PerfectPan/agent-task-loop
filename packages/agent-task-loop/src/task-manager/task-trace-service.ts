import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  FsSessionProvider as SharedFsSessionProvider,
  type TranscriptEntry,
} from '@rivus/agent-sessions';
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
  role: 'user' | 'assistant' | 'system' | 'tool' | 'reasoning' | 'unknown';
  text: string;
  toolName?: string;
  at?: string;
}

export interface TaskTranscriptDto {
  taskId: string;
  roundKey: string;
  sessionId?: string;
  messages: TranscriptMessageDto[];
  truncated: boolean;
  lineCount: number;
  /** Counts by role after filtering — helps UI empty states. */
  roleCounts: Record<string, number>;
}

export interface TaskLogTailDto {
  taskId: string;
  lines: string[];
  truncated: boolean;
  available: boolean;
}

export interface TaskTraceSessionSource {
  getTranscript(sessionId: string, maxLines?: number): Promise<TranscriptEntry[]>;
  listSessionIds(): Promise<string[]>;
}

export interface TaskTraceServiceDependencies {
  taskProvider: Pick<TaskProvider, 'getTaskById'>;
  /** Inject structured session source in tests. Default: local agent-sessions FS index. */
  sessionSource?: TaskTraceSessionSource;
  readFile?: (path: string) => Promise<string>;
  maxTranscriptLines?: number;
  maxLogLines?: number;
  maxMessageChars?: number;
  /** When true, drop pure reasoning turns (default true for readability). */
  hideReasoning?: boolean;
}

/**
 * Read-only task execution evidence for the desktop console.
 * SessionHistory index + structured agent-sessions transcripts (not toLines collapse).
 */
export class TaskTraceService {
  private readonly sessions: TaskTraceSessionSource;
  private readonly readFile: (path: string) => Promise<string>;
  private readonly maxTranscriptLines: number;
  private readonly maxLogLines: number;
  private readonly maxMessageChars: number;
  private readonly hideReasoning: boolean;

  constructor(private readonly deps: TaskTraceServiceDependencies) {
    this.sessions = deps.sessionSource ?? createDefaultSessionSource();
    this.readFile = deps.readFile ?? (path => readFile(path, 'utf8'));
    this.maxTranscriptLines = deps.maxTranscriptLines ?? 200;
    this.maxLogLines = deps.maxLogLines ?? 120;
    this.maxMessageChars = deps.maxMessageChars ?? 8_000;
    this.hideReasoning = deps.hideReasoning ?? true;
  }

  async listRounds(taskId: string): Promise<{ taskId: string; rounds: TaskRoundDto[] }> {
    const task = await this.requireTask(taskId);
    const history = parseSessionHistory(task.sessionHistory);
    const available = new Set(await this.sessions.listSessionIds().catch(() => [] as string[]));

    for (const id of [task.sessionId, task.executionSessionId, task.reviewSessionId]) {
      if (id) available.add(id);
    }

    const rounds = history.map((entry, index) => toRoundDto(entry, index, available));
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
      return emptyTranscript(task.taskId, roundKey || 'none');
    }

    const entries = await this.sessions.getTranscript(sessionId, this.maxTranscriptLines * 2);
    const filtered = this.hideReasoning
      ? entries.filter(e => normalizeRole(e.role) !== 'reasoning')
      : entries;
    const sliced = filtered.slice(-this.maxTranscriptLines);
    const messages = sliced.map(e => toMessageDto(e, this.maxMessageChars));
    const roleCounts: Record<string, number> = {};
    for (const m of messages) {
      roleCounts[m.role] = (roleCounts[m.role] ?? 0) + 1;
    }

    return {
      taskId: task.taskId,
      roundKey: roundKey || `session:${sessionId}`,
      sessionId,
      messages,
      truncated: filtered.length > sliced.length,
      lineCount: filtered.length,
      roleCounts,
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
        lines: sliced,
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

function createDefaultSessionSource(): TaskTraceSessionSource {
  const home = homedir();
  const roots = [
    { path: join(home, '.codex', 'sessions'), agent: 'unknown' as const },
    { path: join(home, '.claude', 'projects'), agent: 'unknown' as const },
  ];
  const provider = new SharedFsSessionProvider({
    agent: 'unknown',
    roots,
  });
  return {
    getTranscript: (id, max) => provider.getTranscript(id, max),
    listSessionIds: async () => (await provider.list()).map(s => s.id),
  };
}

function emptyTranscript(taskId: string, roundKey: string): TaskTranscriptDto {
  return {
    taskId,
    roundKey,
    messages: [],
    truncated: false,
    lineCount: 0,
    roleCounts: {},
  };
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

function normalizeRole(role: string): TranscriptMessageDto['role'] {
  const r = role.toLowerCase();
  if (r === 'user' || r === 'assistant' || r === 'system' || r === 'tool' || r === 'reasoning') {
    return r;
  }
  return 'unknown';
}

function toMessageDto(entry: TranscriptEntry, maxChars: number): TranscriptMessageDto {
  const role = normalizeRole(entry.role);
  const text = bound(preserveNewlines(entry.text), maxChars);
  return {
    role,
    text,
    ...(entry.toolName ? { toolName: entry.toolName } : role === 'tool' && entry.text ? { toolName: entry.text } : {}),
    ...(entry.timestamp ? { at: entry.timestamp } : {}),
  };
}

/** Keep paragraph breaks; strip JSON-illegal control chars (except \\n/\\t). */
function preserveNewlines(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function bound(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}\n…` : value;
}

function redactLogLine(line: string): string {
  return line
    .replace(/\/(?:Users|home)\/[^\s:]+/g, '~/…')
    .replace(/\b(?:ghp|sk|xox[baprs])-[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .slice(0, 2_000);
}
