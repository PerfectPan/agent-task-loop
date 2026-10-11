import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: { index: 'src/index.ts', acp: 'src/acp.ts' },
    format: 'esm',
    dts: true,
    platform: 'node',
    fixedExtension: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
