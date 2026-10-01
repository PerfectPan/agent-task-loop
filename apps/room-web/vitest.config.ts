import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Component tests need JSX, not React Router's browser-only Fast Refresh preamble.
// Keep the runtime Vite/React Router configuration out of the jsdom test pipeline.
export default defineConfig({
  resolve: {
    alias: { '~': path.resolve(import.meta.dirname, 'app') },
  },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    // Only the jsdom files need it; in a node environment the shims no-op.
    setupFiles: [path.resolve(import.meta.dirname, 'vitest.setup.ts')],
  },
});
