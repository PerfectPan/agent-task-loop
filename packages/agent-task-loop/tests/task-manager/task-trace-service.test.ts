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
    const record = task({
      workspacePath: '/Users/someone/work/TASK-1',
      sessionHistory: task().sessionHistory + '\n| workspace=/Users/someone/secret',
    });
    // repair history line - use proper format without leaking in dto
    record.sessionHistory = [
      '[2026-07-21T01:00:00.000Z] | round=1 | kind=execute | agent=claude | id=sess-exec-1',
      '[2026-07-21T01:10:00.000Z] | round=1 | kind=review | agent=codex | id=sess-rev-1',
    ].join('\n');

    const service = new TaskTraceService({
      taskProvider: {
        async getTaskById(id) {
          return id === 'TASK-1' ? record : undefined;
        },
      },
      sessionProvider: {
        async getTranscript() {
          return ['user: hello', 'assistant: world', '⚙ Bash'];
        },
        async listAvailableSessionIds() {
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

  it('returns structured transcript messages', async () => {
    const service = new TaskTraceService({
      taskProvider: {
        async getTaskById() {
          return task();
        },
      },
      sessionProvider: {
        async getTranscript(id) {
          expect(id).toBe('sess-exec-1');
          return ['user: do the thing', 'assistant: done', '⚙ Read'];
        },
        async listAvailableSessionIds() {
          return ['sess-exec-1'];
        },
      },
    });

    const result = await service.getTranscript({
      taskId: 'TASK-1',
      sessionId: 'sess-exec-1',
    });
    expect(result.messages).toEqual([
      { role: 'user', text: 'do the thing' },
      { role: 'assistant', text: 'done' },
      { role: 'tool', text: 'Read' },
    ]);
    expect(result.truncated).toBe(false);
  });

  it('redacts home paths in log tails', async () => {
    const service = new TaskTraceService({
      taskProvider: {
        async getTaskById() {
          return task({ logPath: '/tmp/x.log' });
        },
      },
      sessionProvider: {
        async getTranscript() {
          return [];
        },
        async listAvailableSessionIds() {
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
