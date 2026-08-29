import type { LockRecord, OrchestrationStore } from '../contracts/ports';
import type { RunSnapshot } from '../contracts/types';
import { sameLock } from '../domain/lock';

export class MemoryOrchestrationStore implements OrchestrationStore {
  private readonly locks = new Map<string, LockRecord>();
  private readonly states = new Map<string, RunSnapshot>();

  tryCreateLock(key: string, record: LockRecord): boolean {
    if (this.locks.has(key)) {
      return false;
    }
    this.locks.set(key, { ...record });
    return true;
  }

  tryReplaceLock(key: string, expected: LockRecord, next: LockRecord): boolean {
    const current = this.locks.get(key);
    if (!current || !sameLock(current, expected)) {
      return false;
    }
    this.locks.set(key, { ...next });
    return true;
  }

  tryCommitRun(expected: LockRecord, next: LockRecord, snapshot: RunSnapshot): boolean {
    const current = this.locks.get(expected.key);
    if (!current || !sameLock(current, expected) || next.key !== expected.key || snapshot.key !== expected.key) {
      return false;
    }
    this.states.set(snapshot.key, structuredClone(snapshot));
    this.locks.set(next.key, { ...next });
    return true;
  }

  tryReleaseRun(expected: LockRecord, snapshot: RunSnapshot): boolean {
    const current = this.locks.get(expected.key);
    if (!current || !sameLock(current, expected) || snapshot.key !== expected.key) {
      return false;
    }
    this.states.set(snapshot.key, structuredClone(snapshot));
    this.locks.delete(expected.key);
    return true;
  }

  lockExists(key: string): boolean {
    return this.locks.has(key);
  }

  readLock(key: string): LockRecord | undefined {
    const lock = this.locks.get(key);
    return lock ? { ...lock } : undefined;
  }

  writeState(snapshot: RunSnapshot): void {
    this.states.set(snapshot.key, structuredClone(snapshot));
  }

  readState(key: string): RunSnapshot | undefined {
    const snapshot = this.states.get(key);
    return snapshot ? structuredClone(snapshot) : undefined;
  }

  listKeys(): string[] {
    return [...this.states.keys()];
  }
}
