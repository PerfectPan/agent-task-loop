import { spawn } from 'node:child_process';
import { lstat, readFile, readlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import os from 'node:os';
import { Readable, Writable } from 'node:stream';
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
  type Client,
  type ContentBlock,
  type McpServer,
  type StopReason,
  type Stream,
} from '@agentclientprotocol/sdk';
import type { AgentBinding } from '../contracts/agent';
import type {
  AgentConnection,
  AgentConnector,
  AgentProbe,
  PermissionOutcome,
  PermissionRequest,
  SessionUpdate,
  Unsubscribe,
} from '../contracts/connection';

/** JSON-RPC code the ACP spec reserves for "open a session after logging in". */
export const AUTH_REQUIRED_ERROR_CODE = -32000;

/** One started ACP process the connector speaks newline-delimited JSON over. */
export interface AcpProcessHandle {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable | undefined;
  exit: Promise<{ code: number | null; signal: string | null }>;
  kill(signal?: NodeJS.Signals): void;
}

export type AcpProcessSpawner = (binding: AgentBinding) => AcpProcessHandle;

export interface AcpConnectorOptions {
  /** Login shell the binding's command line runs through. */
  shell?: string;
  initializeTimeoutMs?: number;
  sessionTimeoutMs?: number;
  /**
   * How long an aborted prompt waits for the agent to honor `session/cancel`
   * before the client gives up on it; the runtime then discards the process.
   */
  cancelGraceMs?: number;
  /**
   * How long `close()` waits after SIGTERM before escalating to SIGKILL; a
   * process that ignores the term signal must not pin the key forever.
   */
  closeKillMs?: number;
  /** Test seam: start the process yourself instead of through the login shell. */
  spawnProcess?: AcpProcessSpawner;
}

const DEFAULT_INITIALIZE_TIMEOUT_MS = 45_000;
const DEFAULT_SESSION_TIMEOUT_MS = 30_000;
const DEFAULT_CANCEL_GRACE_MS = 5_000;
const DEFAULT_CLOSE_KILL_MS = 5_000;
const STDERR_TAIL_BYTES = 8_192;

/**
 * The one connector on the main path (docs/architecture/agent-collaboration.md): an ACP process per agent,
 * spawned through the person's login shell so an alias counts, one
 * `initialize` per process, sessions created per (room, agent).
 */
export class AcpConnector implements AgentConnector {
  private readonly shell: string;
  private readonly initializeTimeoutMs: number;
  private readonly sessionTimeoutMs: number;
  private readonly cancelGraceMs: number;
  private readonly closeKillMs: number;
  private readonly spawnProcess: AcpProcessSpawner;

  constructor(options: AcpConnectorOptions = {}) {
    this.shell = options.shell ?? '/bin/zsh';
    this.initializeTimeoutMs = options.initializeTimeoutMs ?? DEFAULT_INITIALIZE_TIMEOUT_MS;
    this.sessionTimeoutMs = options.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
    this.cancelGraceMs = options.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS;
    this.closeKillMs = options.closeKillMs ?? DEFAULT_CLOSE_KILL_MS;
    this.spawnProcess = options.spawnProcess ?? ((binding) => loginShellProcess(binding, this.shell));
  }

  async connect(binding: AgentBinding, signal?: AbortSignal): Promise<AgentConnection> {
    const handle = this.spawnProcess(binding);
    try {
      const opened = await this.openClient(handle, signal);
      return new AcpConnection(handle, opened, this.sessionTimeoutMs, this.cancelGraceMs, this.closeKillMs);
    } catch (error) {
      handle.kill();
      throw error;
    }
  }

