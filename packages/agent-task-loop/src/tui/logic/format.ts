import type { TaskRecord } from '../../types/task';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A single label/value row rendered in the detail pane. */
export interface DetailField {
  label: string;
  value: string;
}

/**
 * Render a coarse relative-time string for an ISO timestamp.
 *
 * Returns '—' when `iso` is missing/empty/unparseable. Otherwise buckets the
 * elapsed time as 'Ns ago' (<60s), 'Nm ago' (<60m), 'Nh ago' (<24h) or
 * 'Nd ago' (>=24h). Future timestamps clamp to '0s ago'.
 *
 * @param iso ISO-8601 timestamp (or undefined).
 * @param now Current time as epoch ms (injected clock).
 */
export function timeAgo(iso: string | undefined, now: number): string {
  if (!iso) {
    return '—';
  }
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return '—';
  }
  const elapsed = Math.max(0, now - then);
  if (elapsed < MINUTE_MS) {
    return `${Math.floor(elapsed / 1000)}s ago`;
  }
  if (elapsed < HOUR_MS) {
    return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  }
  if (elapsed < DAY_MS) {
    return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  }
  return `${Math.floor(elapsed / DAY_MS)}d ago`;
}

/** Format a numeric priority as the conventional 'P{n}' label. */
export function formatPriority(priority: number): string {
  return `P${priority}`;
}

/**
 * Build the ordered label/value rows for the detail pane, omitting any field
 * whose value is empty or undefined. progressSummary / lastError are rendered
 * in their own sections and are intentionally excluded here.
 *
 * @param task The task record to describe.
 * @param now Current time as epoch ms (injected clock for the 更新 field).
 */
export function formatDetailFields(task: TaskRecord, now: number): DetailField[] {
  const candidates: DetailField[] = [
    { label: '状态', value: task.status },
    { label: 'Agent', value: task.targetAgent },
    { label: '项目', value: task.project },
    { label: '负责人', value: task.currentOwner ?? '' },
    { label: '轮次', value: task.reviewRound === undefined ? '' : String(task.reviewRound) },
    { label: 'PR', value: task.prLink ?? '' },
    { label: '更新', value: task.updatedAt ? timeAgo(task.updatedAt, now) : '' },
  ];
  return candidates.filter(field => field.value !== '');
}
