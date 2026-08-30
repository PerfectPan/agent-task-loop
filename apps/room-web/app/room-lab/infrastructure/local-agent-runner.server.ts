import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ProcessRunner, SeatBind } from '@rivus/agent-orchestration';
import type { AgentRunner } from '../application/ports';
import type { RoomLabAgentId } from '../domain/agent-roster';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 12_000;
const TERMINATION_GRACE_MS = 2_000;

export function agentSeatBinding(agentId: RoomLabAgentId): SeatBind {
  switch (agentId) {
    case 'claude-relay':
      return {
        cmd: 'zsh',
        args: [
          '-lic',
          'claude-relay -p --no-session-persistence --output-format text "$1"',
          'rivus-room',
        ],
      };
    case 'claude':
      return {
        cmd: 'claude',
        args: [
          '-p',
          '--safe-mode',
          '--restricted',
          '--no-session-persistence',
          '--output-format',
          'text',
        ],
      };
    case 'grok':
      return {
        cmd: 'grok',
        args: [
          '--no-subagents',
          '--disable-web-search',
          '--no-memory',
          '--permission-mode',
          'plan',
          '--sandbox',
          'read-only',
          '--output-format',
          'plain',
          '--single',
        ],
        env: { NO_COLOR: '1' },
      };
    case 'codex':
      return {
        cmd: 'codex',
        args: [
          'exec',
          '--ignore-user-config',
          '--ephemeral',
          '--sandbox',
          'read-only',
          '--skip-git-repo-check',
          '--ignore-rules',
          '--color',
          'never',
        ],
      };
    case 'opencode':
      return {
        cmd: 'opencode',
        args: [
          'run',
          '--pure',
          '--model',
          'opencode/ling-3.0-flash-fin-free',
        ],
        env: { NO_COLOR: '1' },
      };
    case 'dsh':
      return {
        cmd: 'dsh',
        args: ['--profile', 'headless'],
        env: { NO_COLOR: '1' },
      };
  }
}

export const localAgentProcessRunner: ProcessRunner = input => runProcess({
  command: input.cmd,
  args: input.args,
  cwd: input.cwd,
  env: input.env,
  signal: input.signal,
  onSpawn: input.onSpawn,
});

export const runLocalAgent: AgentRunner = async (agentId, prompt, signal) => {
  const startedAt = Date.now();
  const sandboxDir = await mkdtemp(path.join(os.tmpdir(), `rivus-room-${agentId}-`));
  const binding = agentSeatBinding(agentId);
  try {
    const result = await runProcess({
      command: binding.cmd,
      args: [...(binding.args ?? []), prompt],
      cwd: sandboxDir,
      env: binding.env ?? {},
      signal,
    });
    if (result.exitCode !== 0) {
      throw new AgentRunError(
        agentId,
        processFailureMessage(result.exitCode, result.stderr),
      );
    }
    const text = normalizeAgentOutput(agentId, result.stdout);
    if (!text) throw new AgentRunError(agentId, 'CLI returned an empty response');
    return { text, latencyMs: Date.now() - startedAt };
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
};

export interface RunProcessInput {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  signal?: AbortSignal;
  onSpawn?: (pid?: number) => void;
  timeoutMs?: number;
  maxOutputChars?: number;
  terminationGraceMs?: number;
}

export function runProcess(input: RunProcessInput): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve, reject) => {
    input.signal?.throwIfAborted();
    const timeoutMs = input.timeoutMs ?? resolveTimeoutMs();
    const maxOutputChars = input.maxOutputChars ?? MAX_OUTPUT_CHARS;
    const terminationGraceMs = input.terminationGraceMs ?? TERMINATION_GRACE_MS;
    const detached = process.platform !== 'win32';
    let stdout = '';
    let stderr = '';
    let settled = false;
    let stopError: Error | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let forceSettleTimer: ReturnType<typeof setTimeout> | undefined;
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      detached,
      env: { ...process.env, ...input.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const cleanup = () => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      if (forceSettleTimer) clearTimeout(forceSettleTimer);
      input.signal?.removeEventListener('abort', onAbort);
    };
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const signalTree = (signal: NodeJS.Signals) => {
      if (child.pid && detached) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch {
          // Fall back to the direct child if the process group already disappeared.
        }
      }
      child.kill(signal);
    };
    const stop = (error: Error) => {
      if (stopError) return;
      stopError = error;
      child.stdout.removeAllListeners('data');
      child.stderr.removeAllListeners('data');
      child.stdout.resume();
      child.stderr.resume();
      signalTree('SIGTERM');
      killTimer = setTimeout(() => signalTree('SIGKILL'), terminationGraceMs);
      killTimer.unref();
      forceSettleTimer = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finishReject(stopError!);
      }, terminationGraceMs + 250);
      forceSettleTimer.unref();
    };
    const timeout = setTimeout(() => {
      stop(new Error(`${input.command} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    timeout.unref();
    const onAbort = () => stop(abortError(input.command, input.signal?.reason));
    input.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', chunk => {
      const text = String(chunk);
      const remaining = Math.max(0, maxOutputChars - stdout.length);
      stdout += text.slice(0, remaining);
      if (text.length > remaining) {
        stop(new Error(`${input.command} exceeded the ${maxOutputChars}-character output limit`));
      }
    });
    child.stderr.on('data', chunk => {
      const text = String(chunk);
      const remaining = Math.max(0, maxOutputChars - stderr.length);
      stderr += text.slice(0, remaining);
    });
    child.on('error', error => finishReject(stopError ?? error));
    child.on('close', code => {
      if (settled) return;
      if (stopError) {
        finishReject(stopError);
        return;
      }
      settled = true;
      cleanup();
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
    try {
      input.onSpawn?.(child.pid);
    } catch (error) {
      stop(error instanceof Error ? error : new Error('process spawn observer failed'));
    }
  });
}

function resolveTimeoutMs(): number {
  const configured = Number(process.env.ROOM_AGENT_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000 ? configured : DEFAULT_TIMEOUT_MS;
}

function abortError(command: string, reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(`${command} was aborted`);
}

export function normalizeAgentOutput(agentId: RoomLabAgentId, output: string): string {
  const plain = output.replace(/\u001b\[[0-9;]*m/g, '').trim();
  const providerText = agentId === 'opencode'
    ? plain.split('\n').filter(line => !/^>\s+build\s+·/i.test(line.trim())).join('\n').trim()
    : plain;
  return providerText
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function processFailureMessage(exitCode: number, stderr: string): string {
  const plain = stderr.replace(/\u001b\[[0-9;]*m/g, ' ');
  if (/usage balance exhausted|payment required|run out of credits|spending-limit/i.test(plain)) {
    return 'CLI usage balance is exhausted';
  }
  if (/authentication|unauthorized|not logged in|login required/i.test(plain)) {
    return 'CLI authentication is unavailable';
  }
  return `CLI exited with code ${exitCode}`;
}

export class AgentRunError extends Error {
  constructor(
    readonly agentId: RoomLabAgentId,
    message: string,
  ) {
    super(`${agentId}: ${message}`);
    this.name = 'AgentRunError';
  }
}
