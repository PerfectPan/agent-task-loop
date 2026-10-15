import os from 'node:os';
import {
  agentEnv,
  builtinAcpProfiles,
  connectAgent,
  probeAgent,
  type AcpConnection,
  type AcpProfile,
  type AcpSessionHandle,
  type ConnectError,
  type NewSessionError,
  type PermissionCallback,
  type PromptBlock,
  type PromptError,
  type TranscriptStreamPart,
} from '@rivus/agent-kit/acp';
import type { PlatformService } from '@rivus/agent-kit/platform/effect';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Option from 'effect/Option';
import type * as Scope from 'effect/Scope';
import * as Stream from 'effect/Stream';
import type { TurnPermissionPolicy } from '../application/turn';

/**
 * The ACP half of the endpoint, adopted from `@rivus/agent-kit`'s `/acp`
 * (`connectAgent`, `probeAgent`, `builtinAcpProfiles`, `agentEnv`). The kit
 * starts an agent with the exact environment the caller passes and one of its
 * profiles; the endpoint owns the mapping from an `agents` row — one command
 * line — to a profile, and never lets the agent inherit this process's
 * environment wholesale.
 */

/** What the endpoint knows about one member's row (the control plane's `Agent`). */
export interface RoomAgentSpec {
  id: string;
  command: string;
  timeoutMs?: number;
}

/**
 * Timeouts, carried over from the connector they replace: the handshake and
 * the session requests, and the cancel deadline a turn's `session/cancel`
 * is bounded by (a cancel that does not settle in time invalidates the
 * session's binding and closes the connection).
 */
export const ROOM_ACP_HANDSHAKE_TIMEOUT_MS = 45_000;
export const ROOM_ACP_REQUEST_TIMEOUT_MS = 30_000;
export const ROOM_ACP_CANCEL_TIMEOUT_MS = 5_000;

/** The client name the old connector announced; carried over. */
const CLIENT_INFO = { name: 'rivus-room-web', version: '0.0.0' } as const;

/**
 * The environment an agent row with no known adapter gets: what every ACP
 * program needs to start and reach the network, plus the provider variables
 * the built-in profiles list. Patterns follow `agentEnv`'s one-`*` rule.
 */
const FALLBACK_AGENT_ENV: readonly string[] = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_*',
  'TERM',
  'TZ',
  'XDG_*',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  '*_API_KEY',
  'ANTHROPIC_*',
  'OPENAI_*',
  'OPENCODE_*',
  'CODEX_*',
  'CLAUDE_*',
  'GEMINI_*',
  'GOOGLE_*',
  'GROK_*',
  'XAI_*',
  'AZURE_*',
  'AWS_*',
];

/** The kit profile whose channels a row's adapter is known to speak. */
function builtinBaseFor(agent: RoomAgentSpec): AcpProfile | undefined {
  const byId: Record<string, AcpProfile | undefined> = {
    claude: builtinAcpProfiles['claude-code'],
    codex: builtinAcpProfiles['codex'],
    opencode: builtinAcpProfiles['opencode'],
    gemini: builtinAcpProfiles['gemini-cli'],
    grok: builtinAcpProfiles['grok'],
  };
  const head = agent.command.trim().split(/\s+/)[0] ?? '';
  const byCommand: Record<string, AcpProfile | undefined> = {
    'claude-agent-acp': builtinAcpProfiles['claude-code'],
    'codex-acp': builtinAcpProfiles['codex'],
    opencode: builtinAcpProfiles['opencode'],
    gemini: builtinAcpProfiles['gemini-cli'],
    grok: builtinAcpProfiles['grok'],
  };
  return byId[agent.id] ?? byCommand[head];
}

/** Splits an `agents` row's command line: the first word is the program. */
export function splitCommandLine(line: string): { command: string; args: readonly string[] } {
  const words = line.trim().split(/\s+/).filter(Boolean);
  return { command: words[0] ?? '', args: words.slice(1) };
}

/**
 * The row's ACP profile: the kit profile of the adapter the row names, with
 * the row's own command line. An unknown row gets the generic channels — the
 * system prompt as the first prompt block, the fallback environment — which is
 * what the previous fallback profile did.
 */
export function roomAcpProfile(agent: RoomAgentSpec): AcpProfile {
  const base = builtinBaseFor(agent);
  const { command, args } = splitCommandLine(agent.command);
  return {
    specificationVersion: 'acp-v1',
    agent: agent.id,
    command,
    args,
    env: base?.env ?? FALLBACK_AGENT_ENV,
    systemPrompt: base?.systemPrompt ?? { in: 'first-block' },
    warnings: base?.warnings ?? [],
  };
}

