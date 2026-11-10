'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jindoProgress', {
  get: () => ipcRenderer.invoke('progress:get'),
  onView: (cb) => ipcRenderer.on('progress:view', (_e, v) => cb(v)),
  onStatus: (cb) => ipcRenderer.on('progress:status', (_e, s) => cb(s)),
  onTail: (cb) => ipcRenderer.on('progress:tail', (_e, x) => cb(x)),
  ready: (height) => ipcRenderer.send('progress:ready', height),
  action: (name, arg) => ipcRenderer.send('progress:action', name, arg),
  memo: (text) => ipcRenderer.send('progress:memo', text),
  memoFlush: () => ipcRenderer.send('progress:memo-flush'),
});
