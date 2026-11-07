import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { execaProcessRunner } from './execa-runner.js';

const directories: string[][] = [];

afterEach(() => {
  for (const directory of directories.pop() ?? []) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('execaProcessRunner', () => {
  it('kills descendant processes when the cancel signal aborts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'execa-runner-'));
    directories.push([directory]);
    const pidFile = join(directory, 'grandchild.pid');

    const controller = new AbortController();
    const promise = execaProcessRunner({
      cmd: 'sh',
      args: ['-c', `sleep 30 & echo $! > '${pidFile}'; wait`],
      cwd: directory,
      env: {},
      signal: controller.signal,
    });

    // Wait until the grandchild (the background sleep) has written its pid.
    let grandchildPid = 0;
    for (let waited = 0; waited < 5_000; waited += 50) {
      try {
        grandchildPid = Number(readFileSync(pidFile, 'utf8').trim());
        if (grandchildPid > 0 && isAlive(grandchildPid)) {
          break;
        }
      } catch {
        // pid file not written yet
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(grandchildPid).toBeGreaterThan(0);
    expect(isAlive(grandchildPid)).toBe(true);

    controller.abort();
    const result = await promise;
    expect(result.exitCode).not.toBe(0);

    // killDescendants terminates the whole process group, so the grandchild dies too.
    let gone = false;
    for (let waited = 0; waited < 5_000; waited += 50) {
      if (!isAlive(grandchildPid)) {
        gone = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(gone).toBe(true);
  });
});
