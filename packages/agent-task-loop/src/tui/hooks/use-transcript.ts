import { useEffect, useRef, useState } from 'react';
import type { SessionProvider } from '../data/session-provider';

export interface UseTranscriptResult {
  lines: string[];
  isLoading: boolean;
}

/**
 * Resolve the transcript for a single session id (one round of a task), via the
 * provider. Refetches whenever `sessionId` changes; yields `[]` when null. Stale
 * results are discarded if the id changed or the component unmounted.
 */
export function useTranscript(
  provider: SessionProvider,
  sessionId: string | null,
): UseTranscriptResult {
  const [lines, setLines] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const providerRef = useRef(provider);
  providerRef.current = provider;

  useEffect(() => {
    if (!sessionId) {
      setLines([]);
      setIsLoading(false);
      return;
    }
    let active = true;
    setIsLoading(true);
    Promise.resolve(providerRef.current.getTranscript(sessionId))
      .then(result => {
        if (active) setLines(result);
      })
      .catch(() => {
        if (active) setLines([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  return { lines, isLoading };
}
