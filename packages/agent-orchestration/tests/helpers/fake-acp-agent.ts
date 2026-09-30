import { PassThrough, Readable, Writable } from 'node:stream';
import {
  AgentSideConnection,
  ndJsonStream,
  RequestError,
  type AgentCapabilities,
  type AuthMethod,
  type NewSessionRequest,
  type PromptRequest,
  type PromptResponse,
  type StopReason,
} from '@agentclientprotocol/sdk';
import type { AcpProcessHandle } from '../../src/infrastructure/acp-connector';

export interface FakeAgentConfig {
  /** initialize throws with this message. */
  initializeError?: string;
  agentCapabilities?: AgentCapabilities;
  authMethods?: AuthMethod[];
  /** newSession refuses with the ACP auth_required error. */
  authRequired?: boolean;
  newSessionError?: string;
  /** newSession never answers, as one waiting on a login does. */
  hangNewSession?: boolean;
  stopReason?: StopReason;
  /** prompt never resolves until cancel arrives. */
  hangPrompt?: boolean;
  /** prompt asks the client for permission before finishing. */
  requestPermission?: boolean;
  /** A hung prompt keeps hanging after session/cancel, as a stuck adapter does. */
  ignoreCancel?: boolean;
  /** prompt exercises the client-side fs on these paths, recording each outcome. */
  clientFs?: { inside: string; outside: string; content: string; via?: string };
  /** prompt also reads these paths through the client, recording each outcome. */
  extraReads?: string[];
  /** The process ignores SIGTERM; only SIGKILL ends it. */
  ignoreSigterm?: boolean;
}

export class FakeAcpAgent {
  readonly initializeRequests: unknown[] = [];
  readonly newSessionRequests: NewSessionRequest[] = [];
  readonly prompts: PromptRequest[] = [];
  readonly cancels: unknown[] = [];
  readonly permissionResponses: unknown[] = [];
  /** One line per client-fs attempt, `ok` or the error the client answered. */
  readonly fsResults: string[] = [];

  private pendingPrompt: { resolve: (result: PromptResponse) => void } | undefined;

  constructor(
    private readonly config: FakeAgentConfig,
    private readonly connection: AgentSideConnection,
  ) {}

  async initialize(params: { protocolVersion: number }): Promise<{
    protocolVersion: number;
    agentCapabilities?: AgentCapabilities;
    authMethods?: AuthMethod[];
    agentInfo?: { name: string; version: string };
  }> {
    this.initializeRequests.push(params);
    if (this.config.initializeError) throw new Error(this.config.initializeError);
    return {
      protocolVersion: params.protocolVersion,
      ...(this.config.agentCapabilities ? { agentCapabilities: this.config.agentCapabilities } : {}),
      ...(this.config.authMethods ? { authMethods: this.config.authMethods } : {}),
      agentInfo: { name: 'fake-agent', version: '1.2.3' },
    };
  }

  async newSession(params: NewSessionRequest): Promise<{ sessionId: string }> {
    this.newSessionRequests.push(params);
    if (this.config.hangNewSession) {
      return new Promise<{ sessionId: string }>(() => undefined);
    }
    if (this.config.authRequired) throw RequestError.authRequired();
    if (this.config.newSessionError) throw new Error(this.config.newSessionError);
    return { sessionId: `fake-session-${this.newSessionRequests.length}` };
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    this.prompts.push(params);
    if (this.config.hangPrompt) {
      return new Promise((resolve) => {
        this.pendingPrompt = { resolve };
      });
    }
    const fs = this.config.clientFs;
    if (fs) {
      const attempts: Array<{ op: 'readTextFile' | 'writeTextFile'; path: string }> = [
        { op: 'readTextFile', path: fs.inside },
        { op: 'readTextFile', path: fs.outside },
        { op: 'writeTextFile', path: fs.inside },
        { op: 'writeTextFile', path: fs.outside },
        ...(fs.via ? [{ op: 'writeTextFile' as const, path: fs.via }] : []),
      ];
      for (const attempt of attempts) {
        try {
          if (attempt.op === 'readTextFile') {
            await this.connection.readTextFile({ sessionId: params.sessionId, path: attempt.path });
          } else {
            await this.connection.writeTextFile({
              sessionId: params.sessionId,
              path: attempt.path,
              content: fs.content,
            });
          }
          this.fsResults.push(`${attempt.op} ${attempt.path}: ok`);
        } catch {
          // The SDK answers a throwing client handler with an opaque internal
          // error; the distinction the tests need is served versus refused.
          this.fsResults.push(`${attempt.op} ${attempt.path}: refused`);
        }
      }
    }
    for (const path of this.config.extraReads ?? []) {
      try {
        await this.connection.readTextFile({ sessionId: params.sessionId, path });
        this.fsResults.push(`readTextFile ${path}: ok`);
      } catch {
        this.fsResults.push(`readTextFile ${path}: refused`);
      }
    }
    if (this.config.requestPermission) {
      const response = await this.connection.requestPermission({
        sessionId: params.sessionId,
        toolCall: { toolCallId: 'call-1', title: 'room_speak' },
        options: [
          { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'reject-once', name: 'Reject once', kind: 'reject_once' },
        ],
      });
      this.permissionResponses.push(response);
    }
    await this.connection.sessionUpdate({
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'call-1',
        title: 'room_speak',
        kind: 'edit',
        status: 'in_progress',
      },
    });
    await this.connection.sessionUpdate({
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call-1',
        status: 'completed',
        rawOutput: { output: 'ECHO7733' },
      },
    });
    return { stopReason: this.config.stopReason ?? ('end_turn' as const) };
  }

  async authenticate(): Promise<Record<string, never>> {
    return {};
  }

  async cancel(params: { sessionId: string }): Promise<void> {
    this.cancels.push(params);
    if (this.config.ignoreCancel) return;
    this.pendingPrompt?.resolve({ stopReason: 'cancelled' });
    this.pendingPrompt = undefined;
  }
}

/**
 * A fake ACP agent over an in-memory duplex stream, shaped as the process
 * handle the connector would get from the login shell.
 */
export function fakeAcpProcess(config: FakeAgentConfig = {}): {
  handle: AcpProcessHandle;
  agent: () => FakeAcpAgent | undefined;
  /** The signals `kill` was called with, in order. */
  kills: Array<NodeJS.Signals | undefined>;
} {
  const clientToAgent = new PassThrough();
  const agentToClient = new PassThrough();
  const holder: { agent?: FakeAcpAgent } = {};
  const agentStream = ndJsonStream(
    Writable.toWeb(agentToClient) as unknown as WritableStream<Uint8Array>,
    Readable.toWeb(clientToAgent) as unknown as ReadableStream<Uint8Array>,
  );
  new AgentSideConnection((connection) => {
    holder.agent = new FakeAcpAgent(config, connection);
    return holder.agent;
  }, agentStream);
  const kills: Array<NodeJS.Signals | undefined> = [];
  let killed: (() => void) | undefined;
  const exit = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    killed = () => {
      clientToAgent.end();
      agentToClient.end();
      resolve({ code: null, signal: 'SIGTERM' });
    };
  });
  return {
    handle: {
      stdin: clientToAgent,
      stdout: agentToClient,
      stderr: undefined,
      exit,
      kill: (signal) => {
        kills.push(signal);
        if (config.ignoreSigterm && signal !== 'SIGKILL') return;
        killed?.();
      },
    },
    agent: () => holder.agent,
    kills,
  };
}
