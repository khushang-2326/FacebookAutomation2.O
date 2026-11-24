const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,
  sendNotification: (title, body) => {
    new Notification(title, { body });
  },
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  setFullscreen: (flag) => ipcRenderer.invoke('window:set-fullscreen', flag),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  getDisplays: () => ipcRenderer.invoke('window:get-displays'),
  castToDisplay: (payload) => ipcRenderer.invoke('window:cast-to-display', payload),
  closeProjector: () => ipcRenderer.invoke('window:close-projector'),
  isProjectorActive: () => ipcRenderer.invoke('window:is-projector-active')
});
