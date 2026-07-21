import { afterEach, describe, expect, it } from 'vitest';
import type {
  BackgroundStartService,
  TaskManagerApplication,
  TaskTraceService,
} from '@rivus/agent-task-loop/task-manager';
import { createLocalServer } from '../src/server/create-server.js';
import { createFakeApplication, createFakeBackgroundStart, fakeTaskRecord } from './fixtures.js';

const TEST_TOKEN = 'test-session-token-trace-abcdef012345';

describe('task trace routes', () => {
  let server: Awaited<ReturnType<typeof createLocalServer>> | null = null;
  let baseUrl = '';

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  async function start(trace: TaskTraceService): Promise<void> {
    const application = createFakeApplication({
      tasks: [fakeTaskRecord({ taskId: 'TASK-1' })],
    }) as unknown as TaskManagerApplication;
    const backgroundStart = createFakeBackgroundStart() as unknown as BackgroundStartService;
    server = createLocalServer({
      application,
      backgroundStart,
      token: TEST_TOKEN,
      trace,
    });
    const info = await server.listen(0);
    baseUrl = `http://${info.host}:${info.port}`;
  }

  const headers = { Authorization: `Bearer ${TEST_TOKEN}` };

  it('lists rounds through HTTP', async () => {
    await start({
      async listRounds(taskId: string) {
        return {
          taskId,
          rounds: [
            {
              key: 'sid:abc',
              round: 1,
              kind: 'execute',
              agent: 'claude',
              sessionId: 'abc',
              hasTranscript: true,
            },
          ],
        };
      },
      async getTranscript() {
        return {
          taskId: 'TASK-1',
          roundKey: 'sid:abc',
          sessionId: 'abc',
          messages: [{ role: 'user' as const, text: 'hi' }],
          truncated: false,
          lineCount: 1,
        };
      },
      async getLogTail() {
        return { taskId: 'TASK-1', lines: [], truncated: false, available: false };
      },
    } as unknown as TaskTraceService);

    const res = await fetch(`${baseUrl}/v1/tasks/TASK-1/rounds`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rounds).toHaveLength(1);
    expect(body.rounds[0].kind).toBe('execute');
    expect(JSON.stringify(body)).not.toContain('workspacePath');
  });

  it('returns transcript messages', async () => {
    await start({
      async listRounds() {
        return { taskId: 'TASK-1', rounds: [] };
      },
      async getTranscript(input: { taskId: string }) {
        expect(input.taskId).toBe('TASK-1');
        return {
          taskId: 'TASK-1',
          roundKey: 'r1',
          messages: [
            { role: 'user' as const, text: 'do it' },
            { role: 'assistant' as const, text: 'done' },
          ],
          truncated: false,
          lineCount: 2,
        };
      },
      async getLogTail() {
        return { taskId: 'TASK-1', lines: ['a'], truncated: false, available: true };
      },
    } as unknown as TaskTraceService);

    const res = await fetch(`${baseUrl}/v1/tasks/TASK-1/transcript?roundKey=r1`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('user');
  });
});
