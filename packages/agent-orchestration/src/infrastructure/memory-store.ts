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

  lockExists(key: string): boolean {
    return this.locks.has(key);
  }

  readLock(key: string): LockRecord | undefined {
    const lock = this.locks.get(key);
    return lock ? { ...lock } : undefined;
  }

  writeLock(key: string, record: LockRecord): void {
    if (!this.locks.has(key)) {
      return;
    }
    this.locks.set(key, { ...record });
  }

  removeLock(key: string): void {
    this.locks.delete(key);
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
