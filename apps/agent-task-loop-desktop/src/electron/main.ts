import { app, BrowserWindow, shell } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfiguredLocalServer } from '../server/configured.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let serverUrl: string | null = null;

async function startServer(): Promise<{ baseUrl: string; token: string }> {
  const server = await createConfiguredLocalServer();
  const info = await server.listen(0);
  serverUrl = `http://${info.host}:${info.port}`;
  return { baseUrl: serverUrl, token: info.token };
}

function createWindow(baseUrl: string, _token: string): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'ATL Console',
    backgroundColor: '#08090b',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load the UI from the local server (same-origin with the API).
  // The server injects window.__ATL_CONFIG__ into the HTML.
  mainWindow.loadURL(baseUrl);

  // Open external links (http/https only) in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    const { baseUrl, token } = await startServer();
    createWindow(baseUrl, token);
  } catch (error) {
    console.error('Failed to start desktop console:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // On macOS, applications stay active until the user quits explicitly.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverUrl) {
    // Re-create window if dock icon is clicked and no windows are open.
    // Token is loaded from the state file on next start.
  }
});
