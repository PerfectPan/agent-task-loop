import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script: exposes a minimal, allowlisted API to the renderer.
 *
 * Security defaults:
 * - contextIsolation: true (set in main.ts)
 * - nodeIntegration: false (set in main.ts)
 * - sandbox: true (set in main.ts)
 *
 * The renderer only receives the loopback base URL and session token.
 * It never receives backend credentials, config, or machine paths.
 */
contextBridge.exposeInMainWorld('atlDesktop', {
  getConfig: (): { baseUrl: string; token: string } | null => {
    return (window as unknown as { __ATL_CONFIG__?: { baseUrl: string; token: string } }).__ATL_CONFIG__ ?? null;
  },
  openExternal: (url: string): void => {
    if (/^https?:\/\//i.test(url)) {
      ipcRenderer.send('open-external', url);
    }
  },
});
