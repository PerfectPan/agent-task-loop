import { execa } from 'execa';

/** The spawn seam the git-backed services inject for tests. */
export type ExecLike = typeof execa;

/**
 * One `git` invocation through the injected runner: the abort signal, when the
 * caller carries one, becomes the child's cancel signal. The call stays
 * two-arg when there is no signal, so the runner's overload resolution (and
 * any test's argument assertions) see exactly the historical shape.
 */
export function runGit(exec: ExecLike, args: string[], signal?: AbortSignal) {
  signal?.throwIfAborted();
  return signal ? exec('git', args, { cancelSignal: signal }) : exec('git', args);
}
