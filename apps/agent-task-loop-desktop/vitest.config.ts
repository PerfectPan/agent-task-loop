import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Resolve the workspace package to its built dist for the subpath export.
      '@rivus/agent-task-loop/task-manager': path.resolve(
        __dirname,
        '../../packages/agent-task-loop/dist/task-manager.js',
      ),
    },
  },
});
