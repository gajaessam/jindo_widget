'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jindoTrack', {
  getState: () => ipcRenderer.invoke('track:state'),
  getImage: (idx) => ipcRenderer.invoke('track:image', idx),
  onState: (cb) => ipcRenderer.on('track:state', (_e, state) => cb(state)),
  setInteractive: (on) => ipcRenderer.send('track:interactive', Boolean(on)),
  click: (idx, rect) => ipcRenderer.send('track:click', idx, rect),
  context: (idx, rect) => ipcRenderer.send('track:context', idx, rect),
  pickImage: (idx) => ipcRenderer.send('track:pick-image', idx),
  imageFailed: (idx, message) => ipcRenderer.send('track:image-failed', idx, message),
});
