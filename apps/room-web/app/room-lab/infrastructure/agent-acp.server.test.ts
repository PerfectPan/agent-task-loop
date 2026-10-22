import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { NodePlatformLive } from '@rivus/agent-kit/node/effect';
import type { PlatformService } from '@rivus/agent-kit/platform/effect';
import {
  FileSessionBindingStoreLive,
  MemorySessionBindingStoreLive,
  type AcpConnection,
  type AcpSessionHandle,
} from '@rivus/agent-kit/acp';
import { make as makeManagedRuntime, type ManagedRuntime } from 'effect/ManagedRuntime';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Scope from 'effect/Scope';
import {
  ROOM_ACP_CANCEL_TIMEOUT_MS,
  connectRoomAgent,
  probeRoomAgent,
  roomAgentEnv,
  roomAcpProfile,
  runTurnStream,
  type RoomAgentProbe,
  type RoomAgentSpec,
  type RoomConnectOverrides,
} from './agent-acp.server';

/**
 * The endpoint's ACP half, driven end to end against a fake agent process:
 * the same `connectAgent` path the host runs, with a profile that starts the
 * fixture through Node. These tests pin what the old AcpConnector tests
 * pinned — permission denial, the cancel deadline, binding invalidation, the
 * explicit environment, the client file fence, recovery after a restart —
 * plus the profile/env helpers the endpoint adds on top of the kit.
 */

const FAKE_AGENT = fileURLToPath(new URL('./testing/fake-room-agent.ts', import.meta.url));

const dirs: string[] = [];
function workDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rivus-agent-acp-'));
  dirs.push(dir);
  return dir;
}

const MARKER_ENV_KEYS = [
  'CLAUDE_FAKE_STATE',
  'CLAUDE_FAKE_LOAD',
  'CLAUDE_FAKE_ENV_REPORT',
  'CLAUDE_FAKE_INITIALIZE',
  'CLAUDE_FAKE_AUTH',
  'CLAUDE_FAKE_IGNORE_CANCEL',
  'CLAUDE_FAKE_IGNORE_SIGTERM',
  'CLAUDE_FAKE_MARK',
  'RIVUS_NOT_FOR_AGENTS',
];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  for (const key of MARKER_ENV_KEYS) {
    delete process.env[key];
  }
});

/** The fake agent as one `agents` row: the endpoint maps rows to profiles. */
function fakeSpec(): RoomAgentSpec {
  return { id: 'fake-room-agent', command: `${process.execPath} ${FAKE_AGENT}` };
}

/** One connection in its own scope, with the runtime the test drives it through. */
interface Hosting {
  rt: ManagedRuntime<PlatformService, never>;
  scope: Scope.Closeable;
  connection: AcpConnection;
}

async function connect(
  bindingStore?: Layer.Layer<never>,
  overrides?: RoomConnectOverrides,
  agent: RoomAgentSpec = fakeSpec(),
): Promise<Hosting> {
  const rt = makeManagedRuntime<PlatformService, never>(
    Layer.mergeAll(NodePlatformLive, bindingStore ?? MemorySessionBindingStoreLive),
  );
  const scope = Scope.makeUnsafe();
  const connection = await rt.runPromise(
    Effect.provideService(connectRoomAgent(agent, workDir(), overrides), Scope.Scope, scope),
  );
  return { rt, scope, connection };
}

async function closeAll(hosting: Hosting): Promise<void> {
  await hosting.rt.runPromise(Scope.close(hosting.scope, Exit.void)).catch(() => undefined);
  await hosting.rt.dispose();
}

type Session = AcpSessionHandle;

/**
 * Runs one turn through the endpoint's own stream runner, keeping the text
 * the agent said — the production path, not a reimplementation.
 */
async function runTurn(
  rt: Hosting['rt'],
  session: Session,
  prompt: string,
): Promise<{ stopReason: string | null; error?: string; texts: string[] }> {
  const texts: string[] = [];
  const outcome = await rt.runPromise(
    runTurnStream(session, [{ type: 'text', text: prompt }], {
      onPart: (part) => {
        if (part.type === 'text-delta') {
          texts.push(part.delta);
        }
      },
    }),
  );
  return { ...outcome, texts };
}

