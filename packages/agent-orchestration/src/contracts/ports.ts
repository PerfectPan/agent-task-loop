import type { ProcessRunner, RunSnapshot } from './types';

export interface LockRecord {
  key: string;
  holderPid: number;
  holderId: string;
  heartbeatAt: string;
}

/**
 * Stable ownership token used to serialize writes to resources outside the
 * orchestration store. `heartbeatAt` is deliberately excluded: heartbeats may
 * advance while one fenced write is in flight without changing its owner.
 */
export type FencingToken = Pick<LockRecord, 'key' | 'holderPid' | 'holderId'>;

export type FencedResult<T> =
  | { executed: true; value: T }
  | { executed: false };

export interface OrchestrationStore {
  tryCreateLock(key: string, record: LockRecord): boolean;
  tryReplaceLock(key: string, expected: LockRecord, next: LockRecord): boolean;
  tryCommitRun(expected: LockRecord, next: LockRecord, snapshot: RunSnapshot): boolean;
  tryReleaseRun(expected: LockRecord, snapshot: RunSnapshot): boolean;
  lockExists(key: string): boolean;
  readLock(key: string): LockRecord | undefined;
  writeState(snapshot: RunSnapshot): void;
  readState(key: string): RunSnapshot | undefined;
  listKeys(): string[];
  runFenced<T>(
    token: FencingToken,
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<FencedResult<T>>;
}

export interface Clock {
  now(): number;
}

export interface ProcessIdentity {
  pid: number;
}

export interface ProcessLiveness {
  isAlive(pid: number): boolean;
}

export interface IntervalHandle {
  unref?(): void;
}

export interface IntervalScheduler {
  setInterval(fn: () => void, ms: number): IntervalHandle;
  clearInterval(handle: IntervalHandle): void;
}

export type { ProcessRunner };
