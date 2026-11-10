'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jindoMenu', {
  options: () => ipcRenderer.invoke('menu:options'),
  ready: (w, h) => ipcRenderer.send('menu:ready', w, h),
  choose: (id) => ipcRenderer.send('menu:choose', id),
});
