import { knip } from '@perfectpan/lint-config/knip';
import type { KnipConfig } from 'knip';

// Package entry points resolve from package.json exports and bin fields; the root
// tests/ directory runs under node:test (not vitest), so it needs explicit entries.
// Unused exports and types are staged for a dedicated cleanup pass; the shared
// policy's configuration and tag hints still fail the run.
const config: KnipConfig = {
  ...knip,
  exclude: ['exports', 'types'],
  workspaces: {
    '.': {
      entry: ['tests/**/*.test.mjs'],
      project: ['tests/**/*.{mjs,ts}', 'scripts/**/*'],
    },
    'packages/agent-task-loop': {
      // lark-cli is an external CLI spawned by the Lark service.
      ignoreBinaries: ['lark-cli'],
    },
    'apps/room-web': {
      // shadcn/ui keeps a curated component set; entries so unused exports stay allowed there.
      entry: ['app/components/ui/**/*.tsx!'],
      // The ACP executables are spawned as child processes by the room host,
      // so the packages that ship them are never imported.
      ignoreDependencies: ['@agentclientprotocol/claude-agent-acp', '@agentclientprotocol/codex-acp'],
    },
  },
};

export default config;
