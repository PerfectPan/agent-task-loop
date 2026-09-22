import os from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  agentSeatBinding,
  normalizeAgentOutput,
  runProcess,
} from './local-agent-runner.server';

describe('agentSeatBinding', () => {
  it('runs every member through one interactive login shell with the prompt as $1', () => {
    expect(agentSeatBinding('NO_COLOR=1 opencode run --pure')).toEqual({
      cmd: 'zsh',
      args: ['-lic', 'NO_COLOR=1 opencode run --pure "$1"', 'rivus-room'],
    });
    // The prompt is a positional argument, so its content is never parsed as
    // part of the command line the shell runs.
    const binding = agentSeatBinding('demo --flag');
    expect([...(binding.args ?? []), '@all 报数; rm -rf /'].at(-1)).toBe('@all 报数; rm -rf /');
    expect(JSON.stringify(binding)).not.toMatch(/AUTH_TOKEN|API_KEY|https:\/\//);
  });

  it('removes a tool banner line from the public Room reply whoever printed it', () => {
    expect(normalizeAgentOutput(
      '\u001b[0m\n> build · ling-3.0-flash-fin-free\n\u001b[0m\n5\n',
    )).toBe('5');
    expect(normalizeAgentOutput('> session · headless\n结论在这里')).toBe('结论在这里');
    // A quoted line in the answer is not a banner: no ` · ` after one word.
    expect(normalizeAgentOutput('> 引用的一句话\n接着说')).toBe('> 引用的一句话\n接着说');
    expect(normalizeAgentOutput('```text\n答案\n```')).toBe('答案');
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
