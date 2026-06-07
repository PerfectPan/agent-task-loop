import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import type { Pane } from '../../../src/tui/types';
import { StatusBar } from '../../../src/tui/components/StatusBar';
import { stripAnsi } from '../helpers';

function renderBar(props: {
  focusedPane: Pane;
  filtering: boolean;
}): string {
  const { lastFrame } = render(<StatusBar {...props} />);
  return stripAnsi(lastFrame() ?? '');
}

describe('StatusBar', () => {
  it('shows navigation hints when the list pane is focused', () => {
    const out = renderBar({ focusedPane: 'list', filtering: false });
    expect(out).toContain('[↑↓/jk] nav');
    expect(out).toContain('[Tab] focus');
    expect(out).toContain('[/] filter');
  });

  it("shows '[m] mode' when the preview pane is focused", () => {
    const out = renderBar({ focusedPane: 'preview', filtering: false });
    expect(out).toContain('[m] mode');
  });

  it('shows filter-mode hints while filtering', () => {
    const out = renderBar({ focusedPane: 'list', filtering: true });
    expect(out).toContain('[Esc] cancel');
    expect(out).toContain('[Enter] apply');
    expect(out).toContain('type to filter');
    // filter mode replaces the normal nav hints
    expect(out).not.toContain('[↑↓/jk] nav');
  });

  it('always shows quit and help hints when not filtering', () => {
    const panes: Pane[] = ['list', 'detail', 'preview'];
    for (const focusedPane of panes) {
      const out = renderBar({ focusedPane, filtering: false });
      expect(out).toContain('[?] help');
      expect(out).toContain('[q] quit');
    }
  });

  it('includes [Tab] focus when the detail pane is focused', () => {
    const out = renderBar({ focusedPane: 'detail', filtering: false });
    expect(out).toContain('[Tab] focus');
  });
});
