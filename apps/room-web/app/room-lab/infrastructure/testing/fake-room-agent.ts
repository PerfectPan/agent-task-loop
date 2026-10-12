// A small ACP agent for the endpoint's tests, speaking ACP through the SDK
// over stdio. The first word of a prompt's text picks what a turn does;
// CLAUDE_FAKE_* variables pick how the process behaves. Node runs this file
// directly (type stripping), so it uses only erasable TypeScript.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PassThrough, Readable, Writable } from 'node:stream';

import * as acp from '@agentclientprotocol/sdk';

interface FakeSession {
  readonly cwd: string;
  readonly meta: unknown;
  readonly mcpServers: unknown;
  turns: number;
}

const env = process.env;
const statePath = env.CLAUDE_FAKE_STATE;
const sessions = new Map<string, FakeSession>();
const known = new Set<string>(
  statePath && existsSync(statePath) ? (JSON.parse(readFileSync(statePath, 'utf8')) as string[]) : [],
);
let counter = known.size;

if (env.CLAUDE_FAKE_IGNORE_SIGTERM === '1') {
  process.on('SIGTERM', () => undefined);
}
process.stderr.write(`fake-room-agent pid ${process.pid}\n`);

const remember = (sessionId: string, cwd: string, meta: unknown, mcpServers: unknown) => {
  sessions.set(sessionId, { cwd, meta, mcpServers, turns: 0 });
  known.add(sessionId);
  if (statePath) {
    writeFileSync(statePath, JSON.stringify([...known]));
  }
};

const textOf = (prompt: readonly acp.ContentBlock[]) =>
  prompt.map((block) => (block.type === 'text' ? block.text : `[${block.type}]`)).join('\n');

/** The commands the first word of a prompt's text picks. */
const COMMANDS = new Set(['hang', 'fs', 'permission', 'env', 'toolcall']);

const say = (client: acp.AgentSideConnection, sessionId: string, text: string) =>
  client.sessionUpdate({
    sessionId,
    update: {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text },
    } as acp.SessionUpdate,
  });

const capabilities: acp.AgentCapabilities = {
  loadSession: env.CLAUDE_FAKE_LOAD === 'load',
  promptCapabilities: { image: false, embeddedContext: false },
  mcpCapabilities: { http: true, sse: false },
};

class FakeRoomAgent implements acp.Agent {
  private readonly client: acp.AgentSideConnection;

  constructor(client: acp.AgentSideConnection) {
    this.client = client;
  }

  async initialize(params: acp.InitializeRequest): Promise<acp.InitializeResponse> {
    if (env.CLAUDE_FAKE_INITIALIZE === 'hang') {
      return new Promise(() => undefined);
    }
    if (env.CLAUDE_FAKE_INITIALIZE === 'exit') {
      process.exit(3);
    }
    return {
      protocolVersion: env.CLAUDE_FAKE_INITIALIZE === 'protocol-2' ? 2 : params.protocolVersion,
      agentCapabilities: capabilities,
      ...(env.CLAUDE_FAKE_AUTH_METHODS === '1' ? { authMethods: [{ id: 'api-key', name: 'API key' }] } : {}),
      agentInfo: { name: 'fake-room-agent', version: '1.0.0' },
    };
  }

  async authenticate(): Promise<Record<string, never>> {
    return {};
  }

  async newSession(params: acp.NewSessionRequest): Promise<acp.NewSessionResponse> {
    if (env.CLAUDE_FAKE_NEW === 'hang') {
      return new Promise(() => undefined);
    }
    if (env.CLAUDE_FAKE_AUTH === 'required') {
      throw acp.RequestError.authRequired();
    }
    if (env.CLAUDE_FAKE_NEW === 'error') {
      throw new Error('CLAUDE_FAKE_NEW_ERROR');
    }
    const sessionId = `fake-session-${++counter}`;
    remember(sessionId, params.cwd, params._meta, params.mcpServers);
    // The environment the agent actually received, so a test can pin the
    // exact-env rule the kit drives us by.
    if (env.CLAUDE_FAKE_ENV_REPORT) {
      writeFileSync(env.CLAUDE_FAKE_ENV_REPORT, JSON.stringify(process.env), 'utf8');
    }
    return { sessionId };
  }

