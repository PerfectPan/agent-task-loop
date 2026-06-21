import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { SourceFilter } from '../../../src/tui/components/SourceFilter';
import { stripAnsi } from '../helpers';

async function tick() {
  await new Promise(r => setTimeout(r, 10));
}

afterEach(() => vi.restoreAllMocks());

const options = [
  { id: 'feishu', label: 'feishu', count: 2 },
  { id: 'github:o/a', label: 'a', count: 3 },
  { id: 'github:o/b', label: 'b', count: 1 },
];

describe('SourceFilter', () => {
  it('renders each source with its count and a checkbox', () => {
    const out = render(<SourceFilter options={options} selected={[]} onApply={vi.fn()} onCancel={vi.fn()} />);
    const frame = stripAnsi(out.lastFrame() ?? '');
    expect(frame).toContain('Sources');
    expect(frame).toContain('feishu');
    expect(frame).toContain('(3)');
    expect(frame).toContain('b');
    out.unmount();
  });

  it('toggles with space and applies the selection on enter', async () => {
    const onApply = vi.fn();
    const app = render(<SourceFilter options={options} selected={[]} onApply={onApply} onCancel={vi.fn()} />);
    await tick();
    app.stdin.write(' '); // toggle first row (feishu)
    await tick();
    app.stdin.write('\r'); // apply
    await tick();
    expect(onApply).toHaveBeenCalledWith(['feishu']);
    app.unmount();
  });

  it('cancels on escape without applying', async () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const app = render(<SourceFilter options={options} selected={[]} onApply={onApply} onCancel={onCancel} />);
    await tick();
    app.stdin.write(''); // Esc
    await tick();
    expect(onCancel).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    app.unmount();
  });

  it('starts from the given selection and can clear it (empty apply = all)', async () => {
    const onApply = vi.fn();
    const app = render(
      <SourceFilter options={options} selected={['feishu']} onApply={onApply} onCancel={vi.fn()} />,
    );
    await tick();
    app.stdin.write(' '); // un-toggle feishu (first row)
    await tick();
    app.stdin.write('\r');
    await tick();
    expect(onApply).toHaveBeenCalledWith([]);
    app.unmount();
  });
});
