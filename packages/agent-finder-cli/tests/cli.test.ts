import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';

const cli = join(process.cwd(), 'src', 'cli.ts');
const loader = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'loader.mjs');

function runCli(args: string[]) {
  const { VITEST: _vitest, VITEST_WORKER_ID: _vitestWorkerId, ...env } = process.env;
  return spawnSync(process.execPath, ['--conditions=development', '--import', loader, cli, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...env, NO_COLOR: '1' },
  });
}

function output(result: ReturnType<typeof runCli>) {
  return `${result.stdout}\n${result.stderr}`;
}

describe('@rivus/agent-finder-cli', () => {
  test('shows provider help as the baseline experience', () => {
    const result = runCli(['provider', '-h']);

    expect(result.status).toBe(0);
    expect(output(result)).toContain('USAGE agent-finder provider list|inspect');
    expect(output(result)).toContain('Use agent-finder provider <command> --help');
  });

  test('prints the package version', () => {
    const { version } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
    };

    const result = runCli(['-v']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(version);
    expect(output(runCli(['provider', '-h']))).toContain(`(agent-finder provider v${version})`);
  });

  test('prints the package version from the built CLI', () => {
    const { version } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
    };

    const result = spawnSync(process.execPath, [join(process.cwd(), 'dist', 'cli.js'), '-v'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(version);
  });

  test('lists supported providers', () => {
    const result = runCli(['provider', 'list']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('codex');
    expect(result.stdout).toContain('amp');
  });

  test('inspects one provider without host access', () => {
    const result = runCli(['provider', 'inspect', 'codex']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Codex');
    expect(result.stdout).toContain('versioned-cli');
    expect(result.stdout).toContain('codex');
  });

  test('prints stable scan json', () => {
    const result = runCli(['scan', '--json']);

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout) as { agent: string; status: string }[];
    // The kit's 7 built-in agents plus the 20 the CLI carries as its own probe recipes.
    expect(json).toHaveLength(27);
    expect(json.map((installation) => installation.agent)).toContain('codex');
    expect(json.map((installation) => installation.agent)).toContain('grok');
    expect(json.map((installation) => installation.agent)).toContain('amp');
    for (const installation of json) {
      expect(['runnable', 'found', 'missing', 'unknown']).toContain(installation.status);
    }
  });

  test('prints doctor summary', () => {
    const result = runCli(['doctor']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Total providers: 27');
    expect(result.stdout).toContain('Runnable:');
  });
});