describe('agent-acp against a fake stdio agent', () => {
  it('uses the row command override for a built-in agent id when connecting and probing', async () => {
    const agent = { ...fakeSpec(), id: 'opencode' };
    const hosting = await connect(undefined, undefined, agent);
    try {
      const probe = await hosting.rt.runPromise(probeRoomAgent(agent));
      expect(probe.status).toBe('ready');
      const session = await hosting.rt.runPromise(hosting.connection.newSession());
      const said = await runTurn(hosting.rt, session, 'row-override');
      expect(said.texts.join('')).toContain('turn 1: row-override');
    } finally {
      await closeAll(hosting);
    }
  });

  it('denies a permission request without a callback and forwards a policy decision (fail-closed)', async () => {
    const hosting = await connect();
    try {
      const session = await hosting.rt.runPromise(hosting.connection.newSession());
      const denied = await runTurn(hosting.rt, session, 'permission: now');
      // No callback was installed, so the request is denied — the kit answers
      // with the agent's own reject option when it offers one (and `cancelled`
      // when it offers none). The same fail-closed rule the old connector kept.
      expect(denied.texts.join('')).toContain('"reject-once"');
    } finally {
      await closeAll(hosting);
    }
  });

  it('forwards the connected policy and keeps a failing policy a denial', async () => {
    // The endpoint's adapter: the policy's decision rides to the kit as the
    // connection's own callback.
    const allowing = await connect(undefined, { onPermission: () => ({ optionId: 'allow-once' }) });
    try {
      const session = await allowing.rt.runPromise(allowing.connection.newSession());
      const allowed = await runTurn(allowing.rt, session, 'permission: now');
      expect(allowed.texts.join('')).toContain('"allow-once"');
    } finally {
      await closeAll(allowing);
    }

    // A policy that throws is a denial, not a crash and not an allow: the
    // fail-closed rule covers the callback itself.
    const broken = await connect(undefined, {
      onPermission: () => {
        throw new Error('the policy is broken');
      },
    });
    try {
      const session = await broken.rt.runPromise(broken.connection.newSession());
      const denied = await runTurn(broken.rt, session, 'permission: now');
      expect(denied.texts.join('')).toContain('"reject-once"');
    } finally {
      await closeAll(broken);
    }
  });

  it('gives up on a turn whose agent ignores session/cancel once the deadline runs out', async () => {
    process.env.CLAUDE_FAKE_IGNORE_CANCEL = '1';
    const hosting = await connect(undefined, { cancelTimeoutMs: 300 });
    try {
      const session = await hosting.rt.runPromise(hosting.connection.newSession({ sessionKey: 'chat:stubborn' }));
      const started = runTurn(hosting.rt, session, 'hang: forever');
      await new Promise((resolve) => setTimeout(resolve, 150));
      // The cancel fails with CancelUnsettled after its deadline; the kit
      // closes the connection, which ends the turn without a stop reason.
      const cancelled = await hosting.rt.runPromiseExit(session.cancel());
      expect(Exit.isFailure(cancelled)).toBe(true);
      const turn = await started;
      expect(turn.stopReason).toBeNull();
      expect(turn.error).toContain('did not end within the 300 ms cancel deadline');
      expect(ROOM_ACP_CANCEL_TIMEOUT_MS).toBe(5_000);
    } finally {
      await closeAll(hosting);
    }
  });

  it('removes the session binding when a cancel does not settle, keeps it when it settles', async () => {
    const bindingsPath = join(workDir(), 'bindings.json');
    const store = FileSessionBindingStoreLive(bindingsPath).pipe(Layer.provideMerge(NodePlatformLive));
    process.env.CLAUDE_FAKE_IGNORE_CANCEL = '1';
    const hosting = await connect(store, { cancelTimeoutMs: 300 });
    try {
      const stubborn = await hosting.rt.runPromise(hosting.connection.newSession({ sessionKey: 'chat:one' }));
      void runTurn(hosting.rt, stubborn, 'hang: forever');
      await new Promise((resolve) => setTimeout(resolve, 150));
      await hosting.rt.runPromiseExit(stubborn.cancel());
      // The binding store no longer names the stubborn session: a later
      // connection cannot reach a session that may still run the turn.
      const bindings = JSON.parse(readFileSync(bindingsPath, 'utf8')) as {
        bindings: Record<string, unknown>;
      };
      expect(bindings.bindings['chat:one']).toBeUndefined();

      await closeAll(hosting);

      // A settling cancel keeps the binding. A fresh connection: the stubborn
      // cancel closed the first one.
      delete process.env.CLAUDE_FAKE_IGNORE_CANCEL;
      const settled = await connect(store, { cancelTimeoutMs: 300 });
      try {
        const other = await settled.rt.runPromise(settled.connection.newSession({ sessionKey: 'chat:two' }));
        await runTurn(settled.rt, other, 'hello');
        await settled.rt.runPromise(other.cancel());
        const after = JSON.parse(readFileSync(bindingsPath, 'utf8')) as {
          bindings: Record<string, unknown>;
        };
        expect(after.bindings['chat:two']).toBeDefined();
      } finally {
        await closeAll(settled);
      }
    } finally {
      await closeAll(hosting);
    }
  });

  it('spawns the agent with exactly the environment the profile picks, nothing inherited', async () => {
    // CLAUDE_* is one of the variable families the fallback environment
    // passes, so the test drives the fixture through it.
    process.env.CLAUDE_FAKE_MARK = 'picked-7733';
    process.env.RIVUS_NOT_FOR_AGENTS = 'never-7733';
    const report = join(workDir(), 'env.json');
    process.env.CLAUDE_FAKE_ENV_REPORT = report;
    const hosting = await connect();
    try {
      const session = await hosting.rt.runPromise(hosting.connection.newSession());
      const said = await runTurn(hosting.rt, session, 'env: CLAUDE_FAKE_MARK');
      expect(said.texts.join('')).toContain('CLAUDE_FAKE_MARK=picked-7733');

      // The report is the complete environment the child process received.
      const childEnv = JSON.parse(readFileSync(report, 'utf8')) as Record<string, string | undefined>;
      expect(childEnv.CLAUDE_FAKE_MARK).toBe('picked-7733');
      expect(childEnv.RIVUS_NOT_FOR_AGENTS).toBeUndefined();
    } finally {
      delete process.env.RIVUS_NOT_FOR_AGENTS;
      await closeAll(hosting);
    }
  });

  it('confines the client file calls the agent makes to the session cwd, symlinks included', async () => {
    const root = workDir();
    writeFileSync(join(root, 'inside.txt'), 'the room owns this', 'utf8');
    const outside = workDir();
    writeFileSync(join(outside, 'secret.txt'), 'nothing to see', 'utf8');
    // A symlink that lives inside the root but points out of it.
    symlinkSync(join(outside, 'secret.txt'), join(root, 'escape.txt'));

    const hosting = await connect();
    try {
      const session = await hosting.rt.runPromise(hosting.connection.newSession({ cwd: root }));
      const said = await runTurn(
        hosting.rt,
        session,
        [
          'fs:',
          `read=${join(root, 'inside.txt')}`,
          `read=${join(outside, 'secret.txt')}`,
          `write=${join(root, 'inside.txt')}`,
          `write=${join(outside, 'secret.txt')}`,
          `write=${join(root, 'escape.txt')}`,
        ].join(' '),
      );
      const transcript = said.texts.join('\n');
      expect(transcript).toContain(`readTextFile ${join(root, 'inside.txt')} ok the room owns this`);
      expect(transcript).toContain(`readTextFile ${join(outside, 'secret.txt')} refused`);
      expect(transcript).toContain(`writeTextFile ${join(root, 'inside.txt')} ok`);
      expect(transcript).toContain(`writeTextFile ${join(outside, 'secret.txt')} refused`);
      expect(transcript).toContain(`writeTextFile ${join(root, 'escape.txt')} refused`);

      // The allowed write landed; the refused ones changed nothing.
      expect(readFileSync(join(root, 'inside.txt'), 'utf8')).toBe('written by fake');
      expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('nothing to see');
    } finally {
      await closeAll(hosting);
    }
  });

  it('reopens the session from its binding after the host process is gone', async () => {
    const statePath = join(workDir(), 'sessions.json');
    process.env.CLAUDE_FAKE_STATE = statePath;
    writeFileSync(statePath, JSON.stringify([]));
    process.env.CLAUDE_FAKE_LOAD = 'load';
    const bindingsPath = join(workDir(), 'bindings.json');
    const store = FileSessionBindingStoreLive(bindingsPath).pipe(Layer.provideMerge(NodePlatformLive));

    const first = await connect(store);
    const sessionKey = 'room:r1:member:claude';
    const firstSession = await first.rt.runPromise(first.connection.newSession({ sessionKey, cwd: workDir() }));
    const firstSaid = await runTurn(first.rt, firstSession, 'hello there');
    expect(firstSaid.texts.join('')).toContain('turn 1: hello');
    const boundId = firstSession.sessionId;
    await closeAll(first);

    // A new host (new runtime, new scope, new connection) opens the same
    // session from the key's binding, and the agent still knows it.
    const second = await connect(store);
    try {
      const reopened = await second.rt.runPromise(second.connection.loadSession({ sessionKey }));
      expect(reopened.sessionId).toBe(boundId);
      const secondSaid = await runTurn(second.rt, reopened, 'again');
      // The reloaded session keeps the conversation going — the agent still
      // knows the session the binding named.
      expect(secondSaid.texts.join('')).toContain(': again');
    } finally {
      await closeAll(second);
    }
  });

  it('probes ready, needs-login and missing', async () => {
    const rt = makeManagedRuntime<PlatformService, never>(NodePlatformLive);
    try {
      const ready = await rt.runPromise(probeRoomAgent(fakeSpec()));
      expect(ready.status).toBe('ready');

      process.env.CLAUDE_FAKE_AUTH = 'required';
      const needsLogin = await rt.runPromise(probeRoomAgent(fakeSpec()));
      expect(needsLogin.status).toBe('needs-login');
      delete process.env.CLAUDE_FAKE_AUTH;

      const missing = await rt.runPromise(
        probeRoomAgent({ id: 'fake-room-agent', command: '/no/such/program --flag' }),
      );
      expect(missing.status).toBe('missing');
    } finally {
      await rt.dispose();
    }
  });

  it('maps a room agent onto the built-in profiles; unknown rows get the fallback channels', () => {
    const claude = roomAcpProfile({ id: 'claude', command: 'claude-agent-acp' });
    expect(claude.systemPrompt).toEqual({ in: 'meta', key: 'systemPrompt' });
    expect(claude.command).toBe('claude-agent-acp');
    expect(claude.args).toEqual([]);

    const codex = roomAcpProfile({ id: 'whatever', command: 'codex-acp' });
    expect(codex.systemPrompt).toEqual({ in: 'first-block' });

    const gemini = roomAcpProfile({ id: 'gemini', command: 'gemini --experimental-acp' });
    expect(gemini.command).toBe('gemini');
    expect(gemini.args).toEqual(['--experimental-acp']);

    // The env helper copies only what the profile lists, from the source given.
    const env = roomAgentEnv({ env: ['PATH', 'ANTHROPIC_*'] });
    expect(Object.keys(env)).toContain('PATH');
    expect(Object.keys(env).some((name) => name.startsWith('npm_'))).toBe(false);

    // The cancel deadline the host runs under, restated so a change is deliberate.
    expect(ROOM_ACP_CANCEL_TIMEOUT_MS).toBe(5_000);
  });

  it('reads the probe as the desk does', () => {
    const probe: RoomAgentProbe = { status: 'missing', error: 'x' };
    expect(probe.status).toBe('missing');
  });
});
