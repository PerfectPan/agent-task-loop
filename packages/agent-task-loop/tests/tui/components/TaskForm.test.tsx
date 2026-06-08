import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { TaskForm } from '../../../src/tui/components/TaskForm';
import { stripAnsi } from '../helpers';

async function tick() {
  await new Promise(r => setTimeout(r, 10));
}

afterEach(() => vi.restoreAllMocks());

describe('TaskForm', () => {
  it('renders the fields and a default agent', () => {
    const out = render(<TaskForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const frame = stripAnsi(out.lastFrame() ?? '');
    expect(frame).toContain('New task');
    expect(frame).toContain('Task ID');
    expect(frame).toContain('Title');
    expect(frame).toContain('claude'); // default agent
    out.unmount();
  });

  it('submits the typed values', async () => {
    const onSubmit = vi.fn();
    const app = render(<TaskForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    await tick();
    app.stdin.write('IDEA-200'); // taskId
    await tick();
    app.stdin.write('\t'); // → title
    await tick();
    app.stdin.write('Add dark mode'); // title
    await tick();
    app.stdin.write('\r'); // submit
    await tick();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      taskId: 'IDEA-200',
      title: 'Add dark mode',
      targetAgent: 'claude',
      priority: 3,
    });
    app.unmount();
  });

  it('does not submit without a Task ID and Title', async () => {
    const onSubmit = vi.fn();
    const app = render(<TaskForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    await tick();
    app.stdin.write('\r'); // submit empty
    await tick();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(stripAnsi(app.lastFrame() ?? '')).toContain('required');
    app.unmount();
  });

  it('cancels on Escape', async () => {
    const onCancel = vi.fn();
    const app = render(<TaskForm onSubmit={vi.fn()} onCancel={onCancel} />);
    await tick();
    app.stdin.write(''); // Esc
    await tick();
    expect(onCancel).toHaveBeenCalled();
    app.unmount();
  });
});
