import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AgentBinding } from '../src/contracts/agent';
import { AcpConnector } from '../src/infrastructure/acp-connector';
import { fakeAcpProcess, type FakeAgentConfig } from './helpers/fake-acp-agent';

const binding: AgentBinding = { command: 'fake-agent-acp' };

function connectorWith(config: FakeAgentConfig, cancelGraceMs = 5_000) {
  const fake = fakeAcpProcess(config);
  const connector = new AcpConnector({ spawnProcess: () => fake.handle, cancelGraceMs });
  return { connector, agent: fake.agent };
}

describe('AcpConnector', () => {
  it('performs initialize once and keeps the process', async () => {
    const { connector, agent } = connectorWith({});
    const connection = await connector.connect(binding);
    // The trial interaction below runs on the same connection; initialize
    // happened exactly once.
    const session = await connection.newSession({ cwd: '/tmp/fake-room' });
    expect(session).toBe('fake-session-1');
    expect(agent()?.initializeRequests).toHaveLength(1);
    await connection.close();
  });

  it('passes cwd, mcpServers and meta into session/new', async () => {
    const { connector, agent } = connectorWith({});
    const connection = await connector.connect(binding);
    const httpToolServer = {
      type: 'http' as const,
      name: 'room-tools',
      url: 'http://127.0.0.1:3210/token/mcp',
      headers: [],
    };
    await connection.newSession({
      cwd: '/tmp/fake-room',
      mcpServers: [httpToolServer],
      meta: { systemPrompt: 'answer with ACP7733' },
    });
    const request = agent()?.newSessionRequests[0];
    expect(request?.cwd).toBe('/tmp/fake-room');
    expect(request?.mcpServers).toEqual([httpToolServer]);
    expect(request?._meta).toEqual({ systemPrompt: 'answer with ACP7733' });
    await connection.close();
  });

  it('fans out session updates and resolves prompt with the stop reason', async () => {
    const { connector } = connectorWith({});
    const connection = await connector.connect(binding);
    const updates: string[] = [];
    connection.onUpdate((update) => {
      if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
        updates.push(update.sessionUpdate);
      }
    });
    const session = await connection.newSession({ cwd: '/tmp/fake-room' });
    const result = await connection.prompt(session, [{ type: 'text', text: 'read the room' }]);
    expect(result.stopReason).toBe('end_turn');
    expect(updates).toEqual(['tool_call', 'tool_call_update']);
    await connection.close();
  });

  it('delivers the streamed tool_call_update payload', async () => {
    const { connector } = connectorWith({});
    const connection = await connector.connect(binding);
    let rawOutput: unknown;
    connection.onUpdate((update) => {
      if (update.sessionUpdate === 'tool_call_update') {
        rawOutput = update.rawOutput;
      }
    });
    const session = await connection.newSession({ cwd: '/tmp/fake-room' });
    await connection.prompt(session, [{ type: 'text', text: 'speak' }]);
    expect(rawOutput).toEqual({ output: 'ECHO7733' });
    await connection.close();
  });

  it('answers permission requests through the registered handler', async () => {
    const { connector, agent } = connectorWith({ requestPermission: true });
    const connection = await connector.connect(binding);
    connection.onPermissionRequest(async () => ({ outcome: 'selected', optionId: 'allow-once' }));
    const session = await connection.newSession({ cwd: '/tmp/fake-room' });
    await connection.prompt(session, [{ type: 'text', text: 'speak' }]);
    expect(agent()?.permissionResponses[0]).toEqual({ outcome: { outcome: 'selected', optionId: 'allow-once' } });
    await connection.close();
  });

  it('cancels a pending prompt', async () => {
    const { connector, agent } = connectorWith({ hangPrompt: true });
    const connection = await connector.connect(binding);
    const session = await connection.newSession({ cwd: '/tmp/fake-room' });
    const turn = connection.prompt(session, [{ type: 'text', text: 'work' }]);
    await vi.waitFor(() => expect(agent()?.prompts).toHaveLength(1));
    await connection.cancel(session);
    expect((await turn).stopReason).toBe('cancelled');
    await connection.close();
  });

  it('never prompts a turn whose signal is already aborted', async () => {
    const { connector, agent } = connectorWith({});
    const connection = await connector.connect(binding);
    const session = await connection.newSession({ cwd: '/tmp/fake-room' });
    const controller = new AbortController();
    controller.abort();
    await expect(connection.prompt(session, [{ type: 'text', text: 'too late' }], controller.signal)).rejects.toThrow(
      Error,
    );
    expect(agent()?.prompts).toHaveLength(0);
    await connection.close();
  });

  it('gives up on a prompt whose agent ignores session/cancel once the grace runs out', async () => {
    const { connector, agent } = connectorWith({ hangPrompt: true, ignoreCancel: true }, 30);
    const connection = await connector.connect(binding);
    const session = await connection.newSession({ cwd: '/tmp/fake-room' });
    const controller = new AbortController();
    const turn = connection.prompt(session, [{ type: 'text', text: 'work' }], controller.signal);
    await vi.waitFor(() => expect(agent()?.prompts).toHaveLength(1));
    controller.abort();
    // The SDK hands the abort reason through; what matters is that the
    // promise ends at all once the grace runs out.
    await expect(turn).rejects.toThrow(Error);
    expect(agent()?.cancels).toHaveLength(1);
    await connection.close();
  });

  it('bounds session/new with its own timeout instead of waiting on a login forever', async () => {
    const fake = fakeAcpProcess({ hangNewSession: true });
    const connector = new AcpConnector({
      spawnProcess: () => fake.handle,
      sessionTimeoutMs: 30,
    });
    const connection = await connector.connect(binding);
    await expect(connection.newSession({ cwd: '/tmp/fake-room' })).rejects.toThrow(/session\/new timed out after 30ms/);
    await connection.close();
  });

  it('surfaces a lost process on the next call', async () => {
    const fake = fakeAcpProcess({ newSessionError: 'process died' });
    const connector = new AcpConnector({ spawnProcess: () => fake.handle });
    const connection = await connector.connect(binding);
    // The SDK wraps an agent-side failure as an internal-error response.
    await expect(connection.newSession({ cwd: '/tmp/fake-room' })).rejects.toThrow('Internal error');
    await connection.close();
  });
});