  async loadSession(params: acp.LoadSessionRequest): Promise<acp.LoadSessionResponse> {
    if (!capabilities.loadSession || !known.has(params.sessionId)) {
      throw acp.RequestError.methodNotFound('session/load');
    }
    if (!sessions.has(params.sessionId)) {
      remember(params.sessionId, params.cwd, params._meta, params.mcpServers);
    }
    const session = sessions.get(params.sessionId)!;
    // The replay the protocol asks a load to answer with; the client does not
    // stream it, so one entry is enough.
    await this.client.sessionUpdate({
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: 'replayed' },
      } as acp.SessionUpdate,
    });
    return { modes: null, _meta: session.meta as acp.LoadSessionResponse['_meta'] };
  }

  async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
    const session = sessions.get(params.sessionId);
    const words = textOf(params.prompt).split(/\s+/);
    // A room's turn prompt names the seat order (`order:`) ahead of the
    // transcript, so a tagged word that names a command wins over the first
    // tagged word: the record's line carries the command a turn is asked for.
    const taggedWords = words.filter((word) => /^[a-z]+:/i.test(word));
    const tagged = taggedWords.find((word) => COMMANDS.has(word.slice(0, -1).toLowerCase())) ?? taggedWords.at(0);
    const command = tagged !== undefined ? tagged : (words[0] ?? 'idle');
    if (session) {
      session.turns += 1;
    }

    if (command === 'hang:') {
      return new Promise(() => undefined);
    }
    if (command === 'fs:') {
      // Every `read=<path>` / `write=<path>` argument is one attempt through
      // the client; the client's own fence answers ok or an error either way.
      for (const line of words.slice(1)) {
        const isRead = line.startsWith('read=');
        const path = line.slice(isRead ? 5 : 6);
        try {
          if (isRead) {
            const response = await this.client.readTextFile({ sessionId: params.sessionId, path });
            void say(this.client, params.sessionId, `readTextFile ${path} ok ${response.content}`);
          } else {
            await this.client.writeTextFile({ sessionId: params.sessionId, path, content: 'written by fake' });
            void say(this.client, params.sessionId, `writeTextFile ${path} ok`);
          }
        } catch {
          void say(this.client, params.sessionId, `${isRead ? 'readTextFile' : 'writeTextFile'} ${path} refused`);
        }
      }
      return { stopReason: 'end_turn' };
    }
    if (command === 'permission:') {
      // `kind=<kind>` and `path=<absolute path>` words shape the tool call the
      // request carries, so a test can ask for a write outside the room's cwd;
      // without them the call names no kind and no input, which the room's
      // policy allows. A word that is not a tool kind is dropped.
      const TOOL_KINDS: readonly string[] = [
        'read',
        'edit',
        'delete',
        'move',
        'search',
        'execute',
        'think',
        'fetch',
        'switch_mode',
        'other',
      ];
      const kindWord = words.find((word) => word.startsWith('kind='))?.slice(5);
      const kind = kindWord !== undefined && TOOL_KINDS.includes(kindWord) ? (kindWord as acp.ToolKind) : undefined;
      const path = words.find((word) => word.startsWith('path='))?.slice(5);
      const outcome = await this.client.requestPermission({
        sessionId: params.sessionId,
        toolCall: {
          toolCallId: 'call-1',
          title: 'room_speak',
          ...(kind === undefined ? {} : { kind }),
          ...(path === undefined ? {} : { rawInput: { file_path: path } }),
        },
        options: [
          { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'reject-once', name: 'Reject once', kind: 'reject_once' },
        ],
      });
      if (env.CLAUDE_FAKE_PERMISSION_REPORT) {
        writeFileSync(env.CLAUDE_FAKE_PERMISSION_REPORT, JSON.stringify(outcome.outcome), 'utf8');
      }
      void say(this.client, params.sessionId, `permission ${JSON.stringify(outcome.outcome)}`);
      return { stopReason: 'end_turn' };
    }
    if (command === 'env:') {
      const name = words[1] ?? 'CLAUDE_FAKE_MARK';
      void say(this.client, params.sessionId, `env ${name}=${env[name] === undefined ? 'unset' : env[name]}`);
      return { stopReason: 'end_turn' };
    }
    if (command === 'toolcall:') {
      await this.client.sessionUpdate({
        sessionId: params.sessionId,
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'call-1',
          status: 'completed',
          rawOutput: { output: 'ECHO7733' },
        } as acp.SessionUpdate,
      });
      return { stopReason: 'end_turn' };
    }
    void say(this.client, params.sessionId, `turn ${session?.turns ?? 1}: ${command}`);
    return { stopReason: 'end_turn' };
  }

  async cancel(params: acp.CancelNotification): Promise<void> {
    if (env.CLAUDE_FAKE_IGNORE_CANCEL === '1') {
      return;
    }
    void say(this.client, params.sessionId, 'cancel received');
  }
}

const clientToAgent = new PassThrough();
const agentToClient = new PassThrough();
const agentStream = acp.ndJsonStream(
  Writable.toWeb(agentToClient) as unknown as WritableStream<Uint8Array>,
  Readable.toWeb(clientToAgent) as unknown as ReadableStream<Uint8Array>,
);
new acp.AgentSideConnection((connection) => new FakeRoomAgent(connection), agentStream);

process.stdin.pipe(clientToAgent);
agentToClient.pipe(process.stdout);
