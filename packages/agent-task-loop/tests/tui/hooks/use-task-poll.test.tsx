import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '../../../src/types/task';
import { useTaskPoll } from '../../../src/tui/hooks/use-task-poll';
import { stripAnsi } from '../helpers';

function task(taskId: string, status: TaskRecord['status'], updatedAt?: string): TaskRecord {
  return {
    taskId,
    title: `t-${taskId}`,
    description: '',
    project: 'p',
    targetAgent: 'claude',
    priority: 0,
    status,
    updatedAt,
  };
}

/** Tiny harness that renders the hook's observable state as one line of text. */
function Probe({ fetchTasks, intervalMs }: { fetchTasks: () => Promise<TaskRecord[]>; intervalMs: number }) {
  const { tasks, isLoading, error } = useTaskPoll(fetchTasks, { intervalMs });
  return <Text>{`${tasks.length}|${isLoading ? 'load' : 'idle'}|${error ?? '-'}`}</Text>;
}

/** Let the awaited fetch continuations + React commits settle under fake timers. */
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

describe('useTaskPoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches immediately on mount and populates tasks', async () => {
    const fetchTasks = vi.fn(async () => [task('a', '执行中')]);
    const { lastFrame } = render(<Probe fetchTasks={fetchTasks} intervalMs={1000} />);

    await flush();

    expect(fetchTasks).toHaveBeenCalledTimes(1);
    expect(stripAnsi(lastFrame() ?? '')).toBe('1|idle|-');
  });

  it('refetches after intervalMs and reflects new data', async () => {
    const fetchTasks = vi
      .fn<() => Promise<TaskRecord[]>>()
      .mockResolvedValueOnce([task('a', '执行中')])
      .mockResolvedValueOnce([task('a', '执行中'), task('b', '待处理')]);

    const { lastFrame } = render(<Probe fetchTasks={fetchTasks} intervalMs={1000} />);
    await flush();
    expect(stripAnsi(lastFrame() ?? '')).toBe('1|idle|-');

    await vi.advanceTimersByTimeAsync(1000);
    await flush();

    expect(fetchTasks).toHaveBeenCalledTimes(2);
    expect(stripAnsi(lastFrame() ?? '')).toBe('2|idle|-');
  });

  it('keeps the same array reference when the signature is unchanged', async () => {
    const seen: TaskRecord[][] = [];
    const fetchTasks = vi.fn(async () => [task('a', '执行中', '2026-06-07T00:00:00.000Z')]);

    function RefProbe() {
      const { tasks } = useTaskPoll(fetchTasks, { intervalMs: 1000 });
      seen.push(tasks);
      return <Text>{String(tasks.length)}</Text>;
    }

    render(<RefProbe />);
    await flush();
    const afterFirst = seen[seen.length - 1];

    // Second fetch returns a brand-new array with identical signature.
    await vi.advanceTimersByTimeAsync(1000);
    await flush();

    expect(fetchTasks).toHaveBeenCalledTimes(2);
    // No new tasks reference was committed: the latest render still has the
    // original array instance (signature did not change => no setState).
    expect(seen[seen.length - 1]).toBe(afterFirst);
  });

  it('captures a rejected fetch into the error string', async () => {
    const fetchTasks = vi.fn(async () => {
      throw new Error('boom');
    });
    const { lastFrame } = render(<Probe fetchTasks={fetchTasks} intervalMs={1000} />);

    await flush();

    expect(stripAnsi(lastFrame() ?? '')).toBe('0|idle|boom');
  });
});
