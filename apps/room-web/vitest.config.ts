import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Component tests need JSX, not Remix's browser-only Fast Refresh preamble.
// Keep the runtime Vite/Remix configuration out of the jsdom test pipeline.
export default defineConfig({
  resolve: {
    alias: { '~': path.resolve(__dirname, 'app') },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    // Only the jsdom files need it; in a node environment the shims no-op.
    setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
  },
});
