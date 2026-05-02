import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readLogDelta } from '../../src/commands/watch';

describe('watch log reading', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('starts from the recent tail instead of reading the whole log', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-watch-'));
    const logPath = path.join(tempDir, 'runner.log');
    await writeFile(logPath, '0123456789abcdef', 'utf8');

    const delta = await readLogDelta(logPath, undefined, 6);

    expect(delta.chunk).toBe('abcdef');
    expect(delta.nextOffset).toBe(16);
  });

  it('continues from the returned offset after the initial tail', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-watch-'));
    const logPath = path.join(tempDir, 'runner.log');
    await writeFile(logPath, '0123456789abcdef', 'utf8');

    const first = await readLogDelta(logPath, undefined, 6);
    await writeFile(logPath, '0123456789abcdefXYZ', 'utf8');
    const second = await readLogDelta(logPath, first.nextOffset, 6);

    expect(second.chunk).toBe('XYZ');
    expect(second.nextOffset).toBe(19);
  });
});
