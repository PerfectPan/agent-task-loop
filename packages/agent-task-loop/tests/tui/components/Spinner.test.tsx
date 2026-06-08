import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRAMES, FRAME_INTERVAL_MS, Spinner } from '../../../src/tui/components/Spinner';
import { stripAnsi } from '../helpers';

/** Advance the interval and let React + ink commit the resulting frame. */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await vi.advanceTimersByTimeAsync(0);
}

describe('Spinner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a braille frame initially', () => {
    const { lastFrame } = render(<Spinner />);
    expect(stripAnsi(lastFrame() ?? '')).toBe(FRAMES[0]);
  });

  it('advances the frame after the interval elapses', async () => {
    const { lastFrame } = render(<Spinner />);
    expect(stripAnsi(lastFrame() ?? '')).toBe(FRAMES[0]);

    await advance(FRAME_INTERVAL_MS);
    expect(stripAnsi(lastFrame() ?? '')).toBe(FRAMES[1]);

    await advance(FRAME_INTERVAL_MS);
    expect(stripAnsi(lastFrame() ?? '')).toBe(FRAMES[2]);
  });

  it('honors the color prop while keeping the frame char visible', () => {
    const { lastFrame } = render(<Spinner color="green" />);
    expect(stripAnsi(lastFrame() ?? '')).toBe(FRAMES[0]);
  });
});