  async probe(binding: AgentBinding, signal?: AbortSignal): Promise<AgentProbe> {
    signal?.throwIfAborted();
    let handle: AcpProcessHandle;
    try {
      handle = this.spawnProcess(binding);
    } catch (error) {
      return { status: 'missing', error: errorText(error) };
    }
    const tail = tailStream(handle.stderr);
    let opened: OpenedClient | undefined;
    try {
      opened = await this.openClient(handle, signal);
      // A trial session: the probe's one question is whether this binding can
      // open one, which is where agents report that they need a login.
      await withTimeout(
        opened.connection.newSession({ cwd: os.tmpdir(), mcpServers: [] }),
        this.sessionTimeoutMs,
        'session/new',
        signal,
      );
      return {
        status: 'ready',
        capabilities: opened.initialize.agentCapabilities ?? {},
        ...(opened.initialize.agentInfo
          ? {
              agentInfo: {
                name: opened.initialize.agentInfo.name,
                version: opened.initialize.agentInfo.version ?? '',
              },
            }
          : {}),
      };
    } catch (error) {
      if (isAuthRequiredError(error)) {
        return {
          status: 'needs-login',
          // authMethods lists the ways to log in. The S0 probes showed that a
          // logged-in codex or opencode still advertises them, so they are a
          // directory, never evidence of being logged out.
          authMethods: opened?.initialize.authMethods ?? [],
        };
      }
      const detail = [errorText(error), tail()].filter(Boolean).join('\n');
      return { status: 'missing', error: detail };
    } finally {
      handle.kill();
    }
  }

  private async openClient(handle: AcpProcessHandle, signal?: AbortSignal): Promise<OpenedClient> {
    const runtime: ConnectionRuntime = {
      updateHandlers: new Set(),
      permissionHandler: undefined,
      sessionRoots: new Map(),
    };
    const client: Client = {
      sessionUpdate: (params) => {
        runtime.updateHandlers.forEach((handler) => handler(params.update));
      },
      requestPermission: async (params) => {
        const request: PermissionRequest = {
          sessionId: params.sessionId,
          toolCall: params.toolCall,
          options: params.options,
        };
        const handler = runtime.permissionHandler;
        if (!handler) {
          return { outcome: { outcome: 'cancelled' } as const };
        }
        return { outcome: await handler(request) };
      },
      // The advertised fs is the session's cwd and nothing else: the handler
      // resolves the path against the root the session opened with, so an
      // agent cannot read or write through the client to somewhere the room
      // never gave it (docs/architecture/agent-collaboration.md: the client fs is confined to the session cwd).
      readTextFile: async (params) => {
        const path = await scopedPath(runtime, params.sessionId, params.path, 'fs/read_text_file');
        return { content: await readFile(path, 'utf8') };
      },
      writeTextFile: async (params) => {
        const path = await scopedPath(runtime, params.sessionId, params.path, 'fs/write_text_file');
        await writeFile(path, params.content, 'utf8');
        return {};
      },
    };
    const stream: Stream = ndJsonStream(
      Writable.toWeb(handle.stdin) as unknown as WritableStream<Uint8Array>,
      Readable.toWeb(handle.stdout) as unknown as ReadableStream<Uint8Array>,
    );
    const connection = new ClientSideConnection(() => client, stream);
    const initialize = await withTimeout(
      connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
        clientInfo: { name: 'rivus-agent-orchestration', version: '0.0.0' },
      }),
      this.initializeTimeoutMs,
      'initialize',
      signal,
    );
    return { connection, initialize, runtime };
  }
}

interface ConnectionRuntime {
  updateHandlers: Set<(update: SessionUpdate) => void>;
  permissionHandler: ((request: PermissionRequest) => Promise<PermissionOutcome>) | undefined;
  /** Each session's cwd, resolved: the root its client-fs calls are scoped to. */
  sessionRoots: Map<string, string>;
}

/**
 * The path an fs call may touch: inside the named session's root, symlinks
 * resolved, or an error the agent reads. Resolution walks every component
 * and follows each link — a link that lives inside the root but points out
 * is judged by where it points — and past the first component that does not
 * exist nothing below can exist either, so the rest hangs off the last real
 * directory as written.
 */
