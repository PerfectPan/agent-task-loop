import { knip } from '@perfectpan/lint-config/knip';
import type { KnipConfig } from 'knip';

// Knip's default project glob, minus directories that hold no production code (test
// support, package scripts), which only the production analysis (`knip --production`)
// leaves out: a `!dir/**!` pattern applies in production mode only. A workspace that sets
// `project` loses the extensions its compilers add, so `extraExtensions` restores them
// (room-web's Tailwind reads .css); a compiler added to one of these workspaces needs its
// extension here too.
const projectWithout = (nonProduction: string[], extraExtensions: string[] = []) => [
  `**/*.{${['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts', ...extraExtensions].join(',')}}!`,
  ...nonProduction.map((dir) => `!${dir}/**!`),
];

// Package entry points resolve from package.json exports and bin fields; the root
// tests/ directory runs under node:test (not vitest), so it needs explicit entries.
// The shared policy's configuration and tag hints fail the run. An export that
// production code uses only inside its own file and that tests import carries
// `@internal`, which the production analysis skips.
const config: KnipConfig = {
  ...knip,
  workspaces: {
    '.': {
      entry: ['tests/**/*.test.mjs'],
      project: ['tests/**/*.{mjs,ts}', 'scripts/**/*'],
    },
    'packages/agent-task-loop': {
      // lark-cli is an external CLI spawned by the Lark service.
      ignoreBinaries: ['lark-cli'],
      // The package scripts check and fetch release archives; none of them ships.
      project: projectWithout(['scripts']),
    },
    'apps/room-web': {
      // shadcn/ui keeps a curated component set; entries so unused exports stay allowed there.
      entry: ['app/components/ui/**/*.tsx!'],
      // The ACP executables are spawned as child processes by the room host,
      // so the packages that ship them are never imported.
      ignoreDependencies: ['@agentclientprotocol/claude-agent-acp', '@agentclientprotocol/codex-acp'],
      project: projectWithout(['app/room-lab/*/testing'], ['css']),
    },
  },
};

export default config;
