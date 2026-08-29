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
import type { RunSnapshot } from './types';
import { lockPath, runDir, statePath } from './paths';

export interface LockRecord {
  key: string;
  holderPid: number;
  heartbeatAt: string;
}

export interface OrchestrationStore {
  tryCreateLock(key: string, record: LockRecord): boolean;
  tryReplaceLock(key: string, expected: LockRecord, next: LockRecord): boolean;
  lockExists(key: string): boolean;
  readLock(key: string): LockRecord | undefined;
  writeLock(key: string, record: LockRecord): void;
  removeLock(key: string): void;
  writeState(snapshot: RunSnapshot): void;
  readState(key: string): RunSnapshot | undefined;
  listKeys(): string[];
}

export class FileOrchestrationStore implements OrchestrationStore {
  constructor(private readonly baseDir: string) {}

  tryCreateLock(key: string, record: LockRecord): boolean {
    const file = lockPath(this.baseDir, key);
    mkdirSync(path.dirname(file), { recursive: true });
    try {
      writeFileSync(file, JSON.stringify(record), { encoding: 'utf8', flag: 'wx' });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return false;
      }
      throw error;
    }
  }

  tryReplaceLock(key: string, expected: LockRecord, next: LockRecord): boolean {
    const current = this.readLock(key);
    if (!current || !sameLock(current, expected)) {
      return false;
    }
    try {
      unlinkSync(lockPath(this.baseDir, key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
    return this.tryCreateLock(key, next);
  }

  lockExists(key: string): boolean {
    return existsSync(lockPath(this.baseDir, key));
  }

  readLock(key: string): LockRecord | undefined {
    return readJson(lockPath(this.baseDir, key));
  }

  writeLock(key: string, record: LockRecord): void {
    const file = lockPath(this.baseDir, key);
    if (!existsSync(file)) {
      return;
    }
    writeFileSync(file, JSON.stringify(record), 'utf8');
  }

  removeLock(key: string): void {
    try {
      unlinkSync(lockPath(this.baseDir, key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  writeState(snapshot: RunSnapshot): void {
    const file = statePath(this.baseDir, snapshot.key);
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot), 'utf8');
    renameSync(tmp, file);
  }

  readState(key: string): RunSnapshot | undefined {
    return readJson(statePath(this.baseDir, key));
  }

  listKeys(): string[] {
    if (!existsSync(this.baseDir)) {
      return [];
    }
    const keys: string[] = [];
    for (const name of readdirSync(this.baseDir)) {
      const file = path.join(this.baseDir, name, 'state.json');
      const snapshot = readJson<RunSnapshot>(file);
      if (snapshot?.key) {
        keys.push(snapshot.key);
      }
    }
    return keys;
  }
}

/** Test helper: wipe a run directory. */
export function removeRunDir(baseDir: string, key: string): void {
  rmSync(runDir(baseDir, key), { recursive: true, force: true });
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

export function sameLock(a: LockRecord, b: LockRecord): boolean {
  return a.key === b.key && a.holderPid === b.holderPid && a.heartbeatAt === b.heartbeatAt;
}