describe('probe', () => {
  it('reports ready when initialize and a trial session both succeed', async () => {
    const { connector } = connectorWith({});
    const probe = await connector.probe(binding);
    expect(probe).toEqual({
      status: 'ready',
      capabilities: {},
      agentInfo: { name: 'fake-agent', version: '1.2.3' },
    });
  });

  it('reports needs-login when session/new refuses with auth_required', async () => {
    const { connector } = connectorWith({
      authRequired: true,
      authMethods: [{ id: 'api-key', name: 'API key' }],
    });
    const probe = await connector.probe(binding);
    expect(probe).toEqual({
      status: 'needs-login',
      authMethods: [{ id: 'api-key', name: 'API key' }],
    });
  });

  it('reports missing when the process never initializes', async () => {
    const { connector } = connectorWith({ initializeError: 'no such adapter' });
    const probe = await connector.probe(binding);
    expect(probe.status).toBe('missing');
  });

  it('reports missing when the process cannot even start', async () => {
    const connector = new AcpConnector({
      spawnProcess: () => {
        throw new Error('spawn ENOENT');
      },
    });
    const probe = await connector.probe(binding);
    expect(probe).toEqual({ status: 'missing', error: 'spawn ENOENT' });
  });
});

describe('client-side fs', () => {
  it('serves the session cwd only: outside paths and symlinks out are refused', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-acp-fs-'));
    writeFileSync(join(root, 'inside.txt'), 'the room owns this', 'utf8');
    const outside = mkdtempSync(join(tmpdir(), 'rivus-acp-fs-out-'));
    writeFileSync(join(outside, 'secret.txt'), 'nothing to see', 'utf8');
    // A symlink that lives inside the root but points out of it.
    symlinkSync(join(outside, 'secret.txt'), join(root, 'escape.txt'));

    // The escape hatch to catch: a link inside the root that dangles out —
    // writing through it would create the file at the far end.
    const { connector, agent } = connectorWith({
      clientFs: {
        inside: join(root, 'inside.txt'),
        outside: join(outside, 'secret.txt'),
        via: join(root, 'escape.txt'),
        content: 'written through the client',
      },
    });
    const connection = await connector.connect(binding);
    const session = await connection.newSession({ cwd: root });
    await connection.prompt(session, [{ type: 'text', text: 'use the client fs' }]);

    expect(agent()?.fsResults).toEqual([
      `readTextFile ${join(root, 'inside.txt')}: ok`,
      `readTextFile ${join(outside, 'secret.txt')}: refused`,
      `writeTextFile ${join(root, 'inside.txt')}: ok`,
      `writeTextFile ${join(outside, 'secret.txt')}: refused`,
      `writeTextFile ${join(root, 'escape.txt')}: refused`,
    ]);

    // The allowed write landed; the refused ones changed nothing.
    expect(await readFile(join(root, 'inside.txt'), 'utf8')).toBe('written through the client');
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('nothing to see');
    await connection.close();
  });

  it('judges a not-yet-existing file by its nearest existing directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-acp-fs-new-'));
    const outside = mkdtempSync(join(tmpdir(), 'rivus-acp-fs-new-out-'));
    const { connector, agent } = connectorWith({
      clientFs: {
        inside: join(root, 'new-file.txt'),
        outside: join(outside, 'new-file.txt'),
        content: 'new content',
      },
    });
    const connection = await connector.connect(binding);
    const session = await connection.newSession({ cwd: root });
    await connection.prompt(session, [{ type: 'text', text: 'write new files' }]);

    expect(agent()?.fsResults).toEqual([
      `readTextFile ${join(root, 'new-file.txt')}: refused`,
      `readTextFile ${join(outside, 'new-file.txt')}: refused`,
      `writeTextFile ${join(root, 'new-file.txt')}: ok`,
      `writeTextFile ${join(outside, 'new-file.txt')}: refused`,
    ]);
    expect(await readFile(join(root, 'new-file.txt'), 'utf8')).toBe('new content');
    await connection.close();
  });
});

