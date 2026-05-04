import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { syncMoonBitVersion } from '../../scripts/moonbit-version/sync-moonbit-version.mjs';

async function createFixture(input) {
  const root = await mkdtemp(join(tmpdir(), 'agent-task-loop-version-'));
  const packageJsonPath = join(root, 'package.json');
  const moonModJsonPath = join(root, 'moon.mod.json');

  await writeFile(packageJsonPath, JSON.stringify(input.packageJson, null, 2) + '\n');
  await writeFile(moonModJsonPath, JSON.stringify(input.moonModJson, null, 2) + '\n');

  return { packageJsonPath, moonModJsonPath };
}

test('syncs moon.mod.json version from the npm package version', async () => {
  const fixture = await createFixture({
    packageJson: { name: '@rivus/agent-finder-core', version: '0.2.0' },
    moonModJson: { name: 'PerfectPan/agent-finder', version: '0.1.0' },
  });

  const result = await syncMoonBitVersion(fixture);

  const moonModJson = JSON.parse(await readFile(fixture.moonModJsonPath, 'utf8'));
  assert.equal(result.changed, true);
  assert.equal(moonModJson.version, '0.2.0');
});

test('check mode rejects version drift without writing moon.mod.json', async () => {
  const fixture = await createFixture({
    packageJson: { name: '@rivus/agent-finder-core', version: '0.2.0' },
    moonModJson: { name: 'PerfectPan/agent-finder', version: '0.1.0' },
  });

  await assert.rejects(
    syncMoonBitVersion({ ...fixture, check: true }),
    /MoonBit version 0\.1\.0 does not match @rivus\/agent-finder-core version 0\.2\.0/,
  );

  const moonModJson = JSON.parse(await readFile(fixture.moonModJsonPath, 'utf8'));
  assert.equal(moonModJson.version, '0.1.0');
});
