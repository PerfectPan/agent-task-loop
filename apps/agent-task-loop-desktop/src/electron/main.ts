import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfiguredLocalServer } from '../server/configured.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let serverClose: (() => Promise<void>) | null = null;

async function startServer(): Promise<{ baseUrl: string; token: string }> {
  const server = await createConfiguredLocalServer();
  const info = await server.listen(0);
  serverClose = () => server.close();
  const baseUrl = `http://${info.host}:${info.port}`;
  return { baseUrl, token: info.token };
}

function createWindow(baseUrl: string): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: 'ATL Console',
    backgroundColor: '#f4f1ea',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Bust any cached HTML from previous runs.
  void mainWindow.loadURL(`${baseUrl}/?v=${Date.now()}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
    if (process.platform === 'darwin') {
      app.dock?.show();
      app.focus({ steal: true });
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.on('open-external', (_event, url: unknown) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    void shell.openExternal(url);
  }
});

app.whenReady().then(async () => {
  try {
    const { baseUrl } = await startServer();
    createWindow(baseUrl);
  } catch (error) {
    console.error('Failed to start desktop console:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  void serverClose?.();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void startServer().then(({ baseUrl }) => createWindow(baseUrl));
  } else {
    mainWindow?.show();
    mainWindow?.focus();
  }
});

app.on('before-quit', () => {
  void serverClose?.();
});
