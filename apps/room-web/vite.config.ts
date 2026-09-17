import path from 'node:path';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [reactRouter(), tailwindcss()],
  resolve: {
    alias: { '~': path.resolve(__dirname, 'app') },
  },
  server: {
    host: '127.0.0.1',
    port: 3210,
    strictPort: true,
  },
});
