import { execa } from 'execa';
import type { ProcessRunner } from '../contracts/types';

export const execaProcessRunner: ProcessRunner = async input => {
  const subprocess = execa(input.cmd, input.args, {
    cwd: input.cwd,
    env: { ...process.env, ...input.env },
    reject: false,
    stdin: 'ignore',
  });
  input.onSpawn?.(subprocess.pid);
  const result = await subprocess;
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 1,
  };
};
