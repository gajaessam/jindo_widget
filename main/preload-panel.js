'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED = /^(settings|plan|restore|update|panel):/;
function check(channel) {
  if (!ALLOWED.test(channel)) throw new Error(`허용되지 않은 채널: ${channel}`);
  return channel;
}

contextBridge.exposeInMainWorld('jindo', {
  invoke: (channel, ...args) => ipcRenderer.invoke(check(channel), ...args),
  send: (channel, ...args) => ipcRenderer.send(check(channel), ...args),
  on: (channel, cb) => ipcRenderer.on(check(channel), (_e, ...args) => cb(...args)),
  ready: (height) => ipcRenderer.send('panel:ready', height),
});