async function scopedPath(
  runtime: ConnectionRuntime,
  sessionId: string,
  target: string,
  label: string,
): Promise<string> {
  const root = runtime.sessionRoots.get(sessionId);
  if (!root) {
    throw new Error(`${label}: no session root for ${sessionId}`);
  }
  const resolved = await resolveReal(target, label);
  const within = relative(root, resolved);
  // `..` and `..`-prefixed components only: a name that merely starts with
  // two dots (`..foo`) is an ordinary in-root name.
  if (within === '' || (within !== '..' && !within.startsWith(`..${sep}`) && !isAbsolute(within))) {
    return resolved;
  }
  throw new Error(`${label}: ${target} is outside the session cwd`);
}

async function resolveReal(target: string, label: string): Promise<string> {
  // ACP paths are absolute; a relative one resolves against this process's
  // cwd, which is not a place the session named, so it is refused outright.
  if (!isAbsolute(target)) {
    throw new Error(`${label}: ${target} is not an absolute path`);
  }
  let current = resolve(target);
  for (let hops = 0; hops < 40; hops += 1) {
    const parts = current.split(sep);
    let walked: string = sep;
    let followed = false;
    for (let index = 1; index < parts.length; index += 1) {
      const part = parts[index]!;
      if (!part) {
        continue;
      }
      const next = join(walked, part);
      let stat: { isSymbolicLink(): boolean };
      try {
        stat = await lstat(next);
      } catch {
        return join(walked, ...parts.slice(index).filter(Boolean));
      }
      if (!stat.isSymbolicLink()) {
        walked = next;
        continue;
      }
      let linkTarget: string;
      try {
        linkTarget = await readlink(next);
      } catch {
        throw new Error(`${label}: ${next} cannot be resolved`);
      }
      // The link's own target may hold links of its own: walk it next pass,
      // with the rest of the original path hanging off it.
      const rest = parts.slice(index + 1).filter(Boolean);
      current = join(isAbsolute(linkTarget) ? linkTarget : resolve(walked, linkTarget), ...rest);
      followed = true;
      break;
    }
    if (!followed) {
      return walked;
    }
  }
  // A chain this long is a loop or a fight. Returning the last link would
  // hand the OS a path it would happily follow the rest of the way out of
  // the root, so the walk refuses instead.
  throw new Error(`${label}: ${target} resolves through too many symlinks`);
}

interface OpenedClient {
  connection: ClientSideConnection;
  initialize: Awaited<ReturnType<ClientSideConnection['initialize']>>;
  runtime: ConnectionRuntime;
}

/**
 * The connection half of {@link AcpConnector}: one long-lived process, one
 * `initialize`, sessions created on demand, the two inbound ACP streams
 * fanned out to subscribers.
 */
class AcpConnection implements AgentConnection {
  constructor(
    private readonly handle: AcpProcessHandle,
    private readonly opened: OpenedClient,
    private readonly sessionTimeoutMs: number,
    private readonly cancelGraceMs: number,
    private readonly closeKillMs: number,
  ) {
    void this.handle.exit.catch(() => undefined);
  }

  async newSession(input: { cwd: string; mcpServers?: McpServer[]; meta?: Record<string, unknown> }): Promise<string> {
    const response = await withTimeout(
      this.opened.connection.newSession({
        cwd: input.cwd,
        mcpServers: input.mcpServers ?? [],
        ...(input.meta ? { _meta: input.meta } : {}),
      }),
      this.sessionTimeoutMs,
      'session/new',
    );
    // The root the session's client-fs calls are scoped to; the resolved
    // path, so a symlinked cwd cannot smuggle a different root in.
    this.opened.runtime.sessionRoots.set(
      response.sessionId,
      await resolveReal(input.cwd, 'session/new').catch(() => input.cwd),
    );
    return response.sessionId;
  }

