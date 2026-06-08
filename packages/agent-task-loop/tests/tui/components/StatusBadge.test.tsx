import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusBadge } from '../../../src/tui/components/StatusBadge';
import { FRAMES } from '../../../src/tui/components/Spinner';
import { stripAnsi } from '../helpers';

describe('StatusBadge', () => {
  it('shows glyph + label for a non-live status', () => {
    const { lastFrame } = render(<StatusBadge status="待处理" />);
    expect(stripAnsi(lastFrame() ?? '')).toBe('◌ 待处理');
  });

  it('drops the label when showLabel is false (narrow mode)', () => {
    const { lastFrame } = render(<StatusBadge status="待处理" showLabel={false} />);
    expect(stripAnsi(lastFrame() ?? '')).toBe('◌');
  });

  it('renders the label by default', () => {
    const { lastFrame } = render(<StatusBadge status="已完成" showLabel />);
    expect(stripAnsi(lastFrame() ?? '')).toBe('✓ 已完成');
  });

  describe('live status', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders a spinner frame instead of the static glyph', () => {
      const { lastFrame } = render(<StatusBadge status="执行中" showLabel={false} />);
      const visible = stripAnsi(lastFrame() ?? '');
      // Live statuses animate: the static glyph (●) must not appear.
      expect(visible).not.toContain('●');
      expect((FRAMES as readonly string[]).includes(visible)).toBe(true);
    });

    it('keeps the label alongside the spinner', () => {
      const { lastFrame } = render(<StatusBadge status="执行中" />);
      const visible = stripAnsi(lastFrame() ?? '');
      expect(visible).not.toContain('●');
      expect(visible.endsWith(' 执行中')).toBe(true);
      expect((FRAMES as readonly string[]).includes(visible.charAt(0))).toBe(true);
    });
  });
});
