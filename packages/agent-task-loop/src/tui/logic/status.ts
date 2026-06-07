import { TASK_STATUSES, type TaskStatus } from '../../types/task';

/**
 * Coarse grouping of the 10 task statuses into the buckets the dashboard tabs
 * filter on. Every TaskStatus maps to exactly one bucket — enforced by a test
 * so a newly added status can never silently fall through and disappear from
 * every tab.
 */
export type StatusBucket = 'running' | 'queued' | 'needs-input' | 'done';

export interface StatusConfig {
  /** Single-cell glyph shown in the list badge. */
  glyph: string;
  /** Named ink color (works on light & dark terminals, degrades w/o truecolor). */
  color: string;
  /** Human label — the Chinese status itself. */
  label: TaskStatus;
  /** Which tab bucket this status belongs to. */
  bucket: StatusBucket;
  /** Whether an agent/pipeline is actively working — drives the live spinner. */
  live: boolean;
}

export const STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  待处理: { glyph: '◌', color: 'gray', label: '待处理', bucket: 'queued', live: false },
  进行中: { glyph: '◉', color: 'yellow', label: '进行中', bucket: 'running', live: false },
  执行中: { glyph: '●', color: 'green', label: '执行中', bucket: 'running', live: true },
  待复核: { glyph: '◎', color: 'cyan', label: '待复核', bucket: 'running', live: false },
  修复中: { glyph: '●', color: 'yellow', label: '修复中', bucket: 'running', live: true },
  待决策: { glyph: '◆', color: 'magenta', label: '待决策', bucket: 'needs-input', live: false },
  待发布: { glyph: '↑', color: 'blue', label: '待发布', bucket: 'running', live: false },
  待验收: { glyph: '◈', color: 'cyan', label: '待验收', bucket: 'needs-input', live: false },
  已完成: { glyph: '✓', color: 'green', label: '已完成', bucket: 'done', live: false },
  已失败: { glyph: '✗', color: 'red', label: '已失败', bucket: 'done', live: false },
};

const FALLBACK: StatusConfig = { glyph: '?', color: 'white', label: '待处理', bucket: 'queued', live: false };

/** Safe lookup — never throws on an unexpected status string. */
export function statusConfig(status: TaskStatus): StatusConfig {
  return STATUS_CONFIG[status] ?? FALLBACK;
}

export function bucketOf(status: TaskStatus): StatusBucket {
  return statusConfig(status).bucket;
}

export function statusColor(status: TaskStatus): string {
  return statusConfig(status).color;
}

export function isLiveStatus(status: TaskStatus): boolean {
  return statusConfig(status).live;
}

/**
 * Sort weight: most "urgent / in-flight" first, terminal states last. Used as
 * the primary sort key before priority. Lower = earlier.
 */
export const STATUS_ORDER: Record<TaskStatus, number> = {
  执行中: 0,
  修复中: 1,
  待复核: 2,
  待决策: 3,
  待验收: 4,
  待发布: 5,
  进行中: 6,
  待处理: 7,
  已失败: 8,
  已完成: 9,
};

export function statusWeight(status: TaskStatus): number {
  return STATUS_ORDER[status] ?? 99;
}

export type TabKey = 'active' | 'needs-input' | 'done' | 'all';

export interface TabDef {
  key: TabKey;
  label: string;
  /** Buckets this tab includes; null = every task. */
  buckets: StatusBucket[] | null;
}

/**
 * Tabs are filtered slices of the one task list. "Active" folds running +
 * queued so freshly-created (待处理) tasks are never hidden behind only "All".
 */
export const TABS: readonly TabDef[] = [
  { key: 'active', label: 'Active', buckets: ['running', 'queued'] },
  { key: 'needs-input', label: 'Needs Input', buckets: ['needs-input'] },
  { key: 'done', label: 'Done', buckets: ['done'] },
  { key: 'all', label: 'All', buckets: null },
];

export function tabIncludes(tab: TabKey, status: TaskStatus): boolean {
  const def = TABS.find(t => t.key === tab);
  if (!def || def.buckets === null) {
    return true;
  }
  return def.buckets.includes(bucketOf(status));
}

/** All statuses, handy for exhaustiveness tests and demo coverage. */
export const ALL_STATUSES = TASK_STATUSES;
