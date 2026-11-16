import type { TaskRunnerKind } from '../task-management/task-provider';

/** The runner identity a heartbeat write carries. */
export interface RunnerHeartbeat {
  runnerPid?: number;
  runnerKind: TaskRunnerKind;
  runnerAgent: string;
  runnerRound: number;
  lastHeartbeatAt: string;
}

/**
 * The heartbeat loop a runner loop shares: at most one write per interval, the
 * timestamp advancing on every persist, and the caller's own persistence seam
 * (`this.persist`, a mutation fence) carrying the write. A write failure is
 * reported, not raised — the run continues on a stale heartbeat.
 */
export function createHeartbeatWriter(options: {
  signal?: AbortSignal;
  /** Throttle interval in milliseconds between persisted beats. */
  readonly intervalMs?: number;
  /** Who runs and at which round; the pid changes as the child restarts. */
  readonly runner: { readonly agent: string; readonly round: number };
  /** The persistence seam: the caller's own transaction/fence wrapper. */
  readonly persist: (update: RunnerHeartbeat) => Promise<void>;
  /** Called with a failed write when the caller wants more than the log line. */
  readonly onHeartbeatError?: (error: unknown) => void;
}) {
  const intervalMs = options.intervalMs ?? 15_000;
  let latestRunnerPid: number | undefined;
  let latestHeartbeatAt = new Date().toISOString();
  let lastHeartbeatPersistedAt = 0;

  const write = async (): Promise<void> => {
    latestHeartbeatAt = new Date().toISOString();
    lastHeartbeatPersistedAt = Date.now();
    try {
      await options.persist({
        runnerPid: latestRunnerPid,
        runnerKind: 'execute',
        runnerAgent: options.runner.agent,
        runnerRound: options.runner.round,
        lastHeartbeatAt: latestHeartbeatAt,
      });
    } catch (error) {
      options.signal?.throwIfAborted();
      if (options.onHeartbeatError) {
        options.onHeartbeatError(error);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\n[agent-task-loop] heartbeat update failed: ${message}\n`);
      }
    }
    options.signal?.throwIfAborted();
  };

  return {
    /** Records the child's pid for the next persisted beat. */
    pid(pid: number | undefined): void {
      latestRunnerPid = pid;
    },
    /** The timestamp the progress writes should carry. */
    get timestamp(): string {
      return latestHeartbeatAt;
    },
    /** The runner identity as the current write carries it. */
    payload(): RunnerHeartbeat {
      return {
        runnerPid: latestRunnerPid,
        runnerKind: 'execute',
        runnerAgent: options.runner.agent,
        runnerRound: options.runner.round,
        lastHeartbeatAt: latestHeartbeatAt,
      };
    },
    /** The spawn/heartbeat callback pair a runner loop hands its adapter. */
    callbacks(): {
      onSpawn: (payload: { pid?: number }) => Promise<void>;
      onHeartbeat: () => Promise<void>;
    } {
      return {
        onSpawn: async (payload) => {
          this.pid(payload.pid);
          await this.persist(true);
        },
        onHeartbeat: async () => {
          await this.persist();
        },
      };
    },
    /** Persists a beat unless one was persisted within the interval. */
    async persist(force = false): Promise<void> {
      options.signal?.throwIfAborted();
      const now = Date.now();
      if (!force && now - lastHeartbeatPersistedAt < intervalMs) {
        return;
      }
      await write();
    },
  };
}
