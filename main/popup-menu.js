'use strict';
// 앱 모양에 맞춘 우클릭 메뉴 (Windows 기본 회색 메뉴 대신)

const path = require('path');
const { BrowserWindow, ipcMain, screen } = require('electron');

let current = null; // { win, opts, resolve, point, done }

ipcMain.handle('menu:options', (event) => (current && event.sender === current.win.webContents ? current.opts : { items: [] }));

ipcMain.on('menu:ready', (event, width, height) => {
  if (!current || event.sender !== current.win.webContents) return;
  const { win, point } = current;
  const w = Math.max(160, Math.min(Number(width) || 240, 420));
  const h = Math.max(60, Math.min(Number(height) || 300, 800));
  const wa = screen.getDisplayNearestPoint(point).workArea;
  // 기본은 마우스 위치에서 위쪽으로 (캐릭터가 화면 아래에 있으므로)
  let x = point.x - 14;
  let y = point.y - h + 10;
  if (y < wa.y) y = point.y - 10;
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - w));
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - h));
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
  win.show();
  win.focus();
});

ipcMain.on('menu:choose', (event, id) => {
  if (!current || event.sender !== current.win.webContents) return;
  finish(id);
});

function finish(id) {
  const c = current;
  if (!c || c.done) return;
  c.done = true;
  current = null;
  if (!c.win.isDestroyed()) c.win.close();
  c.resolve(id);
}

// items: [{ id, label, type:'check', checked, disabled, danger } | { sep:true }]
// 결과: 고른 id 또는 null
function popupMenu({ items, heading, point }) {
  if (current) finish(null);
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 260,
      height: 300,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload-menu.js'),
        contextIsolation: true,
        sandbox: true,
        spellcheck: false,
      },
    });
    win.removeMenu();
    current = { win, opts: { items, heading }, resolve, point: point || screen.getCursorScreenPoint(), done: false };
    const mine = current;
    win.on('closed', () => {
      if (current === mine) finish(null);
    });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'menu.html'));
  });
}

module.exports = { popupMenu };
