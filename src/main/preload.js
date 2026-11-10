const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),
  refresh: () => ipcRenderer.invoke('meals:refresh'),
  searchSchools: (name, region) => ipcRenderer.invoke('schools:search', name, region),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  getCharacters: () => ipcRenderer.invoke('characters:get'),
  pickCharacter: (mood) => ipcRenderer.invoke('characters:pick', mood),
  removeCharacter: (mood) => ipcRenderer.invoke('characters:remove', mood),
  openSettings: () => ipcRenderer.send('settings:open'),
  openHelp: () => ipcRenderer.send('help:open'),
  checkUpdate: () => ipcRenderer.send('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),
  openWidgetMenu: () => ipcRenderer.send('widget:menu'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('widget:ignore-mouse', ignore),
  setWidgetHeight: (height) => ipcRenderer.send('widget:height', height),
  dragStart: () => ipcRenderer.send('widget:drag-start'),
  dragMove: (dx, dy) => ipcRenderer.send('widget:drag-move', dx, dy),
  dragEnd: () => ipcRenderer.send('widget:drag-end'),
  onStateChanged: (listener) => ipcRenderer.on('state:changed', (_event, state) => listener(state)),
  onHello: (listener) => ipcRenderer.on('widget:hello', () => listener()),
  onCharactersChanged: (listener) => ipcRenderer.on('characters:changed', (_event, images) => listener(images)),
});
