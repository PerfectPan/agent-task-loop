import type { ProcessRunner, RunSnapshot } from './types';

export interface LockRecord {
  key: string;
  holderPid: number;
  holderId: string;
  heartbeatAt: string;
}

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
