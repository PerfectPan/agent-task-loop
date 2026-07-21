import { describe, expect, it, afterEach } from 'vitest';
import type { TaskManagerApplication } from '@rivus/agent-task-loop/task-manager';
import type { BackgroundStartService } from '@rivus/agent-task-loop/task-manager';
import { createLocalServer } from '../src/server/create-server';
import { createFakeApplication, createFakeBackgroundStart } from './fixtures';

const TEST_TOKEN = 'test-session-token-1234567890abcdef';

describe('Authentication boundary', () => {
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

  it('returns 401 for unauthenticated request to a protected route', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'unauthenticated', message: 'Authentication required' } });
  });

  it('returns 401 when the token is invalid', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks`, {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the Authorization header is malformed', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks`, {
      headers: { Authorization: 'NotBearer token' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for unauthenticated POST /v1/tasks', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'T-1', title: 'T', project: 'P', targetAgent: 'claude', priority: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for unauthenticated POST /v1/tasks/:id/start', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks/T-1/start`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for unauthenticated GET /v1/events (SSE)', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/events`);
    expect(res.status).toBe(401);
  });

  it('allows unauthenticated GET /v1/health (no secrets)', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
    // Health must not leak any secrets.
    expect(JSON.stringify(body)).not.toContain(TEST_TOKEN);
  });

  it('allows authenticated requests with the correct Bearer token', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
  });

  it('serves the UI HTML at / with config injected (no auth required)', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    // Config must be injected.
    expect(html).toContain('window.__ATL_CONFIG__');
    expect(html).toContain(TEST_TOKEN);
    expect(html).toContain(baseUrl!);
    // UI must not contain the raw token outside of the config injection.
    // (It appears once in the injected script.)
    const tokenOccurrences = html.split(TEST_TOKEN).length - 1;
    expect(tokenOccurrences).toBe(1);
  });

  it('allows SSE connection with token via query param', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/events?token=${encodeURIComponent(TEST_TOKEN)}`, {
      headers: { Accept: 'text/event-stream' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('returns 401 for SSE with invalid query param token', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/events?token=wrong-token`, {
      headers: { Accept: 'text/event-stream' },
    });
    expect(res.status).toBe(401);
  });
});
