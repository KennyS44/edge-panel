'use strict';

/* The only bridge between the page and the app. Nothing else from Node is
   exposed: the renderer gets these seven calls and nothing more. */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('edge', {
  load: () => ipcRenderer.invoke('state:load'),
  save: (patch) => ipcRenderer.send('state:save', patch),
  setMagnet: (on) => ipcRenderer.send('window:magnet', on),
  setSize: (width, height, opts = {}) =>
    ipcRenderer.send('window:size', { width, height, ...opts }),
  autostart: (value) => ipcRenderer.invoke('app:autostart', value),
  quit: () => ipcRenderer.send('app:quit'),
  onEdge: (cb) => ipcRenderer.on('edge', (_e, edge) => cb(edge)),
});
