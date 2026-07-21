const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atlDesktop', {
  getConfig: () => {
    return globalThis.__ATL_CONFIG__ ?? null;
  },
  openExternal: url => {
    if (/^https?:\/\//i.test(String(url))) {
      ipcRenderer.send('open-external', url);
    }
  },
});
