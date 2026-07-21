import { afterEach, describe, expect, it } from 'vitest';
import type { BackgroundStartService, TaskManagerApplication } from '@rivus/agent-task-loop/task-manager';
import { createLocalServer } from '../src/server/create-server.js';
import {
  createFakeApplication,
  createFakeBackgroundStart,
  fakeTaskRecord,
} from './fixtures.js';

const TEST_TOKEN = 'test-session-token-chat-abcdef012345';

describe('console agent chat', () => {
  let server: Awaited<ReturnType<typeof createLocalServer>> | null = null;
  let baseUrl = '';

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  async function start(): Promise<void> {
    const tasks = [
      fakeTaskRecord({ taskId: 'TASK-1', title: 'Alpha', status: '待处理' }),
      fakeTaskRecord({ taskId: 'TASK-2', title: 'Beta', status: '执行中' }),
    ];
    const application = createFakeApplication({ tasks }) as unknown as TaskManagerApplication;
    const backgroundStart = createFakeBackgroundStart() as unknown as BackgroundStartService;
    server = createLocalServer({ application, backgroundStart, token: TEST_TOKEN });
    const info = await server.listen(0);
    baseUrl = `http://${info.host}:${info.port}`;
  }

  const headers = {
    Authorization: `Bearer ${TEST_TOKEN}`,
    'Content-Type': 'application/json',
  };

  it('lists tasks through /v1/chat without leaking denied fields', async () => {
    await start();
    const res = await fetch(`${baseUrl}/v1/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'list tasks' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reply: string;
      toolCalls: Array<{ toolId: string; ok: boolean }>;
    };
    expect(body.toolCalls.some(t => t.toolId.includes('task-list') && t.ok)).toBe(true);
    expect(body.reply.toLowerCase()).toMatch(/task|listed|alpha|beta/i);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('workspacePath');
    expect(raw).not.toContain('runnerPid');
    expect(raw).not.toMatch(/\/Users\/[A-Za-z]/);
  });

  it('rejects unauthenticated chat', async () => {
    await start();
    const res = await fetch(`${baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'list tasks' }),
    });
    expect(res.status).toBe(401);
  });

  it('exposes meta without secrets', async () => {
    await start();
    const res = await fetch(`${baseUrl}/v1/meta`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: string[] };
    expect(body.tools).toContain('agent-task-loop/task-list');
    expect(body.tools).toHaveLength(4);
  });
});
