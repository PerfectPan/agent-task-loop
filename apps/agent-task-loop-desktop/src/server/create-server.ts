import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  BackgroundStartService,
  TaskManagerApplication,
} from '@rivus/agent-task-loop/task-manager';
import { loadOrCreateToken, parseBearerToken, timingSafeEqual } from './auth.js';
import { ConsoleAgent } from './console-agent.js';
import { createRequestHandler, type RouteDependencies } from './routes.js';
import { SseBroadcaster } from './sse.js';

export interface LocalServerOptions {
  application: TaskManagerApplication;
  backgroundStart: BackgroundStartService;
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
 * Resolve the path to the UI HTML file. Works in both source (tsx) and
 * compiled (dist) layouts.
 */
function resolveUiHtmlPath(): string {
  // When running via tsx, import.meta.url points to src/server/create-server.ts.
  // When compiled, it points to dist/server/create-server.js.
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = join(currentFile, '..');
  // Dev: src/ui/index.html (two levels up from src/server/)
  const srcUiPath = join(currentDir, '../ui/index.html');
  // Production: dist/ui/index.html (one level up from dist/server/)
  const distUiPath = join(currentDir, '../../src/ui/index.html');
  // Prefer the source path (dev); the build script copies UI to dist.
  return srcUiPath;
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
    let html = await readFile(htmlPath, 'utf-8');
    // Inject config so the UI knows where to reach the API and what token to use.
    // The UI reads window.__ATL_CONFIG__ on load.
    const configScript = `<script>window.__ATL_CONFIG__ = ${JSON.stringify({ baseUrl, token })};</script>`;
    html = html.replace('</head>', `${configScript}</head>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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

  const consoleAgent =
    options.enableAgent === false
      ? undefined
      : new ConsoleAgent({
          application: options.application,
          backgroundStart: options.backgroundStart,
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
    broadcaster,
    consoleAgent,
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
