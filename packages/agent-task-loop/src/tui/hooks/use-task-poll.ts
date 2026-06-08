import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskRecord } from '../../types/task';
import type { FetchTasks } from '../types';

/** Options controlling the polling cadence. */
export interface UseTaskPollOptions {
  /** Delay between polls in millis. */
  intervalMs: number;
  /** When false, no fetching happens (and any running interval is cleared). Defaults to true. */
  enabled?: boolean;
}

/** What the hook hands back to the dashboard. */
export interface UseTaskPollResult {
  tasks: TaskRecord[];
  isLoading: boolean;
  error: string | null;
  /** Epoch millis of the last completed fetch (success or failure), or null before the first. */
  lastFetchedAt: number | null;
  /** Trigger an out-of-band refetch (e.g. on a keypress). */
  refetch: () => void;
}

/**
 * Cheap change-detection key for a task list: only the fields that should force
 * a re-render. Two lists with the same signature are treated as equal so we can
 * keep the previous array reference and skip a render.
 */
function signatureOf(tasks: TaskRecord[]): string {
  return tasks
    .map((t) => `${t.taskId}:${t.status}:${t.updatedAt ?? ''}:${t.lastHeartbeatAt ?? ''}`)
    .join('|');
}

/**
 * Poll a TaskProvider on an interval, exposing the latest tasks plus loading and
 * error state. Fetches immediately on mount, then every `intervalMs` while
 * `enabled`. To avoid render thrash, the tasks array reference is only replaced
 * when its signature actually changes.
 */
export function useTaskPoll(
  fetchTasks: FetchTasks,
  opts: UseTaskPollOptions,
): UseTaskPollResult {
  const { intervalMs, enabled = true } = opts;

  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  // Latest signature, kept in a ref so the equality check never needs a render.
  const signatureRef = useRef<string | null>(null);
  // Latest fetcher, so the polling effect doesn't restart on every render.
  const fetchRef = useRef(fetchTasks);
  fetchRef.current = fetchTasks;
  // Guards against state writes after unmount.
  const mountedRef = useRef(true);

  const runFetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await fetchRef.current();
      if (!mountedRef.current) return;
      const nextSig = signatureOf(next);
      if (nextSig !== signatureRef.current) {
        signatureRef.current = nextSig;
        setTasks(next);
      }
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setLastFetchedAt(Date.now());
      }
    }
  }, []);

  const refetch = useCallback(() => {
    void runFetch();
  }, [runFetch]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void runFetch();
    const id = setInterval(() => {
      void runFetch();
    }, intervalMs);
    return () => {
      clearInterval(id);
    };
  }, [enabled, intervalMs, runFetch]);

  return { tasks, isLoading, error, lastFetchedAt, refetch };
}
