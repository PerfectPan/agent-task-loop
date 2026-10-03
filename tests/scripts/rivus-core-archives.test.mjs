import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertSupportedRivusCoreVersion,
  readRivusCoreArchives,
  verifyRivusCoreArchives,
} from '../../packages/agent-task-loop/scripts/rivus-core-archives.mjs';

const corePackageNames = ['@rivus/platform', '@rivus/runtime', '@rivus/gateway', '@rivus/agent'];

test('rejects conflicting, empty, and unsupported package-check inputs before packing', () => {
  const scriptPath = new URL('../../packages/agent-task-loop/scripts/check-package.mjs', import.meta.url);
  const env = { ...process.env };
  delete env.RIVUS_CORE_PACKAGE;
  delete env.RIVUS_CORE_ARCHIVES_JSON;
  for (const { input, expectedError } of [
    { input: { RIVUS_CORE_ARCHIVES_JSON: '' }, expectedError: /JSON array of four archive paths/ },
    { input: { RIVUS_CORE_ARCHIVES_JSON: '[]' }, expectedError: /exactly four nonempty archive paths/ },
    {
      input: { RIVUS_CORE_ARCHIVES_JSON: '[]', RIVUS_CORE_PACKAGE: '@rivus/agent@0.17.0' },
      expectedError: /Use either RIVUS_CORE_ARCHIVES_JSON or RIVUS_CORE_PACKAGE/,
    },
    { input: { RIVUS_CORE_PACKAGE: '@rivus/agent@0.16.6' }, expectedError: /Unsupported Rivus Core version/ },
  ]) {
    const result = spawnSync(process.execPath, [fileURLToPath(scriptPath)], {
      env: { ...env, ...input },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, expectedError);
    assert.equal(result.stdout, '');
  }
});

test('reads a complete supported archive set and verifies a clean installed consumer', (t) => {
  const fixture = createFixture(t);
  const archives = readRivusCoreArchives(JSON.stringify([...fixture.archivePaths].reverse()));

  assert.deepEqual(
    archives.map(({ name, version }) => ({ name, version })),
    corePackageNames.map((name) => ({ name, version: '0.17.0' })),
  );
  const receipt = verifyRivusCoreArchives(fixture.consumerDirectory, archives);
  assert.deepEqual(
    receipt,
    archives.map(({ name, version, sha256 }) => ({ name, version, sha256 })),
  );
  assert.ok(receipt.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)));
});

test('verifies npm provenance from a real four-archive installation', (t) => {
  const fixture = createFixture(t);
  rmSync(path.join(fixture.consumerDirectory, 'node_modules'), { recursive: true });
  rmSync(path.join(fixture.consumerDirectory, 'package-lock.json'));
  writeJson(path.join(fixture.consumerDirectory, 'package.json'), { name: 'archive-consumer', private: true });
  execFileSync(
    'npm',
    [
      'install',
      ...fixture.archivePaths,
      '--registry',
      'https://registry.npmjs.org/',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=true',
      '--save-exact',
      '--install-strategy=hoisted',
    ],
    { cwd: fixture.consumerDirectory, stdio: 'ignore' },
  );

  assert.equal(verifyRivusCoreArchives(fixture.consumerDirectory, fixture.archives).length, 4);
});

test('rejects malformed, incomplete, duplicate, old, and mixed-version archives', (t) => {
  const fixture = createFixture(t);
  assert.throws(() => readRivusCoreArchives('not-json'), /JSON array/);
  assert.throws(() => readRivusCoreArchives(JSON.stringify(fixture.archivePaths.slice(1))), /exactly four/);
  assert.throws(
    () => readRivusCoreArchives(JSON.stringify([...fixture.archivePaths.slice(0, 3), fixture.archivePaths[0]])),
    /Duplicate Rivus Core archive/,
  );
  assert.throws(() => assertSupportedRivusCoreVersion('0.16.6'), /Unsupported Rivus Core version/);
  assert.throws(() => assertSupportedRivusCoreVersion('0.18.0'), /Unsupported Rivus Core version/);
  assert.throws(() => assertSupportedRivusCoreVersion('0.17.0-rc.1'), /Unsupported Rivus Core version/);
  const mixedVersionFixture = createFixture(t, ['0.17.0', '0.17.0', '0.17.0', '0.17.1']);
  assert.throws(() => readRivusCoreArchives(JSON.stringify(mixedVersionFixture.archivePaths)), /same version/);
});

test('rejects registry substitution even when the Core version matches', (t) => {
  const fixture = createFixture(t);
  const lock = readLock(fixture);
  lock.packages['node_modules/@rivus/runtime'].resolved =
    'https://registry.npmjs.org/@rivus/runtime/-/runtime-0.17.0.tgz';
  writeLock(fixture, lock);

  assert.throws(
    () => verifyRivusCoreArchives(fixture.consumerDirectory, fixture.archives),
    /source is not the supplied archive: @rivus\/runtime/,
  );
});