describe('client-side fs resolution limits', () => {
  it('refuses a chain past the hop limit, allows in-root ..-names, refuses relative paths', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rivus-acp-fs-chain-'));
    writeFileSync(join(root, '..keep.md'), 'an ordinary name that starts with two dots', 'utf8');
    const outside = mkdtempSync(join(tmpdir(), 'rivus-acp-fs-chain-out-'));
    writeFileSync(join(outside, 'secret.md'), 'at the end of the chain', 'utf8');
    // Forty-five links, every one of them inside the root, ending outside it.
    let link = join(outside, 'secret.md');
    for (let index = 0; index < 45; index += 1) {
      const next = join(root, `l${index}`);
      symlinkSync(link, next);
      link = next;
    }

    const { connector, agent } = connectorWith({
      extraReads: [join(root, '..keep.md'), link, 'relative.md'],
    });
    const connection = await connector.connect(binding);
    const session = await connection.newSession({ cwd: root });
    await connection.prompt(session, [{ type: 'text', text: 'resolve these' }]);

    expect(agent()?.fsResults).toEqual([
      `readTextFile ${join(root, '..keep.md')}: ok`,
      `readTextFile ${link}: refused`,
      'readTextFile relative.md: refused',
    ]);
    await connection.close();
  });
});

describe('close escalation', () => {
  it('kills with SIGKILL once the process has sat through SIGTERM', async () => {
    const fake = fakeAcpProcess({ ignoreSigterm: true });
    const connector = new AcpConnector({ spawnProcess: () => fake.handle, closeKillMs: 30 });
    const connection = await connector.connect(binding);
    const session = await connection.newSession({ cwd: '/tmp/fake-room' });
    await connection.prompt(session, [{ type: 'text', text: 'work' }]);
    await connection.close();
    expect(fake.kills).toEqual([undefined, 'SIGKILL']);
  });
});
