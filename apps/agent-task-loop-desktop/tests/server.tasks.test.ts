import { describe, expect, it, afterEach } from 'vitest';
import type { TaskManagerApplication } from '@rivus/agent-task-loop/task-manager';
import type { BackgroundStartService } from '@rivus/agent-task-loop/task-manager';
import { createLocalServer } from '../src/server/create-server.js';
import { createFakeApplication, createFakeBackgroundStart, fakeTaskRecord } from './fixtures.js';
import type { TaskRecord } from '@rivus/agent-task-loop/task-manager';

const TEST_TOKEN = 'test-session-token-1234567890abcdef';

describe('Task routes (happy paths)', () => {
  let server: Awaited<ReturnType<typeof createLocalServer>> | null = null;
  let baseUrl: string | null = null;
  let tasks: TaskRecord[] = [];

  async function startServer(): Promise<void> {
    tasks = [
      fakeTaskRecord({ taskId: 'TASK-1', title: 'First task', status: '待处理', targetAgent: 'claude' }),
      fakeTaskRecord({ taskId: 'TASK-2', title: 'Second task', status: '执行中', targetAgent: 'codex' }),
      fakeTaskRecord({ taskId: 'TASK-3', title: 'Third task', status: '已完成', targetAgent: 'claude' }),
    ];
    const application = createFakeApplication({ tasks }) as unknown as TaskManagerApplication;
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

  it('lists tasks with public fields only', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks?limit=50`, { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(3);
    expect(body.tasks).toHaveLength(3);
    expect(body.truncated).toBe(false);
    expect(body.tasks[0]).toHaveProperty('taskId', 'TASK-1');
    expect(body.tasks[0]).toHaveProperty('title', 'First task');
  });

  it('filters tasks by status', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks?status=${encodeURIComponent('执行中')}`, { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.tasks[0].taskId).toBe('TASK-2');
  });

  it('filters tasks by targetAgent', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks?targetAgent=claude`, { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(2);
  });

  it('applies the list limit', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks?limit=2`, { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(2);
    expect(body.truncated).toBe(true);
  });

  it('gets a single task by ID', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks/TASK-2`, { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task).toHaveProperty('taskId', 'TASK-2');
    expect(body.task).toHaveProperty('title', 'Second task');
  });

  it('returns 404 for a missing task', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks/TASK-404`, { headers: authHeaders });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('task-not-found');
  });

  it('creates a task', async () => {
    await startServer();
    const payload = {
      taskId: 'TASK-NEW',
      title: 'New task',
      project: 'new-project',
      targetAgent: 'codex',
      priority: 7,
      description: 'A new task',
    };
    const res = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ action: 'created', taskId: 'TASK-NEW' });
  });

  it('rejects invalid create input with 400', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'TASK-NEW' }), // missing required fields
    });
    expect(res.status).toBe(400);
  });

  it('starts a task via background kickoff', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/tasks/TASK-1/start`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxRounds: 3 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe('started');
    expect(body.taskId).toBe('TASK-1');
    expect(body).toHaveProperty('runPhase');
    expect(['running', 'recovering']).toContain(body.runPhase);
    // Response must not contain denied fields.
    expect(body.task).not.toHaveProperty('workspacePath');
    expect(body.task).not.toHaveProperty('runnerPid');
    expect(body.task).not.toHaveProperty('sessionId');
  });

  it('returns 404 for unknown route', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/unknown`, { headers: authHeaders });
    expect(res.status).toBe(404);
  });
});
