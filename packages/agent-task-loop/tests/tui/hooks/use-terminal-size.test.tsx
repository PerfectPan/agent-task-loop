import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { useTerminalSize } from '../../../src/tui/hooks/use-terminal-size';
import { stripAnsi } from '../helpers';

function Probe() {
  const { columns, rows } = useTerminalSize();
  return <Text>{`${columns}x${rows}`}</Text>;
}

describe('useTerminalSize', () => {
  it('renders the current terminal size as columnsXrows', () => {
    const { lastFrame } = render(<Probe />);
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toMatch(/\d+x\d+/);
  });

  it('reports positive integer dimensions', () => {
    const { lastFrame } = render(<Probe />);
    const frame = stripAnsi(lastFrame() ?? '');
    const match = frame.match(/(\d+)x(\d+)/);
    expect(match).not.toBeNull();
    const [, columns, rows] = match!;
    expect(Number(columns)).toBeGreaterThan(0);
    expect(Number(rows)).toBeGreaterThan(0);
  });
});
