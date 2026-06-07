import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { WorkflowOverlay } from '../../../src/tui/components/WorkflowOverlay';
import { stripAnsi } from '../helpers';

describe('WorkflowOverlay', () => {
  it('renders nothing when not visible', () => {
    const { lastFrame } = render(<WorkflowOverlay visible={false} />);
    expect(stripAnsi(lastFrame() ?? '').trim()).toBe('');
  });

  it('renders the full status pipeline when visible', () => {
    const { lastFrame } = render(<WorkflowOverlay visible />);
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Task workflow');
    for (const status of ['待处理', '执行中', '待复核', '待发布', '待验收', '已完成']) {
      expect(frame).toContain(status);
    }
  });

  it('marks the current status', () => {
    const { lastFrame } = render(<WorkflowOverlay visible currentStatus="待发布" />);
    expect(stripAnsi(lastFrame() ?? '')).toContain('◀ current');
  });
});
