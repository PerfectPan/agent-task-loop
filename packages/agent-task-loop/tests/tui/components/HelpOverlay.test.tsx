import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { HelpOverlay } from '../../../src/tui/components/HelpOverlay';
import { stripAnsi } from '../helpers';

describe('HelpOverlay', () => {
  it('renders nothing when not visible', () => {
    const { lastFrame } = render(<HelpOverlay visible={false} />);
    expect(stripAnsi(lastFrame() ?? '')).toBe('');
  });

  it('renders the title when visible', () => {
    const { lastFrame } = render(<HelpOverlay visible />);
    expect(stripAnsi(lastFrame() ?? '')).toContain('Keyboard Shortcuts');
  });

  it('lists navigation, tab cycling, filter, and quit bindings', () => {
    const { lastFrame } = render(<HelpOverlay visible />);
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('j/k');
    expect(frame).toContain('Tab');
    expect(frame).toContain('quit');
    expect(frame).toContain('filter');
  });

  it('lists the preview-mode and help bindings', () => {
    const { lastFrame } = render(<HelpOverlay visible />);
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('preview mode');
    expect(frame).toContain('help');
    expect(frame).toContain('attach');
  });
});
