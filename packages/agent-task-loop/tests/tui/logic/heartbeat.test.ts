import { describe, expect, it } from 'vitest';
import {
  HEARTBEAT_FRESH_MS,
  HEARTBEAT_STALE_MS,
  heartbeatColor,
  heartbeatFreshness,
  runnerLabel,
} from '../../../src/tui/logic/heartbeat';
import type { RunnerInfo } from '../../../src/tui/types';
import { fixedNow, isoSecondsAgo } from '../helpers';

describe('heartbeat thresholds', () => {
  it('exposes the documented threshold constants', () => {
    expect(HEARTBEAT_FRESH_MS).toBe(15000);
    expect(HEARTBEAT_STALE_MS).toBe(60000);
  });
});

describe('heartbeatFreshness', () => {
  it('marks 14s ago as fresh', () => {
    expect(heartbeatFreshness(isoSecondsAgo(14), fixedNow())).toEqual({
      state: 'fresh',
      ageMs: 14000,
    });
  });

  it('marks the 15s boundary as stale (fresh is exclusive)', () => {
    expect(heartbeatFreshness(isoSecondsAgo(15), fixedNow())).toEqual({
      state: 'stale',
      ageMs: 15000,
    });
  });

  it('marks 59s ago as stale', () => {
    expect(heartbeatFreshness(isoSecondsAgo(59), fixedNow())).toEqual({
      state: 'stale',
      ageMs: 59000,
    });
  });

  it('marks the 60s boundary as dead (stale is exclusive)', () => {
    expect(heartbeatFreshness(isoSecondsAgo(60), fixedNow())).toEqual({
      state: 'dead',
      ageMs: 60000,
    });
  });

  it('marks 120s ago as dead', () => {
    expect(heartbeatFreshness(isoSecondsAgo(120), fixedNow())).toEqual({
      state: 'dead',
      ageMs: 120000,
    });
  });

  it('returns none for undefined', () => {
    expect(heartbeatFreshness(undefined, fixedNow())).toEqual({
      state: 'none',
      ageMs: null,
    });
  });

  it('returns none for empty / whitespace strings', () => {
    expect(heartbeatFreshness('', fixedNow())).toEqual({ state: 'none', ageMs: null });
    expect(heartbeatFreshness('   ', fixedNow())).toEqual({ state: 'none', ageMs: null });
  });

  it('returns none for unparseable timestamps', () => {
    expect(heartbeatFreshness('not-a-date', fixedNow())).toEqual({
      state: 'none',
      ageMs: null,
    });
  });

  it('clamps a future heartbeat to age 0 and fresh', () => {
    expect(heartbeatFreshness(isoSecondsAgo(-30), fixedNow())).toEqual({
      state: 'fresh',
      ageMs: 0,
    });
  });
});

describe('runnerLabel', () => {
  it('composes kind, agent, round and pid', () => {
    const runner: RunnerInfo = { kind: 'execute', agent: 'claude', round: 2, pid: 41822 };
    expect(runnerLabel(runner)).toBe('execute · claude · r2 · pid 41822');
  });

  it('omits absent parts', () => {
    expect(runnerLabel({ kind: 'review', agent: 'codex' })).toBe('review · codex');
    expect(runnerLabel({ agent: 'glm', pid: 7 })).toBe('glm · pid 7');
    expect(runnerLabel({ round: 3 })).toBe('r3');
  });

  it('renders an em dash for an empty runner', () => {
    expect(runnerLabel({})).toBe('—');
  });
});

describe('heartbeatColor', () => {
  it('maps each state to a named ink color', () => {
    expect(heartbeatColor('fresh')).toBe('green');
    expect(heartbeatColor('stale')).toBe('yellow');
    expect(heartbeatColor('dead')).toBe('red');
    expect(heartbeatColor('none')).toBe('gray');
  });
});
