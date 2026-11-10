'use strict';
// 설정 창들의 공통 틀. 창마다 하나만 열리고, 내용을 다 그린 뒤에야 보여 줍니다(빈 창 방지).

const path = require('path');
const { BrowserWindow, ipcMain, screen } = require('electron');

const panels = new Map(); // key → { win, shown, width }

ipcMain.on('panel:ready', (event, height) => {
  for (const p of panels.values()) {
    if (p.win.isDestroyed() || event.sender !== p.win.webContents) continue;
    const wa = screen.getPrimaryDisplay().workArea;
    const maxH = wa.height - 24;
    const h = Math.max(160, Math.min(Math.ceil(Number(height) || 400), maxH));
    if (!p.shown) {
      p.shown = true;
      const x = Math.round(wa.x + (wa.width - p.width) / 2);
      const y = Math.round(wa.y + Math.max(12, (wa.height - h) / 2 - 40));
      p.win.setBounds({ x, y, width: p.width, height: h });
      if (process.env.JINDO_DEBUG) console.log(`[panel] ${p.win.getTitle()} shown after content ready, height=${h}`);
      p.win.show();
      p.win.focus();
    } else {
      const b = p.win.getBounds();
      const y = Math.min(b.y, wa.y + wa.height - h);
      p.win.setBounds({ x: b.x, y: Math.max(wa.y, y), width: p.width, height: h });
    }
    p.win.webContents.send('panel:max-height', maxH);
    return;
  }
});

// 이미 열려 있으면 앞으로 가져오고 null, 새로 열면 BrowserWindow
function openPanel(key, { file, width = 480, title }) {
  const existing = panels.get(key);
  if (existing && !existing.win.isDestroyed()) {
    if (existing.win.isMinimized()) existing.win.restore();
    existing.win.show();
    existing.win.focus();
    return null;
  }
  const win = new BrowserWindow({
    width,
    height: 400,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title,
    webPreferences: {
      preload: path.join(__dirname, 'preload-panel.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.removeMenu();
  panels.set(key, { win, shown: false, width });
  win.on('closed', () => {
    if (panels.get(key) && panels.get(key).win === win) panels.delete(key);
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', file));
  return win;
}

function getPanel(key) {
  const p = panels.get(key);
  return p && !p.win.isDestroyed() ? p.win : null;
}

module.exports = { openPanel, getPanel };
