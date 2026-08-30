import os from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  agentSeatBinding,
  normalizeAgentOutput,
  runProcess,
} from './local-agent-runner.server';

describe('agentSeatBinding', () => {
  it('maps every Room seat to a headless local entry point', () => {
    expect(agentSeatBinding('claude-relay')).toMatchObject({ cmd: 'zsh' });
    expect(agentSeatBinding('claude')).toMatchObject({ cmd: 'claude' });
    expect(agentSeatBinding('grok')).toMatchObject({ cmd: 'grok' });
    expect(agentSeatBinding('codex')).toMatchObject({ cmd: 'codex' });
    expect(agentSeatBinding('opencode')).toMatchObject({ cmd: 'opencode' });
    expect(agentSeatBinding('dsh')).toMatchObject({ cmd: 'dsh' });
    expect(JSON.stringify(agentSeatBinding('claude-relay'))).not.toMatch(
      /AUTH_TOKEN|API_KEY|https:\/\//,
    );
  });

  it('removes the OpenCode model banner from the public Room reply', () => {
    expect(normalizeAgentOutput(
      'opencode',
      '\u001b[0m\n> build · ling-3.0-flash-fin-free\n\u001b[0m\n5\n',
    )).toBe('5');
  });
});

describe('runProcess', () => {
  it('rejects an already aborted run before spawning', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled before spawn'));

    await expect(runProcess({
      command: process.execPath,
      args: ['-e', 'process.exit(0)'],
      cwd: os.tmpdir(),
      env: {},
      signal: controller.signal,
    })).rejects.toThrow('cancelled before spawn');
  });

  it('terminates a running child process when the request is aborted', async () => {
    const controller = new AbortController();
    let childPid: number | undefined;
    const pending = runProcess({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: os.tmpdir(),
      env: {},
      signal: controller.signal,
      terminationGraceMs: 50,
      onSpawn: pid => {
        childPid = pid;
      },
    });

    controller.abort(new Error('browser disconnected'));
    await expect(pending).rejects.toThrow('browser disconnected');
    expect(childPid).toBeDefined();
    expect(() => process.kill(childPid!, 0)).toThrow();
  });

  it('hard-caps output and terminates the process tree', async () => {
    await expect(runProcess({
      command: process.execPath,
      args: ['-e', "process.stdout.write('x'.repeat(5000)); setInterval(() => {}, 1000)"],
      cwd: os.tmpdir(),
      env: {},
      timeoutMs: 2_000,
      maxOutputChars: 100,
      terminationGraceMs: 50,
    })).rejects.toThrow('exceeded the 100-character output limit');
  });

  it('uses SIGKILL after grace when a process tree ignores SIGTERM', async () => {
    const startedAt = Date.now();
    await expect(runProcess({
      command: process.execPath,
      args: [
        '-e',
        "const {spawn}=require('node:child_process'); process.on('SIGTERM',()=>{}); spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)\"],{stdio:'inherit'}); setInterval(()=>{},1000)",
      ],
      cwd: os.tmpdir(),
      env: {},
      timeoutMs: 50,
      maxOutputChars: 100,
      terminationGraceMs: 50,
    })).rejects.toThrow('timed out');
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
});
