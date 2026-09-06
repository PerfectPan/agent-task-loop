import { vitePlugin as remix } from '@remix-run/dev';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [remix(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 3210,
    strictPort: true,
  },
});
