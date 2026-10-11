import { describe, expect, it, vi } from 'vite-plus/test';
import { createMemoryPlatform } from '@rivus/agent-kit/testing';
import type { TaskRecord } from '../../../src/types/task';
import type { SessionPreview } from '../../../src/tui/types';
import { fixedNow } from '../helpers';

// Stub the sibling provider module (owned by a teammate). Only the bits
// FsSessionProvider relies on are modelled: buildPreviewFromTask must reflect
// the passed logTail and derive hasLog from it. This keeps the test focused on
// FsSessionProvider's own logic (path selection, tailing, error handling).
vi.mock('../../../src/tui/data/session-provider', () => ({
  buildPreviewFromTask: (task: TaskRecord, _now: number, logTail: string[] = []): SessionPreview => ({
    taskId: task.taskId,
    runner: {},
    heartbeat: { state: 'none', ageMs: null },
    history: [],
    logTail,
    hasLog: logTail.length > 0,
    live: false,
  }),
}));

import { FsSessionProvider, type FsSessionHost } from '../../../src/tui/data/fs-session-provider';

const HOME = '/fixture-home';
const CODEX_ID = '11111111-1111-7111-8111-111111111111';
const ROLLOUT_PATH = `${HOME}/.codex/sessions/2026/10/12/rollout-2026-10-12T10-00-00-${CODEX_ID}.jsonl`;

/** A platform whose `fs.read`/`fs.list` record the paths they were asked for. */
function spyOn(platform: FsSessionHost): { platform: FsSessionHost; reads: string[]; lists: string[] } {
  const reads: string[] = [];
  const lists: string[] = [];
  return {
    platform: {
      ...platform,
      fs: {
        ...platform.fs,
        read: (path, range) => {
          reads.push(path);
          return platform.fs.read(path, range);
        },
        list: (dir) => {
          lists.push(dir);
          return platform.fs.list(dir);
        },
      },
    },
    reads,
    lists,
  };
}

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: 'T-1',
    title: 'Demo task',
    description: 'do the thing',
    project: 'proj',
    targetAgent: 'claude',
    priority: 1,
    status: '执行中',
    ...overrides,
  };
}

/** A Codex rollout: session meta, then one turn's records as the modern CLI writes them. */
function rollout(...records: Record<string, unknown>[]): string {
  return `${[
    JSON.stringify({
      timestamp: '2026-10-12T10:00:00.000Z',
      type: 'session_meta',
      payload: { id: CODEX_ID, cwd: '/work/fixture-repo', cli_version: '0.55.0' },
    }),
    ...records.map((record, i) =>
      JSON.stringify({ timestamp: `2026-10-12T10:00:${String(i + 1).padStart(2, '0')}.000Z`, ...record }),
    ),
  ].join('\n')}\n`;
}

const turn = (userText: string, assistantText: string): Record<string, unknown>[] => [
  // The CLI's event_msg copy of the turn's messages…
  { type: 'event_msg', payload: { type: 'user_message', message: userText, kind: 'plain' } },
  // …and the model's response_item copy of the same messages.
  {
    type: 'response_item',
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: userText }] },
  },
  { type: 'event_msg', payload: { type: 'agent_message', message: assistantText } },
  {
    type: 'response_item',
    payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: assistantText }] },
  },
];

