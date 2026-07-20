import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type {
  BackgroundStartService,
  TaskManagerApplication,
} from '@rivus/agent-task-loop/task-manager';
import { loadOrCreateToken, parseBearerToken, timingSafeEqual } from './auth';
import { createRequestHandler, type RouteDependencies } from './routes';
import { SseBroadcaster } from './sse';

export interface LocalServerOptions {
  application: TaskManagerApplication;
  backgroundStart: BackgroundStartService;
  /** Session token for auth. If not provided, one is loaded/created from the state dir. */
  token?: string;
  /** Host to bind to. Must be 127.0.0.1 (default). Refuse public interfaces. */
  host?: string;
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
 * Create the local application server.
 *
 * - Binds to 127.0.0.1 only (refuses public interfaces).
 * - Requires Bearer token on all routes except /v1/health.
 * - Serves SSE on /v1/events.
 * - All responses are sanitized public DTOs.
 */
export function createLocalServer(options: LocalServerOptions): LocalServer {
  const host = options.host ?? LOOPBACK_HOST;
  if (host !== LOOPBACK_HOST && host !== '::1' && host !== 'localhost') {
    throw new Error(`Refusing to bind to non-loopback host: ${host}`);
  }

  const token = options.token ?? loadOrCreateToken();
  const broadcaster = new SseBroadcaster();

  const deps: RouteDependencies = {
    application: options.application,
    backgroundStart: options.backgroundStart,
    broadcaster,
  };

  const requestHandler = createRequestHandler(deps);

  const server = createHttpServer((req, res) => {
    // CORS: same-origin only (no CORS *). Loopback + Bearer token avoids CSRF.
    // No CORS headers sent — the UI is same-origin.

    // Auth: /v1/health is info-free and needs no token.
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    if (url.pathname !== '/v1/health') {
      const provided = parseBearerToken(req.headers.authorization);
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
