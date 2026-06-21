import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { TaskForm } from '../../../src/tui/components/TaskForm';
import { stripAnsi } from '../helpers';

async function tick() {
  await new Promise(r => setTimeout(r, 10));
}

afterEach(() => vi.restoreAllMocks());

const CTRL_R = String.fromCharCode(18);

describe('TaskForm', () => {
  it('refines the description on Ctrl+R via onRefineDescription', async () => {
    const onRefine = vi.fn(async () => 'REFINED TEXT');
    const app = render(<TaskForm onSubmit={vi.fn()} onCancel={vi.fn()} onRefineDescription={onRefine} />);
    await tick();
    app.stdin.write('IDEA-9'); // taskId
    await tick();
    app.stdin.write('\t'); // → title
    await tick();
    app.stdin.write('Add feature'); // title
    await tick();
    app.stdin.write(CTRL_R); // refine
    await tick();
    await tick();
    expect(onRefine).toHaveBeenCalledWith(expect.objectContaining({ title: 'Add feature' }));
    expect(stripAnsi(app.lastFrame() ?? '')).toContain('REFINED TEXT');
    app.unmount();
  });

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

  it('hides the source selector with one or no source', () => {
    const out = render(<TaskForm onSubmit={vi.fn()} onCancel={vi.fn()} sources={['feishu']} />);
    expect(stripAnsi(out.lastFrame() ?? '')).not.toContain('Source');
    out.unmount();
  });

  it('shows a source selector with multiple sources and submits the chosen one', async () => {
    const onSubmit = vi.fn();
    const app = render(<TaskForm onSubmit={onSubmit} onCancel={vi.fn()} sources={['feishu', 'github']} />);
    await tick();
    expect(stripAnsi(app.lastFrame() ?? '')).toContain('Source');
    app.stdin.write('IDEA-300'); // taskId
    await tick();
    app.stdin.write('\t'); // → title
    await tick();
    app.stdin.write('Wire github'); // title
    await tick();
    app.stdin.write('\t'); // → source
    await tick();
    app.stdin.write('[C'); // right arrow → github
    await tick();
    app.stdin.write('\r'); // submit
    await tick();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      taskId: 'IDEA-300',
      title: 'Wire github',
      source: 'github',
    });
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
