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

  it('draws the rework loop with connecting arrows', () => {
    const frame = stripAnsi(render(<WorkflowOverlay visible />).lastFrame() ?? '');
    expect(frame).toContain('修复中'); // rework node
    expect(frame).toContain('issues'); // 待复核 → 修复中
    expect(frame).toContain('re-review'); // 修复中 → back to 待复核
    expect(frame).toContain('changes'); // 待验收 → 修复中
    expect(frame).toContain('待决策');
    expect(frame).toContain('已失败');
    // the loop arc is drawn with box-drawing characters
    expect(frame).toMatch(/[┌┐│▼]/);
  });

  it('highlights the current status with inverse styling (raw frame)', () => {
    const raw = render(<WorkflowOverlay visible currentStatus="待发布" />).lastFrame() ?? '';
    // inverse SGR (7) wraps the active chip
    expect(/\[[0-9;]*7[0-9;]*m/.test(raw)).toBe(true);
  });
});
