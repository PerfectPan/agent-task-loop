import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Tabs } from '../../../src/tui/components/Tabs';
import { TABS, type TabKey } from '../../../src/tui/logic/status';
import { stripAnsi } from '../helpers';

const counts: Record<TabKey, number> = {
  active: 3,
  'needs-input': 1,
  done: 12,
  all: 16,
};

describe('Tabs', () => {
  it('renders all four tab labels with their counts', () => {
    const { lastFrame } = render(<Tabs active="active" counts={counts} />);
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Active(3)');
    expect(frame).toContain('Needs Input(1)');
    expect(frame).toContain('Done(12)');
    expect(frame).toContain('All(16)');
  });

  it('renders every tab defined in TABS', () => {
    const { lastFrame } = render(<Tabs active="done" counts={counts} />);
    const frame = stripAnsi(lastFrame() ?? '');
    for (const tab of TABS) {
      expect(frame).toContain(`${tab.label}(${counts[tab.key]})`);
    }
  });

  it('renders the active tab distinctly from inactive ones', () => {
    const { lastFrame } = render(<Tabs active="needs-input" counts={counts} />);
    const raw = lastFrame() ?? '';
    const plain = stripAnsi(raw);

    // The active label is still present as visible text.
    expect(plain).toContain('Needs Input(1)');

    // The active chip carries ANSI styling the plain text does not.
    expect(raw).not.toEqual(plain);
    // The active chip's text is wrapped in escape codes within the raw frame.
    expect(raw).toMatch(/\[[0-9;]*m[^]*Needs Input\(1\)/);
  });

  it('renders zero counts without crashing', () => {
    const zero: Record<TabKey, number> = { active: 0, 'needs-input': 0, done: 0, all: 0 };
    const { lastFrame } = render(<Tabs active="all" counts={zero} />);
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('All(0)');
    expect(frame).toContain('Active(0)');
  });
});
