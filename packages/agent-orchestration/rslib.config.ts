import { defineConfig } from '@rslib/core';
import { libConfig } from '@rivus/rslib-config/lib.config';

export default defineConfig({
  ...libConfig,
  source: {
    entry: {
      index: 'src/index.ts',
      orch: 'src/infrastructure/cli.ts',
    },
  },
  output: {
    target: 'node',
    externals: ['node:sqlite'],
  },
  tools: {
    rspack: {
      externals: ['node:sqlite'],
    },
  },
});