test('rejects a different lock integrity or installed manifest', (t) => {
  const fixture = createFixture(t);
  const lock = readLock(fixture);
  lock.packages['node_modules/@rivus/runtime'].integrity = 'sha512-different-artifact';
  writeLock(fixture, lock);
  assert.throws(
    () => verifyRivusCoreArchives(fixture.consumerDirectory, fixture.archives),
    /lock version or integrity does not match archive: @rivus\/runtime/,
  );

  const manifestFixture = createFixture(t);
  writeJson(path.join(manifestFixture.consumerDirectory, 'node_modules', '@rivus', 'runtime', 'package.json'), {
    ...manifestFixture.archives[1].manifest,
    exports: { './package.json': './other-package.json' },
  });
  assert.throws(
    () => verifyRivusCoreArchives(manifestFixture.consumerDirectory, manifestFixture.archives),
    /Installed Rivus Core manifest does not match archive: @rivus\/runtime/,
  );
});

test('rejects a nested registry Core lock entry despite correct top-level installations', (t) => {
  const fixture = createFixture(t);
  const lock = readLock(fixture);
  lock.packages['node_modules/@rivus/agent/node_modules/@rivus/runtime'] = {
    ...lock.packages['node_modules/@rivus/runtime'],
    resolved: 'https://registry.npmjs.org/@rivus/runtime/-/runtime-0.17.0.tgz',
  };
  writeLock(fixture, lock);

  assert.throws(
    () => verifyRivusCoreArchives(fixture.consumerDirectory, fixture.archives),
    /source is not the supplied archive: @rivus\/runtime/,
  );
});

test('rejects unexpected module resolution independently of the manifest and lock checks', (t) => {
  const fixture = createFixture(t);
  const nestedRuntimeDirectory = path.join(
    fixture.consumerDirectory,
    'node_modules',
    '@rivus',
    'agent',
    'node_modules',
    '@rivus',
    'runtime',
  );
  mkdirSync(nestedRuntimeDirectory, { recursive: true });
  writeJson(path.join(nestedRuntimeDirectory, 'package.json'), fixture.archives[1].manifest);

  assert.throws(
    () => verifyRivusCoreArchives(fixture.consumerDirectory, fixture.archives),
    /resolves to an unexpected installation: @rivus\/runtime/,
  );
});

test('rejects an archive changed after input inspection', (t) => {
  const fixture = createFixture(t);
  writeFileSync(
    fixture.archivePaths[0],
    Buffer.concat([readFileSync(fixture.archivePaths[0]), Buffer.from('changed')]),
  );

  assert.throws(
    () => verifyRivusCoreArchives(fixture.consumerDirectory, fixture.archives),
    /archive changed during installation: @rivus\/platform/,
  );
});

function createFixture(t, versions = corePackageNames.map(() => '0.17.0')) {
  const directory = mkdtempSync(path.join(tmpdir(), 'rivus-core-archives-test space-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const archivePaths = corePackageNames.map((name, index) => {
    const packageName = name.slice('@rivus/'.length);
    const sourceDirectory = path.join(directory, packageName);
    mkdirSync(path.join(sourceDirectory, 'package'), { recursive: true });
    writeJson(path.join(sourceDirectory, 'package', 'package.json'), {
      name,
      version: versions[index],
      type: 'module',
      exports: { './package.json': './package.json' },
    });
    const archivePath = path.join(directory, `${packageName}.tgz`);
    execFileSync('tar', ['-czf', archivePath, '-C', sourceDirectory, 'package']);
    return archivePath;
  });
  const consumerDirectory = path.join(directory, 'consumer');
  mkdirSync(consumerDirectory);
  // A mixed-version fixture is only used to exercise input rejection.
  if (new Set(versions).size !== 1) {
    return { archivePaths, consumerDirectory };
  }
  const archives = readRivusCoreArchives(JSON.stringify(archivePaths));
  const dependencies = Object.fromEntries(archives.map((archive) => [archive.name, `file:${archive.path}`]));
  writeJson(path.join(consumerDirectory, 'package.json'), { name: 'archive-consumer', private: true, dependencies });
  const packages = { '': { dependencies } };
  for (const archive of archives) {
    const installedDirectory = path.join(consumerDirectory, 'node_modules', archive.name);
    mkdirSync(installedDirectory, { recursive: true });
    writeJson(path.join(installedDirectory, 'package.json'), archive.manifest);
    packages[`node_modules/${archive.name}`] = {
      version: archive.version,
      resolved: `file:${archive.path}`,
      integrity: archive.integrity,
    };
  }
  writeJson(path.join(consumerDirectory, 'package-lock.json'), { lockfileVersion: 3, packages });
  return { archives, archivePaths, consumerDirectory };
}

function readLock(fixture) {
  return JSON.parse(readFileSync(path.join(fixture.consumerDirectory, 'package-lock.json'), 'utf8'));
}

function writeLock(fixture, lock) {
  writeJson(path.join(fixture.consumerDirectory, 'package-lock.json'), lock);
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
