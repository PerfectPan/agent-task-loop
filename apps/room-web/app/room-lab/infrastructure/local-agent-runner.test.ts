import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { runProcess } from './local-agent-runner.server';

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
