import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const { packageManager } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

function createFixture(t, effectVersion) {
  const directory = mkdtempSync(join(tmpdir(), 'kit-peer-check-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dependencies = {};
  for (const manifest of [
    {
      name: '@rivus/agent-kit',
      version: '1.0.0',
      peerDependencies: { effect: '1.0.0' },
      peerDependenciesMeta: { effect: { optional: true } },
    },
    { name: 'effect', version: effectVersion },
  ]) {
    const archiveName = `${manifest.name.replaceAll('/', '-').replaceAll('@', '')}.tgz`;
    const sourceDirectory = join(directory, archiveName.slice(0, -4));
    mkdirSync(join(sourceDirectory, 'package'), { recursive: true });
    writeFileSync(join(sourceDirectory, 'package', 'package.json'), JSON.stringify(manifest));
    execFileSync('tar', ['-czf', join(directory, archiveName), '-C', sourceDirectory, 'package']);
    dependencies[manifest.name] = `file:${archiveName}`;
  }
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({ name: 'kit-peer-fixture', private: true, dependencies }),
  );
  writeFileSync(join(directory, 'pnpm-workspace.yaml'), 'packages:\n  - .\n');
  return directory;
}

function runPnpm(directory, args) {
  return spawnSync(process.env.npm_execpath ?? 'pnpm', [...args, '--store-dir', join(directory, 'store')], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, COREPACK_ENABLE_NETWORK: '0' },
    timeout: 30_000,
  });
}

function generateLockfile(directory) {
  // Reuse the repository's running pnpm without making an isolated home download it again.
  const version = runPnpm(directory, ['--version']);
  assert.equal(version.status, 0, `${version.error ?? ''}\n${version.stdout}\n${version.stderr}`);
  assert.equal(version.stdout.trim(), packageManager.split('@').at(-1));
  // Allow a mismatched graph to be written, as an updater with relaxed peer checks might do.
  const result = runPnpm(directory, ['install', '--offline', '--ignore-scripts', '--no-strict-peer-dependencies']);
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
}

test('the lockfile peer check accepts a compatible exact optional Effect peer', (t) => {
  const directory = createFixture(t, '1.0.0');
  generateLockfile(directory);

  const result = runPnpm(directory, ['peers', 'check', '--lockfile-only', '--json']);

  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  assert.deepEqual(JSON.parse(result.stdout)['.'].bad, {});
});

test('the lockfile peer check rejects an incompatible installed optional Effect peer', (t) => {
  const directory = createFixture(t, '2.0.0');
  generateLockfile(directory);

  const result = runPnpm(directory, ['peers', 'check', '--lockfile-only', '--json']);

  assert.equal(result.status, 1, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  const [issue] = JSON.parse(result.stdout)['.'].bad.effect;
  assert.equal(issue.optional, true);
  assert.equal(issue.wantedRange, '1.0.0');
  assert.equal(issue.foundVersion, '2.0.0');
  assert.equal(issue.parents.at(-1).name, '@rivus/agent-kit');
});
