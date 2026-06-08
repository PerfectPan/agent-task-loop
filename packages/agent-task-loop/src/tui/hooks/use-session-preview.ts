import { useEffect, useRef, useState } from 'react';
import type { TaskRecord } from '../../types/task';
import type { Now, SessionPreview } from '../types';
import type { SessionProvider } from '../data/session-provider';

export interface UseSessionPreviewOptions {
  /** Poll interval in millis while enabled and a task is selected. */
  intervalMs: number;
  /** Injected clock; the returned value is forwarded to `getPreview`. */
  now: Now;
  /** When false, the initial fetch still runs but interval polling is off. */
  enabled?: boolean;
}

export interface UseSessionPreviewResult {
  preview: SessionPreview | null;
  isLoading: boolean;
}

/**
 * Subscribe to a task's session preview. Fetches immediately when a task is
 * selected, refetches on `intervalMs` while `enabled`, and refetches whenever
 * `task.taskId` changes. Returns `{ preview: null }` (and never fetches) when
 * `task` is null. Stale async results are discarded if the task changed or the
 * component unmounted in the meantime.
 */
export function useSessionPreview(
  provider: SessionProvider,
  task: TaskRecord | null,
  opts: UseSessionPreviewOptions,
): UseSessionPreviewResult {
  const { intervalMs, now, enabled = true } = opts;
  const [preview, setPreview] = useState<SessionPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Keep the latest values in refs so the effect can read them without
  // re-subscribing the interval on every render.
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const nowRef = useRef(now);
  nowRef.current = now;

  const taskId = task?.taskId ?? null;

  useEffect(() => {
    if (!task) {
      setPreview(null);
      setIsLoading(false);
      return;
    }

    let active = true;

    const fetchPreview = async () => {
      setIsLoading(true);
      try {
        const next = await providerRef.current.getPreview(
          task,
          nowRef.current(),
        );
        if (active) setPreview(next);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void fetchPreview();

    if (!enabled) {
      return () => {
        active = false;
      };
    }

    const timer = setInterval(() => {
      void fetchPreview();
    }, intervalMs);

    return () => {
      active = false;
      clearInterval(timer);
    };
    // `task` is intentionally keyed on `taskId`: a new id means a new session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, enabled, intervalMs]);

  return { preview, isLoading };
}
