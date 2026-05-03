import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import { getPackageVersion } from '../../src/package-info';

describe('agent-task-loop local launcher', () => {
  it('runs from source when dist fallback is forced', async () => {
    const packageRoot = path.resolve(new URL('../..', import.meta.url).pathname);
    const binPath = path.join(packageRoot, 'bin', 'agent-task-loop.mjs');

    const result = await execa(process.execPath, [binPath, '--help'], {
      cwd: packageRoot,
      env: {
        ...process.env,
        AGENT_TASK_LOOP_FORCE_SOURCE: '1',
      },
      reject: false,
      all: true,
    });

    expect(result.exitCode).toBe(0);
  });

  it('reads the package version from package metadata', async () => {
    const packageRoot = path.resolve(new URL('../..', import.meta.url).pathname);
    const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
      version: string;
    };

    expect(getPackageVersion()).toBe(packageJson.version);
  });
});
