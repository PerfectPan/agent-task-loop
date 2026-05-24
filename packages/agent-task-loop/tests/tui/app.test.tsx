import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from '../../src/tui/app';
import { DEMO_TASKS } from '../../src/tui/demo-data';

const wait = (ms = 50) => new Promise(r => setTimeout(r, ms));

describe('App (smoke)', () => {
  it('renders header with task count after fetch', async () => {
    const { lastFrame } = render(<App onFetch={async () => DEMO_TASKS} />);
    await wait();
    expect(lastFrame()).toContain('Agent Task Loop');
    expect(lastFrame()).toContain(`${DEMO_TASKS.length} tasks`);
  });

  it('renders running tasks before pending ones', async () => {
    const { lastFrame } = render(<App onFetch={async () => DEMO_TASKS} />);
    await wait();
    const frame = lastFrame() ?? '';
    const runningIdx = frame.indexOf('TASK-101'); // 执行中
    const pendingIdx = frame.indexOf('TASK-108'); // 待处理
    expect(runningIdx).toBeGreaterThanOrEqual(0);
    expect(pendingIdx).toBeGreaterThanOrEqual(0);
    expect(runningIdx).toBeLessThan(pendingIdx);
  });

  it('shows selection indicator on first task', async () => {
    const { lastFrame } = render(<App onFetch={async () => DEMO_TASKS} />);
    await wait();
    expect(lastFrame()).toContain('▶');
  });

  it('shows task detail for selected task', async () => {
    const { lastFrame } = render(<App onFetch={async () => DEMO_TASKS} />);
    await wait();
    // First task after sort is TASK-101 (执行中 P1)
    expect(lastFrame()).toContain('JWT refresh token');
  });

  it('shows error when fetch fails', async () => {
    const { lastFrame } = render(
      <App onFetch={async () => { throw new Error('network error'); }} />
    );
    await wait();
    expect(lastFrame()).toContain('Error: network error');
  });
});
