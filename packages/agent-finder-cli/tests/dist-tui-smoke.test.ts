import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ink renders only to a TTY and switches stdin to raw mode; a test runner has
// neither, so the child process reports both before the bundled CLI starts.
const FAKE_TTY = `data:text/javascript,${encodeURIComponent(`
for (const stream of [process.stdin, process.stdout]) {
  Object.defineProperty(stream, 'isTTY', { value: true });
}
process.stdin.setRawMode = () => process.stdin;
process.stdout.columns = 120;
process.stdout.rows = 40;
`)}`;

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

/** Runs the built CLI, presses `q` once `expected` is on screen, and resolves when it exits. */
function runTui(args: string[], expected: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const home = mkdtempSync(join(tmpdir(), 'agent-finder-smoke-'));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', FAKE_TTY, CLI, ...args], {
      env: { HOME: home, PATH: process.env.PATH },
      stdio: 'pipe',
    });
    let stdout = '';
    let stderr = '';
    let quitting: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => child.kill(), 8_000);
    // The first frame can arrive before ink subscribes to stdin, so keep pressing
    // `q` until the process exits; a press that lands after the exit fails with
    // EPIPE, which is expected.
    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (!quitting && stdout.includes(expected)) {
        quitting = setInterval(() => child.stdin.write('q'), 100);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      clearInterval(quitting);
      resolve({ code, stdout, stderr });
    });
  });
}

describe('built CLI', () => {
  it('renders the sessions browser and quits on q', async () => {
    const result = await runTui(['sessions', 'browse'], 'No sessions found.');

    expect(result.stderr).not.toContain('Error');
    expect(result.stdout).toContain('No sessions found.');
    expect(result.code).toBe(0);
  }, 15_000);
});
