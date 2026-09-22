import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

const MIGRATIONS_DIR = path.resolve(__dirname, 'app/room-lab/infrastructure/migrations');

/**
 * The migration runner reads its SQL with `readFileSync(new URL('./0001_rooms.sql',
 * import.meta.url))`, which Vite leaves alone in the SSR build — so the built
 * server looks for those files next to `build/server/index.js` and finds
 * nothing. This puts them there, keeping the schema as SQL files on disk in the
 * build rather than as strings smuggled into the bundle.
 */
function serverMigrations(): Plugin {
  return {
    name: 'rivus-server-migrations',
    apply: 'build',
    generateBundle() {
      if (this.environment?.name !== 'ssr') return;
      for (const file of readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith('.sql')).sort()) {
        this.emitFile({
          type: 'asset',
          fileName: file,
          source: readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [reactRouter(), tailwindcss(), serverMigrations()],
  resolve: {
    alias: { '~': path.resolve(__dirname, 'app') },
  },
  server: {
    host: '127.0.0.1',
    port: 3210,
    strictPort: true,
  },
});
