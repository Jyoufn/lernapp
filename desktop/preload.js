// Brücke für die Seite: „du läufst in der Mac-App“ + Glas-Ton an macOS weitergeben
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lernappDesktop', {
  platform: process.platform,
  glass: true,
  version: '1.0.0',
  setTheme: (tone) => ipcRenderer.send('lernapp:theme', String(tone || '')),
});