  async prompt(session: string, blocks: ContentBlock[], signal?: AbortSignal): Promise<{ stopReason: StopReason }> {
    // A turn already cancelled never prompts: the runtime is discarding this
    // connection, and nobody would wait for the answer.
    signal?.throwIfAborted();
    if (!signal) {
      const result = await this.opened.connection.prompt({ sessionId: session, prompt: blocks });
      return { stopReason: result.stopReason };
    }
    let grace: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => {
        void this.opened.connection.cancel({ sessionId: session }).catch(() => undefined);
        // An adapter that ignores session/cancel would hold the turn forever;
        // past the grace the prompt rejects, the runtime discards the
        // process, and the next activation starts a fresh one.
        grace = setTimeout(
          () => reject(abortReason(signal, `session/prompt in ${session} survived session/cancel`)),
          this.cancelGraceMs,
        );
        grace.unref?.();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
    void aborted.catch(() => undefined);
    try {
      const result = await Promise.race([
        this.opened.connection.prompt({ sessionId: session, prompt: blocks }),
        aborted,
      ]);
      return { stopReason: result.stopReason };
    } finally {
      signal.removeEventListener('abort', onAbort!);
      if (grace) {
        clearTimeout(grace);
      }
    }
  }

  async cancel(session: string): Promise<void> {
    await this.opened.connection.cancel({ sessionId: session });
  }

  onUpdate(handler: (update: SessionUpdate) => void): Unsubscribe {
    this.opened.runtime.updateHandlers.add(handler);
    return () => {
      this.opened.runtime.updateHandlers.delete(handler);
    };
  }

  onPermissionRequest(handler: (request: PermissionRequest) => Promise<PermissionOutcome>): Unsubscribe {
    const runtime = this.opened.runtime;
    const previous = runtime.permissionHandler;
    // One turn answers permissions at a time; the newest handler wins.
    runtime.permissionHandler = handler;
    return () => {
      if (runtime.permissionHandler === handler) {
        runtime.permissionHandler = previous;
      }
    };
  }

  async close(): Promise<void> {
    this.handle.kill();
    const exited = await Promise.race([
      this.handle.exit.then(
        () => true,
        () => true,
      ),
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), this.closeKillMs);
        timer.unref?.();
      }),
    ]);
    if (exited) {
      return;
    }
    // A process that sat through SIGTERM — the lease stays held and the
    // heartbeat keeps it fresh until the process is really gone.
    this.handle.kill('SIGKILL');
    await this.handle.exit.catch(() => undefined);
  }
}

/** Spawn the binding through the person's login shell so an alias counts. */
export function loginShellProcess(binding: AgentBinding, shell = '/bin/zsh'): AcpProcessHandle {
  const line = [binding.command, ...(binding.args ?? [])].join(' ').trim();
  const child = spawn(shell, ['-lic', line], {
    env: { ...process.env, ...binding.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exit = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', reject);
  });
  return {
    stdin: child.stdin!,
    stdout: child.stdout!,
    stderr: child.stderr,
    exit,
    kill: (signal) => {
      child.kill(signal ?? 'SIGTERM');
    },
  };
}

export function isAuthRequiredError(error: unknown): boolean {
  if (error instanceof RequestError && error.code === AUTH_REQUIRED_ERROR_CODE) {
    return true;
  }
  return /auth[\s_-]?required/i.test(error instanceof Error ? error.message : String(error));
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function abortReason(signal: AbortSignal, fallback: string): Error {
  return signal.reason instanceof Error ? signal.reason : new Error(fallback);
}

function tailStream(stream: Readable | undefined, maxBytes = STDERR_TAIL_BYTES): () => string {
  if (!stream) {
    return () => '';
  }
  let text = '';
  stream.on('data', (chunk: Buffer) => {
    text = `${text}${chunk.toString('utf8')}`.slice(-maxBytes);
  });
  return () => text.trim();
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref?.();
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error(`${label} aborted`));
      },
      { once: true },
    );
  });
  void timeout.catch(() => undefined);
  return Promise.race([promise, timeout]);
}
