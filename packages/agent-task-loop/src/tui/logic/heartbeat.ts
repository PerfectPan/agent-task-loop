import type { HeartbeatInfo, HeartbeatState, RunnerInfo } from '../types';

/** Below this age a heartbeat is "fresh" (runner clearly alive). */
export const HEARTBEAT_FRESH_MS = 15000;
/** Below this age (but >= fresh) a heartbeat is "stale"; beyond it is "dead". */
export const HEARTBEAT_STALE_MS = 60000;

/**
 * Classify a runner heartbeat by age relative to an injected `now`.
 *
 * - undefined / empty / unparseable timestamp => `{ state: 'none', ageMs: null }`
 * - ageMs is `now - parse(lastHeartbeatAt)`, with future heartbeats clamped to 0
 * - state: 'fresh' when ageMs < FRESH, 'stale' when < STALE, otherwise 'dead'
 */
export function heartbeatFreshness(
  lastHeartbeatAt: string | undefined,
  now: number,
): HeartbeatInfo {
  if (!lastHeartbeatAt || lastHeartbeatAt.trim() === '') {
    return { state: 'none', ageMs: null };
  }
  const parsed = Date.parse(lastHeartbeatAt);
  if (Number.isNaN(parsed)) {
    return { state: 'none', ageMs: null };
  }
  const ageMs = Math.max(0, now - parsed);
  const state: HeartbeatState =
    ageMs < HEARTBEAT_FRESH_MS ? 'fresh' : ageMs < HEARTBEAT_STALE_MS ? 'stale' : 'dead';
  return { state, ageMs };
}

/**
 * Compose a one-line runner descriptor like `execute · claude · r2 · pid 41822`,
 * omitting any absent fields. An empty runner renders as an em dash.
 */
export function runnerLabel(runner: RunnerInfo): string {
  const parts: string[] = [];
  if (runner.kind) {
    parts.push(runner.kind);
  }
  if (runner.agent) {
    parts.push(runner.agent);
  }
  if (runner.round !== undefined) {
    parts.push(`r${runner.round}`);
  }
  if (runner.pid !== undefined) {
    parts.push(`pid ${runner.pid}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}

/** Named ink color for a heartbeat state badge. */
export function heartbeatColor(state: HeartbeatState): string {
  switch (state) {
    case 'fresh':
      return 'green';
    case 'stale':
      return 'yellow';
    case 'dead':
      return 'red';
    case 'none':
      return 'gray';
  }
}
