import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type {
  CreateTaskPayload,
  TaskManagerApplication,
} from '@rivus/agent-task-loop/task-manager';
import {
  createTaskInputSchema,
  getTaskInputSchema,
  listTasksInputSchema,
  startTaskInputSchema,
} from '@rivus/agent-task-loop/task-manager';
import type { BackgroundStartService } from '@rivus/agent-task-loop/task-manager';
import type { ConsoleAgent } from './console-agent.js';
import type { SseBroadcaster } from './sse.js';
import { mapErrorToResponse, sanitizePublicTask } from './redact.js';
import { z } from 'zod';

export interface RouteDependencies {
  application: TaskManagerApplication;
  backgroundStart: BackgroundStartService;
  broadcaster: SseBroadcaster;
  consoleAgent?: ConsoleAgent;
}

const chatInputSchema = z
  .object({
    message: z.string().min(1).max(4_000),
    sessionId: z.string().min(1).max(64).optional(),
  })
  .strict();

type ParsedBody = Record<string, unknown> | null;

async function parseJsonBody(req: IncomingMessage): Promise<ParsedBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function createRequestHandler(deps: RouteDependencies) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      await handleRequest(req, res, deps);
    } catch (error) {
      const { status, body } = mapErrorToResponse(error);
      sendJson(res, status, body);
    }
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RouteDependencies,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const method = req.method ?? 'GET';
  const pathname = url.pathname;

  // GET /v1/health — no secrets, no auth required
  if (method === 'GET' && pathname === '/v1/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  // GET /v1/events — SSE stream
  if (method === 'GET' && pathname === '/v1/events') {
    deps.broadcaster.attach(res);
    return;
  }

  // GET /v1/tasks — list
  if (method === 'GET' && pathname === '/v1/tasks') {
    const parsed = listTasksInputSchema.safeParse({
      status: url.searchParams.get('status') ?? undefined,
      targetAgent: url.searchParams.get('targetAgent') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });
    if (!parsed.success) {
      sendJson(res, 400, { error: { code: 'invalid-input', message: validationMessage(parsed.error.issues) } });
      return;
    }
    const result = await deps.application.listTasks(parsed.data);
    sendJson(res, 200, {
      count: result.count,
      tasks: result.tasks.map(sanitizePublicTask),
      truncated: result.truncated,
    });
    return;
  }

  // GET /v1/tasks/:id — get
  const getMatch = /^\/v1\/tasks\/([^/]+)$/.exec(pathname);
  if (method === 'GET' && getMatch) {
    const parsed = getTaskInputSchema.safeParse({ taskId: decodeURIComponent(getMatch[1]!) });
    if (!parsed.success) {
      sendJson(res, 400, { error: { code: 'invalid-input', message: validationMessage(parsed.error.issues) } });
      return;
    }
    const result = await deps.application.getTask(parsed.data);
    sendJson(res, 200, { task: sanitizePublicTask(result.task) });
    return;
  }

  // POST /v1/tasks — create
  if (method === 'POST' && pathname === '/v1/tasks') {
    const body = await parseJsonBody(req);
    if (!body) {
      sendJson(res, 400, { error: { code: 'invalid-input', message: 'Request body must be valid JSON' } });
      return;
    }
    const parsed = createTaskInputSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { error: { code: 'invalid-input', message: validationMessage(parsed.error.issues) } });
      return;
    }
      const result = await deps.application.createTask(parsed.data as CreateTaskPayload);
      deps.broadcaster.broadcastBoardRefresh();
      sendJson(res, 201, result);
      return;
    }

    // POST /v1/tasks/:id/start — background kickoff
    const startMatch = /^\/v1\/tasks\/([^/]+)\/start$/.exec(pathname);
    if (method === 'POST' && startMatch) {
      const body = await parseJsonBody(req);
      const parsed = startTaskInputSchema.safeParse({
        taskId: decodeURIComponent(startMatch[1]!),
        ...(body ?? {}),
      });
      if (!parsed.success) {
        sendJson(res, 400, { error: { code: 'invalid-input', message: validationMessage(parsed.error.issues) } });
        return;
      }
      const result = await deps.backgroundStart.startTaskBackground(parsed.data);
      deps.broadcaster.broadcastTaskUpdated({
        taskId: result.taskId,
        status: result.task.status,
        runPhase: result.runPhase,
        task: result.task,
      });
      sendJson(res, 200, {
        action: result.action,
        taskId: result.taskId,
        runPhase: result.runPhase,
        task: sanitizePublicTask(result.task),
      });
      return;
    }

    // POST /v1/chat — Rivus Task Manager console agent
    if (method === 'POST' && pathname === '/v1/chat') {
      if (!deps.consoleAgent) {
        sendJson(res, 503, {
          error: { code: 'agent-unavailable', message: 'Console agent is not configured' },
        });
        return;
      }
      const body = await parseJsonBody(req);
      if (!body) {
        sendJson(res, 400, { error: { code: 'invalid-input', message: 'Request body must be valid JSON' } });
        return;
      }
      const parsed = chatInputSchema.safeParse(body);
      if (!parsed.success) {
        sendJson(res, 400, { error: { code: 'invalid-input', message: validationMessage(parsed.error.issues) } });
        return;
      }
      const result = await deps.consoleAgent.chat(parsed.data);
      sendJson(res, 200, result);
      return;
    }

    // GET /v1/meta — lightweight console metadata (no secrets)
    if (method === 'GET' && pathname === '/v1/meta') {
      sendJson(res, 200, {
        name: 'agent-task-loop-desktop',
        tools: [
          'agent-task-loop/task-list',
          'agent-task-loop/task-get',
          'agent-task-loop/task-create',
          'agent-task-loop/task-start',
        ],
        agents: ['claude', 'codex', 'coco', 'glm'],
        statuses: [
          '待处理',
          '进行中',
          '执行中',
          '待复核',
          '修复中',
          '待决策',
          '待发布',
          '待验收',
          '已完成',
          '已失败',
        ],
      });
      return;
    }

    sendJson(res, 404, { error: { code: 'not-found', message: 'Route not found' } });
  }

function validationMessage(issues: Array<{ code?: string; path?: PropertyKey[] }>): string {
  const issue = issues[0];
  if (!issue) return 'Invalid input';
  const field = issue.path?.length ? issue.path.slice(0, 3).join('.') : 'input';
  return `Invalid ${field}`;
}
