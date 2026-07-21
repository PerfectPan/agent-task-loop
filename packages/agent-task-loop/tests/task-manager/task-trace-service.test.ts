import { describe, expect, it } from 'vitest';
import { TaskTraceService } from '../../src/task-manager/task-trace-service';
import type { TaskRecord } from '../../src/types/task';

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: 'TASK-1',
    title: 'Demo',
    description: 'd',
    project: 'p',
    targetAgent: 'claude',
    priority: 1,
    status: '执行中',
    sessionHistory: [
      '[2026-07-21T01:00:00.000Z] | round=1 | kind=execute | agent=claude | id=sess-exec-1 | name=t-exec',
      '[2026-07-21T01:10:00.000Z] | round=1 | kind=review | agent=codex | id=sess-rev-1 | name=t-rev',
    ].join('\n'),
    executionSessionId: 'sess-exec-1',
    reviewSessionId: 'sess-rev-1',
    logPath: '/tmp/fake-task.log',
    ...overrides,
  };
}

describe('TaskTraceService', () => {
  it('lists rounds without absolute paths', async () => {
    const record = task();
    const service = new TaskTraceService({
      taskProvider: {
        async getTaskById(id) {
          return id === 'TASK-1' ? record : undefined;
        },
      },
      sessionSource: {
        async getTranscript() {
          return [
            { role: 'user', text: 'hello' },
            { role: 'assistant', text: 'world' },
            { role: 'tool', text: 'Bash', toolName: 'Bash' },
          ];
        },
        async listSessionIds() {
          return ['sess-exec-1', 'sess-rev-1'];
        },
      },
    });

    const { rounds } = await service.listRounds('TASK-1');
    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toMatchObject({
      kind: 'execute',
      agent: 'claude',
      sessionId: 'sess-exec-1',
      hasTranscript: true,
    });
    expect(JSON.stringify(rounds)).not.toContain('/Users/');
    expect(JSON.stringify(rounds)).not.toContain('workspacePath');
  });

  it('returns structured transcript and hides reasoning by default', async () => {
    const service = new TaskTraceService({
      taskProvider: {
        async getTaskById() {
          return task();
        },
      },
      sessionSource: {
        async getTranscript(id) {
          expect(id).toBe('sess-exec-1');
          return [
            { role: 'reasoning', text: 'thinking hard' },
            { role: 'user', text: 'do the thing\nwith two lines' },
            { role: 'assistant', text: 'done' },
            { role: 'tool', text: 'Read', toolName: 'Read' },
          ];
        },
        async listSessionIds() {
          return ['sess-exec-1'];
        },
      },
    });

    const result = await service.getTranscript({
      taskId: 'TASK-1',
      sessionId: 'sess-exec-1',
    });
    expect(result.messages.map(m => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(result.messages[0]?.text).toContain('\n');
    expect(result.messages[2]?.toolName).toBe('Read');
    expect(result.roleCounts).toMatchObject({ user: 1, assistant: 1, tool: 1 });
    expect(result.messages.some(m => m.role === 'reasoning')).toBe(false);
  });

  it('redacts home paths in log tails', async () => {
    const service = new TaskTraceService({
      taskProvider: {
        async getTaskById() {
          return task({ logPath: '/tmp/x.log' });
        },
      },
      sessionSource: {
        async getTranscript() {
          return [];
        },
        async listSessionIds() {
          return [];
        },
      },
      readFile: async () =>
        'ok line\npath=/Users/someone/.ssh/id_rsa\ntoken=ghp-ABCDEFGHIJKLMNOP\n',
    });

    const tail = await service.getLogTail('TASK-1');
    expect(tail.available).toBe(true);
    expect(tail.lines.join('\n')).toContain('~/…');
    expect(tail.lines.join('\n')).toContain('[redacted]');
    expect(tail.lines.join('\n')).not.toContain('/Users/someone');
    expect(tail.lines.join('\n')).not.toContain('ghp-ABCDEFGHIJKLMNOP');
  });
});
