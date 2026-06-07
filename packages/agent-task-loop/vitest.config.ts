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
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
