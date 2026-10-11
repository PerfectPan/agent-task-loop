import type { RunSnapshot } from './types';

/**
 * Run-state persistence for the Task pipeline's own orchestration. The
 * occupancy lease itself is the kit's `/lease`, reached through
 * `orchestration/lease.ts`.
 */
export interface RunStateStore {
  writeState(snapshot: RunSnapshot): void;
  readState(key: string): RunSnapshot | undefined;
  listKeys(): string[];
}
