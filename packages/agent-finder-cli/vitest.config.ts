import { defineConfig } from 'vite-plus';

export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'react' },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 10000,
  },
});
