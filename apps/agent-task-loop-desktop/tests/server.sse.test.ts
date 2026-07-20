import { describe, expect, it, afterEach } from 'vitest';
import http from 'node:http';
import type { TaskManagerApplication } from '@rivus/agent-task-loop/task-manager';
import type { BackgroundStartService } from '@rivus/agent-task-loop/task-manager';
import { toPublicTask } from '@rivus/agent-task-loop/task-manager';
import { createLocalServer } from '../src/server/create-server';
import { createFakeApplication, createFakeBackgroundStart, fakeTaskRecord } from './fixtures';

const TEST_TOKEN = 'test-session-token-1234567890abcdef';

function connectSse(baseUrl: string, token: string): Promise<{ events: any[]; close: () => void }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/v1/events`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      },
      res => {
        const events: any[] = [];
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data:')) {
              try {
                events.push(JSON.parse(line.slice(5).trim()));
              } catch {
                // non-JSON (e.g. ": connected")
              }
            }
          }
        });
        const close = () => req.destroy();
        // Give the connection a moment to establish.
        setTimeout(() => resolve({ events, close }), 100);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('SSE event shape', () => {
  let server: Awaited<ReturnType<typeof createLocalServer>> | null = null;
  let baseUrl: string | null = null;

  async function startServer(): Promise<void> {
    const application = createFakeApplication() as unknown as TaskManagerApplication;
    const backgroundStart = createFakeBackgroundStart() as unknown as BackgroundStartService;
    server = createLocalServer({ application, backgroundStart, token: TEST_TOKEN });
    const info = await server.listen(0);
    baseUrl = `http://${info.host}:${info.port}`;
  }

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
      baseUrl = null;
    }
  });

  it('task.updated event uses public fields only', async () => {
    await startServer();
    const { events, close } = await connectSse(baseUrl!, TEST_TOKEN);

    const task = toPublicTask(fakeTaskRecord({ taskId: 'TASK-SSE' }));
    server!.broadcaster.broadcastTaskUpdated({
      taskId: 'TASK-SSE',
      status: '执行中',
      runPhase: 'running',
      task,
    });

    // Wait for the event to arrive.
    await new Promise(r => setTimeout(r, 200));

    expect(events.length).toBeGreaterThan(0);
    const event = events.find(e => e.type === 'task.updated');
    expect(event).toBeDefined();
    expect(event.type).toBe('task.updated');
    expect(event.taskId).toBe('TASK-SSE');
    expect(event.status).toBe('执行中');
    expect(event.runPhase).toBe('running');
    expect(event.task).toHaveProperty('taskId', 'TASK-SSE');
    expect(event.task).toHaveProperty('title');

    // Must not contain denied fields.
    expect(event.task).not.toHaveProperty('workspacePath');
    expect(event.task).not.toHaveProperty('runnerPid');
    expect(event.task).not.toHaveProperty('sessionId');
    expect(event.task).not.toHaveProperty('logPath');
    expect(event.task).not.toHaveProperty('runId');
    expect(event.task).not.toHaveProperty('lastError');

    close();
  });

  it('multiple clients receive the same broadcast', async () => {
    await startServer();
    const conn1 = await connectSse(baseUrl!, TEST_TOKEN);
    const conn2 = await connectSse(baseUrl!, TEST_TOKEN);

    expect(server!.broadcaster.clientCount).toBe(2);

    const task = toPublicTask(fakeTaskRecord({ taskId: 'TASK-MULTI' }));
    server!.broadcaster.broadcastTaskUpdated({
      taskId: 'TASK-MULTI',
      status: '待处理',
      runPhase: 'idle',
      task,
    });

    await new Promise(r => setTimeout(r, 200));

    expect(conn1.events.some(e => e.taskId === 'TASK-MULTI')).toBe(true);
    expect(conn2.events.some(e => e.taskId === 'TASK-MULTI')).toBe(true);

    conn1.close();
    conn2.close();
  });
});
