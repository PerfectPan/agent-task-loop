import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { LockRecord, OrchestrationStore } from '../contracts/ports';
import type { RunSnapshot } from '../contracts/types';
import { sameLock } from '../domain/lock';
import { lockPath, runDir, statePath } from './node-paths';

export class FileOrchestrationStore implements OrchestrationStore {
  constructor(private readonly baseDir: string) {}

  tryCreateLock(key: string, record: LockRecord): boolean {
    return this.withLockGuard(key, () => {
      const file = lockPath(this.baseDir, key);
      if (existsSync(file)) return false;
      writeJsonAtomically(file, record);
      return true;
    });
  }

  tryReplaceLock(key: string, expected: LockRecord, next: LockRecord): boolean {
    return this.withLockGuard(key, () => {
      const file = lockPath(this.baseDir, key);
      const current = readJson<LockRecord>(file);
      if (!current || !sameLock(current, expected) || next.key !== key) return false;
      writeJsonAtomically(file, next);
      return true;
    });
  }

  tryCommitRun(expected: LockRecord, next: LockRecord, snapshot: RunSnapshot): boolean {
    return this.withLockGuard(expected.key, () => {
      const file = lockPath(this.baseDir, expected.key);
      const current = readJson<LockRecord>(file);
      if (!current || !sameLock(current, expected) || next.key !== expected.key || snapshot.key !== expected.key) {
        return false;
      }
      writeJsonAtomically(statePath(this.baseDir, snapshot.key), snapshot);
      writeJsonAtomically(file, next);
      return true;
    });
  }

  tryReleaseRun(expected: LockRecord, snapshot: RunSnapshot): boolean {
    return this.withLockGuard(expected.key, () => {
      const file = lockPath(this.baseDir, expected.key);
      const current = readJson<LockRecord>(file);
      if (!current || !sameLock(current, expected) || snapshot.key !== expected.key) return false;
      writeJsonAtomically(statePath(this.baseDir, snapshot.key), snapshot);
      unlinkSync(file);
      return true;
    });
  }

  lockExists(key: string): boolean {
    return existsSync(lockPath(this.baseDir, key));
  }

  readLock(key: string): LockRecord | undefined {
    return readJson(lockPath(this.baseDir, key));
  }

  writeState(snapshot: RunSnapshot): void {
    writeJsonAtomically(statePath(this.baseDir, snapshot.key), snapshot);
  }

  readState(key: string): RunSnapshot | undefined {
    return readJson(statePath(this.baseDir, key));
  }

  listKeys(): string[] {
    if (!existsSync(this.baseDir)) return [];
    const keys: string[] = [];
    for (const name of readdirSync(this.baseDir)) {
      const snapshot = readJson<RunSnapshot>(path.join(this.baseDir, name, 'state.json'));
      if (snapshot?.key) keys.push(snapshot.key);
    }
    return keys;
  }

  private withLockGuard(key: string, operation: () => boolean): boolean {
    const guard = `${lockPath(this.baseDir, key)}.guard`;
    mkdirSync(path.dirname(guard), { recursive: true });
    try {
      mkdirSync(guard);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
    try {
      return operation();
    } finally {
      rmSync(guard, { recursive: true, force: true });
    }
  }
}

export function removeRunDir(baseDir: string, key: string): void {
  rmSync(runDir(baseDir, key), { recursive: true, force: true });
}

function writeJsonAtomically(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), 'utf8');
  renameSync(tmp, file);
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}
