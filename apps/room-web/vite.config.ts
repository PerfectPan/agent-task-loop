import path from 'node:path';
import { vitePlugin as remix } from '@remix-run/dev';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [remix(), tailwindcss()],
  resolve: {
    alias: { '~': path.resolve(__dirname, 'app') },
  },
  server: {
    host: '127.0.0.1',
    port: 3210,
    strictPort: true,
  },
});
