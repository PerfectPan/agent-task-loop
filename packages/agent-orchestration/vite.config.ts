import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: { index: 'src/index.ts', acp: 'src/acp.ts' },
    format: 'esm',
    dts: true,
    platform: 'node',
    splitting: true,
    fixedExtension: false,
  },
});
