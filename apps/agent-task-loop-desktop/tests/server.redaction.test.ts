import { describe, expect, it, afterEach } from 'vitest';
import http from 'node:http';
import type { TaskManagerApplication } from '@rivus/agent-task-loop/task-manager';
import type { BackgroundStartService } from '@rivus/agent-task-loop/task-manager';
import { createLocalServer } from '../src/server/create-server';
import {
  adversarialTaskRecord,
  createFakeApplication,
  createFakeBackgroundStart,
  DENIED_FIELDS,
} from './fixtures';
import type { TaskRecord } from '@rivus/agent-task-loop/task-manager';

const TEST_TOKEN = 'test-session-token-1234567890abcdef';

/**
 * Recursively collect all keys from a JSON-serializable object.
 */
function collectKeys(obj: unknown, keys: Set<string> = new Set()): Set<string> {
  if (obj === null || typeof obj !== 'object') return keys;
  if (Array.isArray(obj)) {
    obj.forEach(item => collectKeys(item, keys));
    return keys;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    keys.add(key);
    collectKeys(value, keys);
  }
  return keys;
}

describe('Response redaction (adversarial)', () => {
  let server: Awaited<ReturnType<typeof createLocalServer>> | null = null;
  let baseUrl: string | null = null;

  async function startServer(): Promise<void> {
    const task = adversarialTaskRecord();
    const application = createFakeApplication({
      tasks: [task],
      startResult: task,
    }) as unknown as TaskManagerApplication;
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

  const authHeaders = { Authorization: `Bearer ${TEST_TOKEN}` };

  it('GET /v1/tasks does not expose denied fields', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks`, { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = await res.json();
    const keys = collectKeys(body);
    for (const field of DENIED_FIELDS) {
      expect(keys.has(field), `Denied field "${field}" leaked into /v1/tasks response`).toBe(false);
    }
  });

  it('GET /v1/tasks/:id does not expose denied fields', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks/TASK-SECRET`, { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = await res.json();
    const keys = collectKeys(body);
    for (const field of DENIED_FIELDS) {
      expect(keys.has(field), `Denied field "${field}" leaked into /v1/tasks/:id response`).toBe(false);
    }
  });

  it('POST /v1/tasks/:id/start does not expose denied fields', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks/TASK-SECRET/start`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxRounds: 5 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const keys = collectKeys(body);
    for (const field of DENIED_FIELDS) {
      expect(keys.has(field), `Denied field "${field}" leaked into start response`).toBe(false);
    }
  });

  it('GET /v1/events (SSE) does not expose denied fields', async () => {
    await startServer();
    const { toPublicTask } = await import('@rivus/agent-task-loop/task-manager');
    const publicTask = toPublicTask(adversarialTaskRecord());

    // Connect via SSE first, wait for the connection to be ready.
    const eventData = await new Promise<string>((resolve, reject) => {
      const url = new URL(`${baseUrl}/v1/events`);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          headers: { Authorization: `Bearer ${TEST_TOKEN}`, Accept: 'text/event-stream' },
        },
        res => {
          let data = '';
          res.setEncoding('utf8');
          const timeout = setTimeout(() => {
            req.destroy();
            reject(new Error('SSE timeout'));
          }, 3000);
          res.on('data', (chunk: string) => {
            data += chunk;
            // Once the connection is established (": connected" arrives),
            // broadcast the adversarial event.
            if (data.includes(': connected') && !data.includes('data: {')) {
              server!.broadcaster.broadcastTaskUpdated({
                taskId: 'TASK-SECRET',
                status: '执行中',
                runPhase: 'running',
                task: publicTask,
              });
            }
            if (data.includes('data: {')) {
              clearTimeout(timeout);
              req.destroy();
              resolve(data);
            }
          });
        },
      );
      req.on('error', reject);
      req.end();
    });

    // The SSE data should contain the public task fields only.
    const keys = new Set<string>();
    for (const line of eventData.split('\n')) {
      if (line.startsWith('data:')) {
        try {
          const parsed = JSON.parse(line.slice(5).trim());
          collectKeys(parsed, keys);
        } catch {
          // non-JSON data line (e.g. ": connected")
        }
      }
    }
    for (const field of DENIED_FIELDS) {
      expect(keys.has(field), `Denied field "${field}" leaked into SSE event`).toBe(false);
    }
  });

  it('error responses do not leak raw backend messages', async () => {
    await startServer();
    // Restart server with a background start that throws a raw error.
    if (server) await server.close();
    const application = createFakeApplication() as unknown as TaskManagerApplication;
    const rawBackgroundStart = {
      registry: new Map(),
      async startTaskBackground() {
        throw new Error('raw backend failure with /Users/bytedance/.ssh/config and token ghp_SECRET');
      },
    } as unknown as BackgroundStartService;
    server = createLocalServer({ application, backgroundStart: rawBackgroundStart, token: TEST_TOKEN });
    const info = await server.listen(0);
    baseUrl = `http://${info.host}:${info.port}`;

    const res = await fetch(`${baseUrl}/v1/tasks/TASK-1/start`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxRounds: 5 }),
    });
    const body = await res.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('/Users/');
    expect(bodyStr).not.toContain('ghp_SECRET');
    expect(body.error).toHaveProperty('code');
  });
});
