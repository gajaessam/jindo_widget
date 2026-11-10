'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jindoDialog', {
  options: () => ipcRenderer.invoke('dialog:options'),
  ready: (height) => ipcRenderer.send('dialog:ready', height),
  result: (res) => ipcRenderer.send('dialog:result', res),
});
