#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distEntrypoint = path.join(packageRoot, 'dist', 'cli.js');
const sourceEntrypoint = path.join(packageRoot, 'src', 'cli.ts');
const tsxLoader = path.join(packageRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs');

const forceSource = process.env.AGENT_FINDER_FORCE_SOURCE === '1';
const canRunFromSource = existsSync(sourceEntrypoint) && existsSync(tsxLoader);
const fromSource = forceSource || canRunFromSource;
const args = fromSource
  ? ['--conditions=development', '--import', tsxLoader, sourceEntrypoint, ...process.argv.slice(2)]
  : [distEntrypoint, ...process.argv.slice(2)];

const result = spawnSync(process.execPath, args, {
  cwd: process.cwd(),
  // tsx discovers tsconfig.json from the working directory. Invoked from a
  // checkout root without a root tsconfig, it falls back to the classic JSX
  // transform and the TUI dies with "React is not defined". Pin the package's
  // own tsconfig for the source run (#141); the dist run needs no tsx.
  env: fromSource ? { ...process.env, TSX_TSCONFIG_PATH: path.join(packageRoot, 'tsconfig.json') } : process.env,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