describe('FsSessionProvider', () => {
  it('tails the last N lines of the log and sets hasLog true', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    const { platform, reads } = spyOn(createMemoryPlatform({ files: { '/log/exec.log': `${lines.join('\n')}\n` } }));
    const provider = new FsSessionProvider({ maxLines: 3, platform });

    const preview = await provider.getPreview(makeTask({ logPath: '/log/exec.log' }), fixedNow());

    expect(reads).toContain('/log/exec.log');
    expect(preview.logTail).toEqual(['line 8', 'line 9', 'line 10']);
    expect(preview.hasLog).toBe(true);
  });

  it('returns hasLog false without reading when no log path exists', async () => {
    const { platform, reads } = spyOn(createMemoryPlatform({ files: {} }));
    const provider = new FsSessionProvider({ platform });

    const preview = await provider.getPreview(makeTask(), fixedNow());

    expect(reads).toEqual([]);
    expect(preview.logTail).toEqual([]);
    expect(preview.hasLog).toBe(false);
  });

  it('degrades gracefully to an empty tail when the log file is missing', async () => {
    const { platform, reads } = spyOn(createMemoryPlatform({ files: {} }));
    const provider = new FsSessionProvider({ platform });

    const preview = await provider.getPreview(makeTask({ logPath: '/missing.log' }), fixedNow());

    expect(reads).toContain('/missing.log');
    expect(preview.logTail).toEqual([]);
    expect(preview.hasLog).toBe(false);
  });

  it('reads reviewLogPath for a review runner', async () => {
    const { platform, reads } = spyOn(
      createMemoryPlatform({
        files: { '/log/exec.log': 'exec only\n', '/log/review.log': 'review line a\nreview line b\n' },
      }),
    );
    const provider = new FsSessionProvider({ platform });

    const task = makeTask({
      runnerKind: 'review',
      logPath: '/log/exec.log',
      reviewLogPath: '/log/review.log',
    });
    const preview = await provider.getPreview(task, fixedNow());

    expect(reads).toContain('/log/review.log');
    expect(reads).not.toContain('/log/exec.log');
    expect(preview.logTail).toEqual(['review line a', 'review line b']);
    expect(preview.hasLog).toBe(true);
  });

  it('uses logPath for an execute runner', async () => {
    const { platform } = spyOn(
      createMemoryPlatform({
        files: { '/log/exec.log': 'exec only\n', '/log/review.log': 'review line a\nreview line b\n' },
      }),
    );
    const provider = new FsSessionProvider({ platform });

    const task = makeTask({
      runnerKind: 'execute',
      logPath: '/log/exec.log',
      reviewLogPath: '/log/review.log',
    });
    const preview = await provider.getPreview(task, fixedNow());

    expect(preview.logTail).toEqual(['exec only']);
  });

  it('falls back to the session transcript when no log file exists', async () => {
    const { platform } = spyOn(
      createMemoryPlatform({
        home: HOME,
        files: {
          [ROLLOUT_PATH]: rollout(
            {
              type: 'response_item',
              payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
            },
            {
              type: 'response_item',
              payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done' }] },
            },
          ),
        },
      }),
    );
    const provider = new FsSessionProvider({ platform });

    const preview = await provider.getPreview(makeTask({ executionSessionId: CODEX_ID }), fixedNow());

    expect(preview.logTail).toEqual(['user: hi', 'assistant: done']);
    expect(preview.hasLog).toBe(true);
  });

  // Regression: a Codex rollout records each turn twice — the CLI's `event_msg`
  // copy (user_message/agent_message) and the model's `response_item` copy.
  // The preview must render each turn once; the previous parser read both
  // copies and every turn appeared twice.
  it('renders a mixed event_msg/response_item rollout once per turn', async () => {
    const { platform } = spyOn(
      createMemoryPlatform({
        home: HOME,
        files: {
          [ROLLOUT_PATH]: rollout(
            ...turn('fix the widget', 'Working on it.'),
            {
              type: 'response_item',
              payload: { type: 'reasoning', summary: [{ type: 'summary_text', text: 'thinking hard' }] },
            },
            {
              type: 'response_item',
              payload: { type: 'function_call', name: 'shell', arguments: '{"cmd":["ls"]}', call_id: 'call_1' },
            },
            ...turn('also add tests', 'Done.'),
          ),
        },
      }),
    );
    const provider = new FsSessionProvider({ platform });

    const preview = await provider.getPreview(makeTask({ executionSessionId: CODEX_ID }), fixedNow());

    expect(preview.logTail).toEqual([
      'user: fix the widget',
      'assistant: Working on it.',
      'reasoning: thinking hard',
      '⚙ shell',
      'user: also add tests',
      'assistant: Done.',
    ]);
  });

  it('lists the session ids that have a resolvable transcript', async () => {
    const provider = new FsSessionProvider({
      platform: createMemoryPlatform({
        home: HOME,
        files: { [ROLLOUT_PATH]: rollout() },
      }),
    });

    expect(await provider.listAvailableSessionIds()).toEqual([CODEX_ID]);
  });

  it('caches the session listing across calls', async () => {
    const { platform, lists } = spyOn(
      createMemoryPlatform({
        home: HOME,
        files: { [ROLLOUT_PATH]: rollout() },
      }),
    );
    const provider = new FsSessionProvider({ platform });

    await provider.getPreview(makeTask({ executionSessionId: CODEX_ID }), fixedNow());
    await provider.getPreview(makeTask({ executionSessionId: CODEX_ID }), fixedNow());

    // The rollout's directory was listed only once across both calls, thanks
    // to the listing cache.
    const leaf = `${HOME}/.codex/sessions/2026/10/12`;
    expect(lists.filter((dir) => dir === leaf)).toHaveLength(1);
  });

  it('returns hasLog false when the transcript cannot be found', async () => {
    const provider = new FsSessionProvider({
      platform: createMemoryPlatform({ home: HOME, files: {} }),
    });

    const preview = await provider.getPreview(makeTask({ executionSessionId: 'missing' }), fixedNow());

    expect(preview.hasLog).toBe(false);
  });
});
