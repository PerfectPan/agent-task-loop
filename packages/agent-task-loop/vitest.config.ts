import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/tui/setup.ts'],
    // Force ink/chalk to emit ANSI even on non-TTY CI runners, so colour-styling
    // assertions (e.g. the active tab) are deterministic across environments.
    env: { FORCE_COLOR: '3' },
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
