import { execa } from 'execa';
import type { TaskRecord } from '../types/task';

export interface AgentExecutionResult {
  status: 'success' | 'failure';
  summary: string;
  workspacePath?: string;
  prLink?: string;
  error?: string;
}

export interface AgentAdapter {
  execute(input: {
    task: TaskRecord;
    workspacePath: string;
    cwd: string;
    prompt: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    sessionName?: string;
    onSpawn?: (payload: { pid?: number }) => void;
    onHeartbeat?: () => void;
    onOutput?: (chunk: string) => void;
    onProgress?: (summary: string) => void;
    onSession?: (payload: { sessionId?: string; sessionName?: string }) => void;
  }): Promise<AgentExecutionResult>;
}

export async function runAgentCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
  cwd: string,
  onSpawn?: (payload: { pid?: number }) => void,
  onHeartbeat?: () => void,
  onOutput?: (chunk: string) => void,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const subprocess = execa(command, args, {
    cwd,
    env: { ...process.env, ...env },
    reject: false,
    all: true,
    stdin: 'ignore',
  });
  onSpawn?.({ pid: subprocess.pid });
  onHeartbeat?.();
  const heartbeatTimer = setInterval(() => {
    onHeartbeat?.();
  }, 15_000);
  heartbeatTimer.unref();
  subprocess.all?.on('data', chunk => {
    onHeartbeat?.();
    onOutput?.(chunk.toString());
  });
  try {
    const result = await subprocess;

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 1,
    };
  } finally {
    clearInterval(heartbeatTimer);
  }
}
