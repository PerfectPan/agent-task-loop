import { describe, expect, it, afterEach } from 'vitest';
import type { TaskManagerApplication } from '@rivus/agent-task-loop/task-manager';
import type { BackgroundStartService } from '@rivus/agent-task-loop/task-manager';
import { createLocalServer } from '../src/server/create-server';
import { createFakeApplication, createFakeBackgroundStart } from './fixtures';

const TEST_TOKEN = 'test-session-token-1234567890abcdef';

describe('Background start boundary', () => {
  let server: Awaited<ReturnType<typeof createLocalServer>> | null = null;
  let baseUrl: string | null = null;

  async function startServer(backgroundStart: BackgroundStartService): Promise<void> {
    const application = createFakeApplication() as unknown as TaskManagerApplication;
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

  const authHeaders = { Authorization: `Bearer ${TEST_TOKEN}` };

  it('returns 409 conflict when a task is already active', async () => {
    const backgroundStart = createFakeBackgroundStart({ alreadyActive: true }) as unknown as BackgroundStartService;
    await startServer(backgroundStart);

    const res = await fetch(`${baseUrl}/v1/tasks/TASK-1/start`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxRounds: 5 }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('task-already-active');
    expect(body.error).toHaveProperty('message');
  });

  it('returns quickly without awaiting the full review loop', async () => {
    // Fake background start: loop completes after 5 seconds.
    const backgroundStart = createFakeBackgroundStart({
      loopDelayMs: 5000,
    }) as unknown as BackgroundStartService;
    await startServer(backgroundStart);

    const start = Date.now();
    const res = await fetch(`${baseUrl}/v1/tasks/TASK-1/start`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxRounds: 5 }),
    });
    const elapsed = Date.now() - start;

    // HTTP must return well before the 5s loop completes.
    expect(elapsed).toBeLessThan(500);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.action).toBe('started');
    expect(body.runPhase).toBe('running');
    // The run phase should still be 'running' since the loop hasn't finished.
    expect(server!.broadcaster).toBeDefined();
  });

  it('returns 200 with runPhase=recovering for stale tasks', async () => {
    const backgroundStart = createFakeBackgroundStart({
      runPhase: 'recovering',
    }) as unknown as BackgroundStartService;
    await startServer(backgroundStart);

    const res = await fetch(`${baseUrl}/v1/tasks/TASK-1/start`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxRounds: 5 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runPhase).toBe('recovering');
  });

  it('validates start input (rejects invalid maxRounds)', async () => {
    const backgroundStart = createFakeBackgroundStart() as unknown as BackgroundStartService;
    await startServer(backgroundStart);

    const res = await fetch(`${baseUrl}/v1/tasks/TASK-1/start`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxRounds: 999 }), // exceeds max of 20
    });
    expect(res.status).toBe(400);
  });
});
