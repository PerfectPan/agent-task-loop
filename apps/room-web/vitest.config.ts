import { defineConfig } from 'vitest/config';

// Component tests need JSX, not Remix's browser-only Fast Refresh preamble.
// Keep the runtime Vite/Remix configuration out of the jsdom test pipeline.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: { environment: 'node' },
});