/**
 * The agent's complete environment: the variables its profile lists, picked
 * from this process's environment. Nothing else is inherited — the kit spawns
 * the program with exactly this environment.
 */
export function roomAgentEnv(profile: Pick<AcpProfile, 'env'>): Record<string, string> {
  return agentEnv(profile, process.env);
}

/** The probe answers the desk reads: 缺失, 待登录, 可入座. */
export type RoomAgentProbe =
  | { status: 'missing'; error: string }
  | { status: 'needs-login'; authMethods: readonly { id: string; name: string; description?: string }[] }
  | { status: 'ready' };

/**
 * The endpoint's permission policy as the kit's callback: the policy's
 * decision goes to the kit as is, and a policy that throws or rejects is a
 * denial (`undefined`) — the kit's own fail-closed rule, which it applies to a
 * missing callback and an unanswerable decision alike.
 */
function permissionCallbackOf(policy: TurnPermissionPolicy): PermissionCallback {
  return (request) =>
    Effect.tryPromise({
      try: () => Promise.resolve(policy(request)),
      catch: (cause) => cause,
    }).pipe(Effect.orElseSucceed(() => undefined));
}

/** Probe options for the kit call, built from the row. */
function connectOptions(agent: RoomAgentSpec, cwd: string, onPermission?: TurnPermissionPolicy) {
  const profile = roomAcpProfile(agent);
  return {
    profile,
    options: {
      cwd,
      env: roomAgentEnv(profile),
      profiles: { [agent.id]: profile } as Record<string, AcpProfile>,
      clientInfo: CLIENT_INFO,
      // The endpoint answers the client file calls: reads and writes, fenced
      // by the kit to the session's directory, links resolved.
      fileSystem: { read: true, write: true },
      // The room's permission policy: without it every request the agent
      // makes during a turn is denied, however harmless.
      ...(onPermission ? { onPermission: permissionCallbackOf(onPermission) } : {}),
      handshakeTimeoutMs: ROOM_ACP_HANDSHAKE_TIMEOUT_MS,
      requestTimeoutMs: ROOM_ACP_REQUEST_TIMEOUT_MS,
      cancelTimeoutMs: ROOM_ACP_CANCEL_TIMEOUT_MS,
    },
  };
}

