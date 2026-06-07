import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import type { TaskRecord } from '../../../src/types/task';
import type { SessionPreview } from '../../../src/tui/types';
import { useSessionPreview } from '../../../src/tui/hooks/use-session-preview';
import type { SessionProvider } from '../../../src/tui/data/session-provider';
import { FIXED_NOW, stripAnsi } from '../helpers';

const INTERVAL = 1000;

function makeTask(taskId: string): TaskRecord {
  return {
    taskId,
    title: `title-${taskId}`,
    description: 'd',
    project: 'p',
    targetAgent: 'claude',
    priority: 1,
    status: '执行中',
  };
}

function previewFor(task: TaskRecord): SessionPreview {
  return {
    taskId: task.taskId,
    runner: {},
    heartbeat: { state: 'none', ageMs: null },
    history: [],
    logTail: [],
    hasLog: false,
    live: false,
  };
}

/** Hand-rolled fake provider whose getPreview echoes the task id. */
function makeFakeProvider(): SessionProvider & { getPreview: ReturnType<typeof vi.fn> } {
  const getPreview = vi.fn((task: TaskRecord, _now: number) => previewFor(task));
  return { getPreview, getTranscript: async () => [] };
}

function lastFrame(frame: string | undefined): string {
  return stripAnsi(frame ?? '');
}

describe('useSessionPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('returns null preview and does not fetch when task is null', () => {
    const provider = makeFakeProvider();
    const { lastFrame: frame } = render(
      <ProbeReal provider={provider} task={null} />,
    );
    expect(provider.getPreview).not.toHaveBeenCalled();
    expect(lastFrame(frame())).toContain('id=none');
  });

  it('fetches immediately and renders the task id when a task is set', async () => {
    const provider = makeFakeProvider();
    const task = makeTask('T-1');
    const { lastFrame: frame } = render(
      <ProbeReal provider={provider} task={task} />,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.getPreview).toHaveBeenCalledTimes(1);
    expect(provider.getPreview).toHaveBeenCalledWith(task, FIXED_NOW);
    expect(lastFrame(frame())).toContain('id=T-1');
  });

  it('refetches on the interval while enabled', async () => {
    const provider = makeFakeProvider();
    const task = makeTask('T-1');
    render(<ProbeReal provider={provider} task={task} />);
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.getPreview).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(provider.getPreview).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(provider.getPreview).toHaveBeenCalledTimes(3);
  });

  it('does not refetch on the interval when disabled', async () => {
    const provider = makeFakeProvider();
    const task = makeTask('T-1');
    render(<ProbeDisabled provider={provider} task={task} />);
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.getPreview).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(provider.getPreview).toHaveBeenCalledTimes(1);
  });

  it('refetches for the new id when task.taskId changes', async () => {
    const provider = makeFakeProvider();
    const { rerender, lastFrame: frame } = render(
      <ProbeReal provider={provider} task={makeTask('T-1')} />,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(lastFrame(frame())).toContain('id=T-1');
    expect(provider.getPreview).toHaveBeenCalledTimes(1);

    rerender(<ProbeReal provider={provider} task={makeTask('T-2')} />);
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.getPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ taskId: 'T-2' }),
      FIXED_NOW,
    );
    expect(lastFrame(frame())).toContain('id=T-2');
  });
});

// ---- real probe components used by the tests above ----

function ProbeReal({
  provider,
  task,
}: {
  provider: SessionProvider;
  task: TaskRecord | null;
}) {
  const { preview, isLoading } = useSessionPreview(provider, task, {
    intervalMs: INTERVAL,
    now: () => FIXED_NOW,
  });
  return (
    <Text>{`id=${preview?.taskId ?? 'none'} loading=${String(isLoading)}`}</Text>
  );
}

function ProbeDisabled({
  provider,
  task,
}: {
  provider: SessionProvider;
  task: TaskRecord | null;
}) {
  const { preview } = useSessionPreview(provider, task, {
    intervalMs: INTERVAL,
    now: () => FIXED_NOW,
    enabled: false,
  });
  return <Text>{`id=${preview?.taskId ?? 'none'}`}</Text>;
}
