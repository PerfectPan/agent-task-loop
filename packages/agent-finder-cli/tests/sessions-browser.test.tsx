import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { SessionHead } from '@rivus/agent-kit/sessions';
import { SessionsBrowser } from '../src/tui/sessions-browser.js';

const NOW = Date.parse('2026-06-15T12:00:00Z');
const SESSIONS: SessionHead[] = [
  {
    ref: {
      agent: 'codex',
      path: '/c/aaaaaaaa-1111-4111-8111-111111111111.jsonl',
      sessionId: 'aaaaaaaa-1111-4111-8111-111111111111',
    },
    lastActiveAt: Date.parse('2026-06-15T11:00:00Z'),
    sizeBytes: 100,
  },
  {
    ref: {
      agent: 'claude-code',
      path: '/cl/bbbbbbbb-2222-4222-8222-222222222222.jsonl',
      sessionId: 'bbbbbbbb-2222-4222-8222-222222222222',
    },
    lastActiveAt: Date.parse('2026-06-15T10:00:00Z'),
    sizeBytes: 100,
  },
];

describe('SessionsBrowser', () => {
  it('renders the list and loads the selected transcript', async () => {
    const loadTranscript = vi.fn(async () => ['assistant: hello from transcript']);
    const { lastFrame } = render(<SessionsBrowser sessions={SESSIONS} loadTranscript={loadTranscript} nowMs={NOW} />);

    expect(lastFrame()).toContain('codex');
    expect(lastFrame()).toContain('claude-code');
    expect(lastFrame()).toContain('Sessions (2)');

    await vi.waitFor(() => expect(loadTranscript).toHaveBeenCalledWith(SESSIONS[0].ref.sessionId));
    await vi.waitFor(() => expect(lastFrame()).toContain('hello from transcript'));
  });

  it('shows the resume command for the selected session', async () => {
    const loadTranscript = vi.fn(async () => []);
    const loadResume = vi.fn(async (id: string) => `codex resume ${id}`);
    const { lastFrame } = render(
      <SessionsBrowser sessions={SESSIONS} loadTranscript={loadTranscript} loadResume={loadResume} nowMs={NOW} />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain(`resume: codex resume ${SESSIONS[0].ref.sessionId}`));
  });

  it('navigates to the next session on down-arrow', async () => {
    const loadTranscript = vi.fn(async () => []);
    const { stdin } = render(<SessionsBrowser sessions={SESSIONS} loadTranscript={loadTranscript} nowMs={NOW} />);

    await vi.waitFor(() => expect(loadTranscript).toHaveBeenCalledWith(SESSIONS[0].ref.sessionId));
    stdin.write('[B'); // down arrow
    await vi.waitFor(() => expect(loadTranscript).toHaveBeenCalledWith(SESSIONS[1].ref.sessionId));
  });

  it('renders an empty state with no sessions', () => {
    const { lastFrame } = render(<SessionsBrowser sessions={[]} loadTranscript={vi.fn(async () => [])} nowMs={NOW} />);
    expect(lastFrame()).toContain('No sessions found.');
  });
});
