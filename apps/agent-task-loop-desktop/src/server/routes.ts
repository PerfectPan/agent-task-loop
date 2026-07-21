import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type {
  CreateTaskPayload,
  PublicTaskDto,
  TaskManagerApplication,
} from '@rivus/agent-task-loop/task-manager';
import {
  createTaskInputSchema,
  getTaskInputSchema,
  listTasksInputSchema,
  startTaskInputSchema,
} from '@rivus/agent-task-loop/task-manager';
import type { BackgroundStartService, RunPhase } from '@rivus/agent-task-loop/task-manager';
import type { SseBroadcaster } from './sse.js';
import { mapErrorToResponse, sanitizePublicTask } from './redact.js';

export interface RouteDependencies {
  application: TaskManagerApplication;
  backgroundStart: BackgroundStartService;
  broadcaster: SseBroadcaster;
}

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
    sendJson(res, 200, result);
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
