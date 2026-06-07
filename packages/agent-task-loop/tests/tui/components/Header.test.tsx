import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { Header } from '../../../src/tui/components/Header';
import { FIXED_NOW, isoSecondsAgo, stripAnsi } from '../helpers';

describe('Header', () => {
  it('renders the title, agent and task count', () => {
    const { lastFrame } = render(
      <Header agent="claude" taskCount={7} lastFetchedAt={undefined} now={FIXED_NOW} />,
    );
    const text = stripAnsi(lastFrame() ?? '');
    expect(text).toContain('Agent Task Loop');
    expect(text).toContain('claude');
    expect(text).toContain('7');
  });

  it('shows updated time using timeAgo from the injected clock', () => {
    const { lastFrame } = render(
      <Header
        agent="codex"
        taskCount={3}
        lastFetchedAt={isoSecondsAgo(30)}
        now={FIXED_NOW}
      />,
    );
    const text = stripAnsi(lastFrame() ?? '');
    expect(text).toContain('updated 30s ago');
  });

  it('shows the filter text when provided', () => {
    const { lastFrame } = render(
      <Header
        agent="claude"
        taskCount={1}
        lastFetchedAt={undefined}
        now={FIXED_NOW}
        filterText="login"
      />,
    );
    const text = stripAnsi(lastFrame() ?? '');
    expect(text).toContain('/login');
  });

  it('omits the filter segment when filterText is empty', () => {
    const { lastFrame } = render(
      <Header
        agent="claude"
        taskCount={1}
        lastFetchedAt={undefined}
        now={FIXED_NOW}
        filterText=""
      />,
    );
    const text = stripAnsi(lastFrame() ?? '');
    expect(text).not.toContain('/');
  });
});
