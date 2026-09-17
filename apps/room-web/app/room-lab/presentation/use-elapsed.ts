import { useEffect, useRef, useState } from 'react';
import type { RoomLabAgentId } from '../read-model';

/**
 * The server does not record when a member started generating; the client
 * notices it in a poll and counts from there. The count is honest to about
 * one poll interval, and it is the only thing that can tell a 90-second wait
 * from a hung one.
 */
export function useElapsed(runningAgentIds: readonly RoomLabAgentId[]): (agentId: RoomLabAgentId) => number | undefined {
  const startedAt = useRef(new Map<RoomLabAgentId, number>());
  const [, setTick] = useState(0);
  const key = runningAgentIds.join(',');

  useEffect(() => {
    const now = Date.now();
    const running = new Set(runningAgentIds);
    for (const id of runningAgentIds) {
      if (!startedAt.current.has(id)) startedAt.current.set(id, now);
    }
    for (const id of [...startedAt.current.keys()]) {
      if (!running.has(id)) startedAt.current.delete(id);
    }
    setTick(tick => tick + 1);
    if (runningAgentIds.length === 0) return;
    const timer = window.setInterval(() => setTick(tick => tick + 1), 1000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return agentId => {
    const start = startedAt.current.get(agentId);
    return start === undefined ? undefined : Math.floor((Date.now() - start) / 1000);
  };
}
