import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { timeAgo } from '../../src/tui/format';

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns — for undefined', () => {
    expect(timeAgo(undefined)).toBe('—');
  });

  it('shows seconds for recent times', () => {
    const date = new Date('2026-01-01T11:59:30Z').toISOString();
    expect(timeAgo(date)).toBe('30s ago');
  });

  it('shows minutes for times within an hour', () => {
    const date = new Date('2026-01-01T11:45:00Z').toISOString();
    expect(timeAgo(date)).toBe('15m ago');
  });

  it('shows hours for times within a day', () => {
    const date = new Date('2026-01-01T09:00:00Z').toISOString();
    expect(timeAgo(date)).toBe('3h ago');
  });

  it('shows days for older times', () => {
    const date = new Date('2025-12-30T12:00:00Z').toISOString();
    expect(timeAgo(date)).toBe('2d ago');
  });
});
