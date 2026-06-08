import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from '../../../src/tui/components/App';
import { createFakeSessionProvider } from '../../../src/tui/data/session-provider';
import type { FetchTasks } from '../../../src/tui/types';
import { demoTasks } from '../fixtures';
import type { CreateTaskPayload } from '../../../src/task-management/task-provider';
import { FIXED_NOW, stripAnsi } from '../helpers';

const now = () => FIXED_NOW;
const provider = createFakeSessionProvider();

/** Let ink mount, run effects, and settle the async initial fetch. */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function renderApp(tasks = demoTasks(FIXED_NOW)) {
  const onFetch: FetchTasks = async () => tasks;
  return render(
    <App agent="claude" onFetchTasks={onFetch} sessionProvider={provider} now={now} />,
  );
}

describe('App dashboard', () => {
  it('renders the header, tabs and the first task selected', async () => {
    const app = renderApp();
    await settle();
    const frame = stripAnsi(app.lastFrame() ?? '');
    expect(frame).toContain('Agent Task Loop');
    expect(frame).toContain('claude');
    expect(frame).toContain('Active');
    expect(frame).toContain('TASK-101');
    app.unmount();
  });

  it('shows an empty state when there are no tasks', async () => {
    const app = renderApp([]);
    await settle();
    expect(stripAnsi(app.lastFrame() ?? '')).toContain('No tasks');
    app.unmount();
  });

  it('moves selection with j/k and the detail pane follows', async () => {
    const app = renderApp();
    await settle();
    app.stdin.write('j');
    await settle();
    const frame = stripAnsi(app.lastFrame() ?? '');
    // Detail pane shows the now-selected second active task (TASK-102).
    expect(frame).toContain('TASK-102');
    app.unmount();
  });

  it('switches tabs to Done with the number keys', async () => {
    const app = renderApp();
    await settle();
    app.stdin.write('3'); // Done tab
    await settle();
    const frame = stripAnsi(app.lastFrame() ?? '');
    expect(frame).toContain('TASK-109'); // 已完成
    expect(frame).toContain('TASK-110'); // 已失败
    app.unmount();
  });

  it('filters the list by typed query', async () => {
    const app = renderApp();
    await settle();
    app.stdin.write('4'); // All tab
    await settle();
    app.stdin.write('/'); // enter filter mode
    await settle();
    app.stdin.write('rate'); // matches "rate limiting" (TASK-110)
    await settle();
    const frame = stripAnsi(app.lastFrame() ?? '');
    expect(frame).toContain('TASK-110');
    expect(frame).not.toContain('TASK-101');
    app.unmount();
  });

  it('toggles the help overlay with ?', async () => {
    const app = renderApp();
    await settle();
    app.stdin.write('?');
    await settle();
    expect(stripAnsi(app.lastFrame() ?? '')).toContain('Keyboard Shortcuts');
    app.stdin.write(' '); // any key closes
    await settle();
    expect(stripAnsi(app.lastFrame() ?? '')).not.toContain('Keyboard Shortcuts');
    app.unmount();
  });

  it('refetches on r', async () => {
    const fetchSpy = vi.fn(async () => demoTasks(FIXED_NOW));
    const app = render(
      <App agent="claude" onFetchTasks={fetchSpy} sessionProvider={provider} now={now} />,
    );
    await settle();
    const callsBefore = fetchSpy.mock.calls.length;
    app.stdin.write('r');
    await settle();
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    app.unmount();
  });

  it('opens the new-task form on n and creates via onCreateTask', async () => {
    const onCreateTask = vi.fn(async (_payload: CreateTaskPayload) => {});
    const app = render(
      <App
        agent="claude"
        onFetchTasks={async () => demoTasks(FIXED_NOW)}
        sessionProvider={provider}
        now={now}
        onCreateTask={onCreateTask}
      />,
    );
    await settle();
    app.stdin.write('n');
    await settle();
    expect(stripAnsi(app.lastFrame() ?? '')).toContain('New task');
    app.stdin.write('IDEA-900');
    await settle();
    app.stdin.write('\t');
    await settle();
    app.stdin.write('Wire it up');
    await settle();
    app.stdin.write('\r');
    await settle();
    expect(onCreateTask).toHaveBeenCalledTimes(1);
    expect(onCreateTask.mock.calls[0][0]).toMatchObject({ taskId: 'IDEA-900', title: 'Wire it up' });
    // form closes after a successful create
    expect(stripAnsi(app.lastFrame() ?? '')).not.toContain('New task');
    app.unmount();
  });
});