/** One line a turn row or a failure notice can carry about a prompt error. */
export function describePromptError(error: PromptError): string {
  switch (error._tag) {
    case 'TurnInProgress':
      return `the session's turn ${error.turn} is still running`;
    case 'SessionClosed':
      return `the session is closed (${error.reason})`;
    case 'CancelUnsettled':
      return `the turn did not end within the ${error.timeoutMs} ms cancel deadline (binding ${error.binding ?? 'unchanged'})`;
    case 'ConnectionClosed':
      return `the connection ended (${error.reason}${error.stderr ? `: ${error.stderr}` : ''})`;
    case 'AuthRequired':
      return `the agent asks for a login: ${error.message}`;
    case 'AcpRequestFailed':
      return `the agent answered ${error.method} with an error${error.code === undefined ? '' : ` ${error.code}`}: ${error.message}`;
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * One line a probe row or a failed activation keeps about a connect or a
 * session error: what the agent could not do, in the order the caller met it.
 */
export function describeConnectError(error: ConnectError | OpenSessionError): string {
  if (error._tag === 'AgentUnavailable') {
    return `${error.command} could not start: ${error.message}`;
  }
  if (error._tag === 'HandshakeFailed') {
    return `the handshake failed (${error.reason}): ${error.message}`;
  }
  if (error._tag === 'SessionBindingStoreFailure') {
    return `the session binding store failed (${error.reason}): ${error.message}`;
  }
  if (error._tag === 'AcpTimeout') {
    return `${error.method} timed out after ${error.timeoutMs} ms`;
  }
  return describePromptError(error);
}

export function probeRoomAgent(agent: RoomAgentSpec): Effect.Effect<RoomAgentProbe, never, PlatformService> {
  const { options } = connectOptions(agent, os.tmpdir());
  return probeAgent(agent.id, options).pipe(
    Effect.map((probe) => {
      switch (probe.status) {
        case 'ready':
          return { status: 'ready' as const };
        case 'needs-login':
          return { status: 'needs-login' as const, authMethods: probe.authMethods };
        default:
          return { status: 'missing' as const, error: describeConnectError(probe.error) };
      }
    }),
    // `probeAgent` is total; the mapping cannot fail. The defect catch keeps
    // the signature honest if a kit defect escapes (it would be a kit bug).
    Effect.catchDefect((defect) =>
      Effect.succeed({ status: 'missing' as const, error: errorText(defect) } satisfies RoomAgentProbe),
    ),
  );
}

/** What a connection may run differently from its defaults, in tests or across keys. */
export interface RoomConnectOverrides {
  cancelTimeoutMs?: number;
  /**
   * The permission policy the connection's turns are answered with. The
   * connection lives across activations, so the caller hands a delegate that
   * reads the live turn's policy rather than one turn's answer.
   */
  onPermission?: TurnPermissionPolicy;
}

/**
 * Starts the row's ACP program with exactly its profile's environment. The
 * connection belongs to the caller's Scope — the endpoint keeps one Scope per
 * (room, member) key, so the process outlives a turn. `overrides` exists for
 * the tests, which run the deadlines short.
 */
export function connectRoomAgent(
  agent: RoomAgentSpec,
  cwd: string,
  overrides?: RoomConnectOverrides,
): Effect.Effect<AcpConnection, ConnectError, PlatformService | Scope.Scope> {
  // The policy rides through `connectOptions`, which wraps it into the kit's
  // Effect-shaped callback; the rest of the overrides spread as they are.
  const { onPermission, ...rest } = overrides ?? {};
  const { options } = connectOptions(agent, cwd, onPermission);
  return connectAgent(agent.id, { ...options, ...rest });
}

export type OpenSessionError = NewSessionError;

/**
 * Opens the member's session: the one bound to the room's session key, or a
 * new one bound to it. The binding is what makes the session survive this
 * process — a restart loads the same session instead of starting over.
 */
export function openRoomSession(
  connection: AcpConnection,
  input: {
    sessionKey: string;
    cwd: string;
    mcpServers?: readonly import('@rivus/agent-kit/acp').McpServerConfig[];
    systemPrompt?: string;
  },
): Effect.Effect<AcpSessionHandle, OpenSessionError> {
  const options = {
    cwd: input.cwd,
    ...(input.mcpServers ? { mcpServers: input.mcpServers } : {}),
    ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
  };
  return connection.loadSession({ sessionKey: input.sessionKey }, options).pipe(
    // An agent with neither `session/load` nor `session/resume` cannot reopen
    // a session; the caller falls back to its own live-session cache.
    Effect.catchTag('LoadUnsupported', () => connection.newSession({ ...options, sessionKey: input.sessionKey })),
    Effect.catchTag('BindingNotFound', () => connection.newSession({ ...options, sessionKey: input.sessionKey })),
  );
}

/** How one turn's stream ended, as the endpoint's afterTurn reads it. */
export interface TurnStreamOutcome {
  stopReason: string | null;
  /** The stream was interrupted from outside (lanes cancel, close, backstop timeout). */
  interrupted?: boolean;
  error?: string;
}

/** Whether the stream part says the member's running turn has called a tool. */
function isToolCallPart(part: { type: string }): boolean {
  return (
    part.type === 'tool-input-start' ||
    part.type === 'tool-input-available' ||
    part.type === 'tool-output-available' ||
    part.type === 'tool-output-error'
  );
}

/**
 * Runs one turn to its end and reports how it ended. The stream's `finish`
 * part carries the agent's own stop reason; a failed stream reports no stop
 * reason and the error the row keeps. Interruption ends here too — the kit's
 * own finalizer cancels the turn at the deadline first — and reads as a turn
 * that never resolved, leaving the interrupt's meaning to the caller.
 */
export function runTurnStream(
  session: AcpSessionHandle,
  blocks: readonly PromptBlock[],
  hooks?: {
    onToolCall?(): void;
    /** Every stream part, for callers that surface more than the tool calls. */
    onPart?(part: TranscriptStreamPart): void;
  },
): Effect.Effect<TurnStreamOutcome, never> {
  return Effect.gen(function* () {
    let stopReason: string | null = null;
    const result = yield* session.prompt(blocks).pipe(
      Stream.runForEach((part) =>
        Effect.sync(() => {
          hooks?.onPart?.(part);
          if (isToolCallPart(part)) {
            hooks?.onToolCall?.();
          }
          if (part.type === 'finish') {
            stopReason = part.finishReason;
          }
        }),
      ),
      Effect.exit,
    );
    if (Exit.isFailure(result)) {
      if (Cause.hasInterruptsOnly(result.cause)) {
        return { stopReason: null, interrupted: true } satisfies TurnStreamOutcome;
      }
      const error = Option.getOrUndefined(Cause.findErrorOption(result.cause));
      return { stopReason: null, ...(error ? { error: describePromptError(error) } : {}) } satisfies TurnStreamOutcome;
    }
    return { stopReason } satisfies TurnStreamOutcome;
  });
}
