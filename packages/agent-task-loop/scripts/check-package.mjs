import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rivusCoreSource = process.env.RIVUS_CORE_PACKAGE?.trim() || '@rivus/agent@0.1.1';
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'agent-task-loop-package-check-'));
const archiveDirectory = path.join(temporaryRoot, 'archive');
const cliConsumerDirectory = path.join(temporaryRoot, 'cli-consumer');
const pluginConsumerDirectory = path.join(temporaryRoot, 'plugin-consumer');

try {
  mkdirSync(archiveDirectory);
  mkdirSync(cliConsumerDirectory);
  mkdirSync(pluginConsumerDirectory);
  execFileSync(
    'corepack',
    ['pnpm@9.15.9', 'pack', '--pack-destination', archiveDirectory],
    { cwd: packageRoot, stdio: 'ignore' },
  );
  const archiveNames = readdirSync(archiveDirectory).filter(name => name.endsWith('.tgz'));
  if (archiveNames.length !== 1) {
    throw new Error(`Expected one package archive, found ${archiveNames.length}`);
  }
  const archivePath = path.join(archiveDirectory, archiveNames[0]);

  writeFileSync(
    path.join(cliConsumerDirectory, 'package.json'),
    JSON.stringify({ name: 'agent-task-loop-cli-smoke', private: true, type: 'module' }),
  );
  execFileSync(
    'npm',
    [
      'install',
      archivePath,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
    ],
    { cwd: cliConsumerDirectory, stdio: 'inherit' },
  );
  if (existsSync(path.join(cliConsumerDirectory, 'node_modules', '@rivus', 'agent'))) {
    throw new Error('CLI-only install unexpectedly installed the optional @rivus/agent peer');
  }
  const cliPath = path.join(
    cliConsumerDirectory,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'agent-task-loop.cmd' : 'agent-task-loop',
  );
  execFileSync(cliPath, ['--help'], { cwd: cliConsumerDirectory, stdio: 'ignore' });

  writeFileSync(
    path.join(pluginConsumerDirectory, 'package.json'),
    JSON.stringify({ name: 'agent-task-loop-plugin-smoke', private: true, type: 'module' }),
  );
  execFileSync(
    'npm',
    [
      'install',
      archivePath,
      rivusCoreSource,
      'typescript@5.8.3',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
    ],
    { cwd: pluginConsumerDirectory, stdio: 'inherit' },
  );
  const installedPackageDirectory = path.join(
    pluginConsumerDirectory,
    'node_modules',
    '@rivus',
    'agent-task-loop',
  );
  for (const requiredPath of [
    'dist/cli.js',
    'dist/rivus-plugin.js',
    'dist/rivus-plugin.d.ts',
    'docs/rivus-plugin.md',
  ]) {
    if (!existsSync(path.join(installedPackageDirectory, requiredPath))) {
      throw new Error(`Packed package is missing ${requiredPath}`);
    }
  }

  writeFileSync(
    path.join(pluginConsumerDirectory, 'smoke.mjs'),
    `import { assertRivusPluginConforms } from '@rivus/agent/testing';
import plugin, { TASK_MANAGER_PROFILE_ID, TASK_MANAGER_TOOL_IDS } from '@rivus/agent-task-loop/rivus-plugin';

const result = await assertRivusPluginConforms({
  deployment: {
    agentId: 'package-smoke',
    endpointIds: [],
    pluginId: 'agent-task-loop',
    profileId: TASK_MANAGER_PROFILE_ID,
    skills: { allow: [] },
    tools: { allow: TASK_MANAGER_TOOL_IDS },
  },
  plugin,
});
if (result.toolIds.length !== 4 || TASK_MANAGER_TOOL_IDS.length !== 4) {
  throw new Error('Expected four Task Manager Tools');
}
`,
  );
  execFileSync(process.execPath, [path.join(pluginConsumerDirectory, 'smoke.mjs')], {
    cwd: pluginConsumerDirectory,
    stdio: 'inherit',
  });

  writeFileSync(
    path.join(pluginConsumerDirectory, 'smoke.ts'),
    `import type { RivusPlugin } from '@rivus/agent';
import plugin, { createRivusTaskManagerPlugin } from '@rivus/agent-task-loop/rivus-plugin';

const defaultPlugin: RivusPlugin = plugin;
const configuredPlugin: RivusPlugin = createRivusTaskManagerPlugin();
void [defaultPlugin, configuredPlugin];
`,
  );
  writeFileSync(
    path.join(pluginConsumerDirectory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        // Rivus deliberately leaves runtime adapter peers optional; consumer projects
        // should not need those adapters just to typecheck this Plugin entrypoint.
        skipLibCheck: true,
        strict: true,
        target: 'ES2022',
      },
      files: ['smoke.ts'],
    }),
  );
  execFileSync(
    path.join(pluginConsumerDirectory, 'node_modules', '.bin', 'tsc'),
    ['--project', path.join(pluginConsumerDirectory, 'tsconfig.json')],
    { cwd: pluginConsumerDirectory, stdio: 'inherit' },
  );

  const installedPackageJson = JSON.parse(
    readFileSync(
      path.join(installedPackageDirectory, 'package.json'),
      'utf8',
    ),
  );
  if (installedPackageJson.peerDependencies?.['@rivus/agent'] !== '>=0.1.1 <0.4.0') {
    throw new Error('Unexpected @rivus/agent peer range');
  }
  if (!installedPackageJson.peerDependenciesMeta?.['@rivus/agent']?.optional) {
    throw new Error('Expected @rivus/agent to remain an optional peer');
  }

  console.log('Clean consumer package check passed.');
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
