import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  BackgroundStartService,
  DesktopWorkspaceSnapshot,
  TaskManagerApplication,
  TaskTraceService,
} from '@rivus/agent-task-loop/task-manager';
import { loadOrCreateToken, parseBearerToken, timingSafeEqual } from './auth.js';
import { ConsoleAgent } from './console-agent.js';
import { createRequestHandler, type RouteDependencies } from './routes.js';
import { SseBroadcaster } from './sse.js';

const EMPTY_WORKSPACE: DesktopWorkspaceSnapshot = {
  projects: [],
  repositories: [],
  sources: [],
  agents: [],
};

export interface LocalServerOptions {
  application: TaskManagerApplication;
  backgroundStart: BackgroundStartService;
  workspace?: DesktopWorkspaceSnapshot;
  trace?: TaskTraceService;
  /** Session token for auth. If not provided, one is loaded/created from the state dir. */
  token?: string;
  /** Host to bind to. Must be 127.0.0.1 (default). Refuse public interfaces. */
  host?: string;
  /** Disable Rivus console agent (tests). Default: enabled. */
  enableAgent?: boolean;
}

export interface LocalServer {
  /** Start listening on the given port (0 = ephemeral). */
  listen(port?: number): Promise<{ port: number; host: string; token: string }>;
  /** Stop the server. */
  close(): Promise<void>;
  /** The SSE broadcaster (for tests / manual events). */
  broadcaster: SseBroadcaster;
  /** The session token. */
  token: string;
}

const LOOPBACK_HOST = '127.0.0.1';

/**
 * Resolve the UI HTML path. Prefer package `src/ui` (always the latest
 * source) over a stale `dist` copy.
 */
function resolveUiHtmlPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const serverDir = dirname(currentFile);
  let dir = serverDir;
  for (let i = 0; i < 8; i++) {
    const srcUi = join(dir, 'src', 'ui', 'index.html');
    if (existsSync(srcUi)) return srcUi;
    const next = join(dir, '..');
    if (next === dir) break;
    dir = next;
  }
  // Fallback: sibling ui/ next to server/
  const sibling = join(serverDir, '..', 'ui', 'index.html');
  return sibling;
}

/**
 * Serve the UI HTML with the loopback config injected.
 * The UI is served same-origin so it can call the API without CORS.
 */
async function serveUi(
  req: IncomingMessage,
  res: ServerResponse,
  htmlPath: string,
  _host: string,
  token: string,
): Promise<void> {
  try {
    // Derive baseUrl from the request's Host header (includes port).
    const hostHeader = req.headers.host ?? '127.0.0.1';
    const baseUrl = `http://${hostHeader}`;
    // Always re-resolve so a rebuilt src/ui is picked up without restart when possible.
    const resolvedPath = existsSync(htmlPath) ? htmlPath : resolveUiHtmlPath();
    let html = await readFile(resolvedPath, 'utf-8');
    const mtime = (await stat(resolvedPath)).mtimeMs;
    const configScript = `<script>window.__ATL_CONFIG__ = ${JSON.stringify({ baseUrl, token, uiMtime: mtime })};</script>`;
    html = html.replace('</head>', `${configScript}\n<meta http-equiv="Cache-Control" content="no-store" />\n</head>`);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    });
    res.end(html);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('UI not found');
  }
}

/**
 * Create the local application server.
 *
 * - Binds to 127.0.0.1 only (refuses public interfaces).
 * - Requires Bearer token on all routes except /v1/health.
 * - Serves the UI HTML at / (same-origin, config injected).
 * - Serves SSE on /v1/events (token also accepted via ?token= for browsers).
 * - All responses are sanitized public DTOs.
 */
export function createLocalServer(options: LocalServerOptions): LocalServer {
  const host = options.host ?? LOOPBACK_HOST;
  if (host !== LOOPBACK_HOST && host !== '::1' && host !== 'localhost') {
    throw new Error(`Refusing to bind to non-loopback host: ${host}`);
  }

  const token = options.token ?? loadOrCreateToken();
  const broadcaster = new SseBroadcaster();
  const uiHtmlPath = resolveUiHtmlPath();

  const workspace = options.workspace ?? EMPTY_WORKSPACE;

  const consoleAgent =
    options.enableAgent === false
      ? undefined
      : new ConsoleAgent({
          application: options.application,
          backgroundStart: options.backgroundStart,
          workspace,
          onMutation: async taskId => {
            if (!taskId) {
              broadcaster.broadcastBoardRefresh();
              return;
            }
            try {
              const { task } = await options.application.getTask({ taskId });
              broadcaster.broadcastTaskUpdated({
                taskId,
                status: task.status,
                runPhase: options.backgroundStart.registry.get(taskId),
                task,
              });
            } catch {
              broadcaster.broadcastBoardRefresh();
            }
          },
        });

  const deps: RouteDependencies = {
    application: options.application,
    backgroundStart: options.backgroundStart,
    workspace,
    broadcaster,
    consoleAgent,
    trace: options.trace,
  };

  const requestHandler = createRequestHandler(deps);

  const server = createHttpServer((req, res) => {
    // CORS: same-origin only (no CORS *). Loopback + Bearer token avoids CSRF.
    // No CORS headers sent — the UI is same-origin.

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);

    // Serve the UI at / (same-origin). Config is injected into the HTML.
    if ((url.pathname === '/' || url.pathname === '/ui' || url.pathname === '/index.html') && (req.method ?? 'GET') === 'GET') {
      serveUi(req, res, uiHtmlPath, host, token);
      return;
    }

    // Auth: /v1/health is info-free and needs no token.
    if (url.pathname !== '/v1/health') {
      // For SSE, also accept the token via query param (EventSource cannot
      // set custom headers). This is safe because the UI is same-origin and
      // the token is a short-lived local session token.
      const provided = parseBearerToken(req.headers.authorization)
        ?? (url.pathname === '/v1/events' ? url.searchParams.get('token') : null);
      if (!provided || !timingSafeEqual(provided, token)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'unauthenticated', message: 'Authentication required' } }));
        return;
      }
    }

    requestHandler(req, res).catch(error => {
      // Last-resort error handler — should not normally be reached.
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'internal-error', message: 'An unexpected error occurred' } }));
    });
  });

  // Keep-alive for SSE.
  server.keepAliveTimeout = 0;
  server.headersTimeout = 0;

  return {
    broadcaster,
    token,
    listen(port?: number) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port ?? 0, host, () => {
          const address = server.address();
          const actualPort = typeof address === 'object' && address ? address.port : port ?? 0;
          resolve({ port: actualPort, host, token });
        });
      });
    },
    close() {
      broadcaster.closeAll();
      return new Promise<void>((resolve, reject) => {
        server.close(err => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
