import type { TaskRecord } from '../types/task';

/**
 * The loop-owned run-time fields of a {@link TaskRecord} — written by the loop
 * during execution and read back by `resume` / `watch` / `complete` / the TUI.
 *
 * Includes `status`: the lifecycle status is loop-owned for backends that cannot
 * represent intermediate states. A GitHub issue is only open/closed (待处理 /
 * 已完成), so 执行中 / 待复核 / 待发布 / 待验收 / 已失败 would otherwise vanish on
 * re-read, breaking every command that gates on status (`complete`, `reject`,
 * `cleanup`, `watch`, `start` recovery) and letting an in-flight task be
 * re-claimed. Mirroring it locally keeps the whole loop working across commands
 * on the same machine. Excludes pure task-definition fields (`taskId`, `title`,
 * `project`, `priority`, `targetAgent`, `source`, `recordId`, `createdAt`,
 * `description`, `repository`, `updatedAt`) which stay owned by the backend.
 */
export const RUNTIME_KEYS = [
  'status',
  'sessionId',
  'sessionName',
  'sessionHistory',
  'executionSessionId',
  'executionSessionName',
  'reviewSessionId',
  'reviewSessionName',
  'runnerPid',
  'runnerKind',
  'runnerAgent',
  'runnerRound',
  'lastHeartbeatAt',
  'workspacePath',
  'logPath',
  'reviewLogPath',
  'progressSummary',
  'claimedBy',
  'claimedAt',
  'runId',
  'currentOwner',
  'reviewRound',
  'reviewVerdict',
  'reviewFindings',
  'acceptanceRound',
  'acceptanceVerdict',
  'acceptanceFeedback',
  'resultSummary',
  'lastError',
  'prLink',
  'publishBranch',
  'publishCommit',
  'publishedAt',
] as const;

export type RuntimeKey = (typeof RUNTIME_KEYS)[number];

/** The mirrored run-time subset. Values may be cleared ('' / 0 / null) on purpose. */
export type RuntimeTaskState = { [K in RuntimeKey]?: TaskRecord[K] };

const RUNTIME_KEY_SET = new Set<string>(RUNTIME_KEYS);

/**
 * Projects any write payload (or record) onto {@link RUNTIME_KEYS}. Keys that are
 * present with a non-`undefined` value are kept — INCLUDING cleared values
 * (`''`, `0`, `null`) so a backend-side clear is recorded rather than dropped.
 */
export function pickRuntimeState(payload: object): RuntimeTaskState {
  const source = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (RUNTIME_KEY_SET.has(key) && source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out as RuntimeTaskState;
}

/**
 * Overlays stored run-time state onto a backend record. The local store is
 * authoritative for the run-time subset: any key PRESENT in `stored` (even with
 * a cleared value) overrides the record; keys absent from `stored` keep the
 * backend value. Key-presence — not truthiness — is what prevents resurrecting
 * a value the loop cleared.
 */
export function overlayRuntimeState(record: TaskRecord, stored: RuntimeTaskState | undefined): TaskRecord {
  if (!stored) {
    return record;
  }
  const merged: Record<string, unknown> = { ...record };
  for (const key of RUNTIME_KEYS) {
    if (Object.prototype.hasOwnProperty.call(stored, key)) {
      merged[key] = stored[key];
    }
  }
  return merged as unknown as TaskRecord;
}
