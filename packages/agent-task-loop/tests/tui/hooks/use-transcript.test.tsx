import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { useTranscript } from '../../../src/tui/hooks/use-transcript';
import { createFakeSessionProvider } from '../../../src/tui/data/session-provider';
import { stripAnsi } from '../helpers';

const provider = createFakeSessionProvider(
  {},
  { 'sess-a': ['assistant: a1', 'assistant: a2'], 'sess-b': ['user: b1'] },
);

function Probe({ sessionId }: { sessionId: string | null }) {
  const { lines, isLoading } = useTranscript(provider, sessionId);
  return <Text>{`n=${lines.length}|${isLoading ? 'load' : 'idle'}|${lines.join(',')}`}</Text>;
}

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useTranscript', () => {
  it('returns [] for a null session id', async () => {
    const { lastFrame } = render(<Probe sessionId={null} />);
    await flush();
    expect(stripAnsi(lastFrame() ?? '')).toContain('n=0|idle|');
  });

  it('fetches the transcript for a session id', async () => {
    const { lastFrame } = render(<Probe sessionId="sess-a" />);
    await flush();
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('n=2');
    expect(frame).toContain('assistant: a1,assistant: a2');
  });

  it('refetches when the session id changes', async () => {
    const { lastFrame, rerender } = render(<Probe sessionId="sess-a" />);
    await flush();
    rerender(<Probe sessionId="sess-b" />);
    await flush();
    expect(stripAnsi(lastFrame() ?? '')).toContain('user: b1');
  });
});
