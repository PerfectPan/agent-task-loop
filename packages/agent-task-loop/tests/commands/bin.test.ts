import path from 'node:path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

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
});
