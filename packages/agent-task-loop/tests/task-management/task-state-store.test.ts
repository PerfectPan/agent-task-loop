import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileTaskStateStore, stateFilePath } from '../../src/task-management/task-state-store';

let dir: string;
let store: FileTaskStateStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atl-state-'));
  store = new FileTaskStateStore(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('FileTaskStateStore', () => {
  it('round-trips a merged patch', () => {
    store.merge('github:o/r', '7', { executionSessionId: 'sess-1', runnerPid: 42 });
    expect(store.read('github:o/r', '7')).toEqual({ executionSessionId: 'sess-1', runnerPid: 42 });
  });

  it('shallow-merges successive patches and records cleared values', () => {
    store.merge('github:o/r', '7', { executionSessionId: 'sess-1', progressSummary: 'mid' });
    store.merge('github:o/r', '7', { progressSummary: '' });
    expect(store.read('github:o/r', '7')).toEqual({ executionSessionId: 'sess-1', progressSummary: '' });
  });

  it('returns undefined for an unknown key', () => {
    expect(store.read('github:o/r', '999')).toBeUndefined();
  });

  it('sanitizes the source into a path and keeps sources separate', () => {
    store.merge('github:o/r', '7', { runId: 'a' });
    store.merge('feishu', '7', { runId: 'b' });
    expect(store.read('github:o/r', '7')).toEqual({ runId: 'a' });
    expect(store.read('feishu', '7')).toEqual({ runId: 'b' });
    // no ':' or '/' in on-disk dir names
    expect(readdirSync(dir).every(name => !name.includes(':') && !name.includes('/'))).toBe(true);
  });

  it('does not collide sources that naive sanitize would merge', () => {
    // Both would map to "github_a_b_c" under a lossy `_`-replacement scheme.
    store.merge('github:a_b/c', '1', { runId: 'x' });
    store.merge('github:a/b_c', '1', { runId: 'y' });
    expect(store.read('github:a_b/c', '1')).toEqual({ runId: 'x' });
    expect(store.read('github:a/b_c', '1')).toEqual({ runId: 'y' });
  });

  it('clear removes the entry', () => {
    store.merge('github:o/r', '7', { runId: 'a' });
    store.clear('github:o/r', '7');
    expect(store.read('github:o/r', '7')).toBeUndefined();
  });

  it('reflects an external (cross-process) write via mtime-aware cache', () => {
    store.merge('github:o/r', '7', { runId: 'a' });
    expect(store.read('github:o/r', '7')).toEqual({ runId: 'a' });
    // Simulate another process overwriting the file with a newer mtime.
    const file = stateFilePath(dir, 'github:o/r', '7');
    writeFileSync(file, JSON.stringify({ runId: 'b' }), 'utf8');
    const future = new Date(Date.now() + 5000);
    utimesSync(file, future, future);
    expect(store.read('github:o/r', '7')).toEqual({ runId: 'b' });
  });

  it('degrades to undefined on a corrupt file (best-effort)', () => {
    store.merge('github:o/r', '7', { runId: 'a' });
    writeFileSync(stateFilePath(dir, 'github:o/r', '7'), '{ not json', 'utf8');
    expect(store.read('github:o/r', '7')).toBeUndefined();
  });

  it('prune removes files older than maxAgeMs', () => {
    store.merge('github:o/r', '7', { runId: 'a' });
    const file = stateFilePath(dir, 'github:o/r', '7');
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    utimesSync(file, old, old);
    store.prune(30 * 24 * 3600 * 1000);
    expect(existsSync(file)).toBe(false);
    expect(store.read('github:o/r', '7')).toBeUndefined();
  });

  it('writes valid JSON on disk', () => {
    store.merge('github:o/r', '7', { runId: 'a', runnerPid: 1 });
    const raw = readFileSync(stateFilePath(dir, 'github:o/r', '7'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ runId: 'a', runnerPid: 1 });
  });
});
