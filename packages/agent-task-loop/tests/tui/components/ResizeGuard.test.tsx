import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { ResizeGuard } from '../../../src/tui/components/ResizeGuard';
import { stripAnsi } from '../helpers';

describe('ResizeGuard', () => {
  it('renders the resize notice with current dims and hides children below min size', () => {
    const { lastFrame } = render(
      <ResizeGuard columns={50} rows={10}>
        <Text>marker</Text>
      </ResizeGuard>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Terminal too small');
    expect(frame).toContain('90x24');
    expect(frame).toContain('50x10');
    expect(frame).not.toContain('marker');
  });

  it('renders children and hides the notice at/above min size', () => {
    const { lastFrame } = render(
      <ResizeGuard columns={100} rows={40}>
        <Text>marker</Text>
      </ResizeGuard>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('marker');
    expect(frame).not.toContain('Terminal too small');
  });
});
