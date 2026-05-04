#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { syncMoonBitVersion } from './moonbit-version/sync-moonbit-version.mjs';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const check = process.argv.includes('--check');

try {
  const result = await syncMoonBitVersion({
    check,
    packageJsonPath: join(rootDir, 'packages/agent-finder/package.json'),
    moonModJsonPath: join(rootDir, 'packages/agent-finder/moon.mod.json'),
  });

  const mode = check ? 'checked' : result.changed ? 'synced' : 'already synced';
  console.log(`MoonBit version ${mode}: ${result.version}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
