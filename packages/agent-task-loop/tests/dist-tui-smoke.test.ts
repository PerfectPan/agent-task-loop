import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it, onTestFinished } from 'vitest';

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

/** Runs the built CLI, presses `q` once `expected` is on screen, and resolves when it has exited. */
function runTui(args: string[], expected: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const home = mkdtempSync(join(tmpdir(), 'agent-task-loop-smoke-'));
  onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  const emptyBin = join(home, 'bin');
  mkdirSync(emptyBin);
  const config = join(home, 'config.json');
  writeFileSync(
    config,
    JSON.stringify({
      feishu: { baseToken: 'smoke-base', tableId: 'smoke-table' },
      projects: {},
      repositories: {},
      agents: {},
    }),
  );
  return new Promise((resolve) => {
    // PATH is an empty directory, so the Feishu fetch fails at once on the missing
    // lark-cli instead of reaching the network; the dashboard shows that error and
    // keeps running.
    const child = spawn(process.execPath, ['--import', FAKE_TTY, CLI, ...args, '--config', config], {
      env: { HOME: home, PATH: emptyBin },
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
    // `close` fires after the output streams end, so stdout and stderr are complete.
    child.on('close', (code) => {
      clearTimeout(timer);
      clearInterval(quitting);
      resolve({ code, stdout, stderr });
    });
  });
}

describe('built CLI', () => {
  it('renders the tui dashboard and quits on q', async () => {
    const result = await runTui(['tui'], 'Agent Task Loop');

    // ink restores the cursor with an escape sequence on stderr; anything else is a failure.
    expect(stripVTControlCharacters(result.stderr).trim()).toBe('');
    expect(result.stdout).toContain('Agent Task Loop');
    expect(result.code).toBe(0);
  }, 15_000);
});
