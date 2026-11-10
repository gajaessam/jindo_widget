'use strict';
// 앱 디자인에 맞춘 알림·확인·입력 창 (Windows 기본 회색 창 대신)

const path = require('path');
const { BrowserWindow, ipcMain, screen } = require('electron');

const WIDTH = 420;
const open = new Map(); // webContents.id → { opts, resolve, win }

ipcMain.handle('dialog:options', (event) => {
  const entry = open.get(event.sender.id);
  return entry ? entry.opts : {};
});

ipcMain.on('dialog:ready', (event, height) => {
  const entry = open.get(event.sender.id);
  if (!entry || entry.win.isDestroyed()) return;
  const h = Math.max(120, Math.min(Number(height) || 200, 700));
  entry.win.setContentSize(WIDTH, h);
  if (!entry.shown) {
    entry.shown = true;
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const parent = entry.parent;
    let x = Math.round(area.x + (area.width - WIDTH) / 2);
    let y = Math.round(area.y + (area.height - h) / 2);
    if (parent && !parent.isDestroyed() && parent.isVisible()) {
      const b = parent.getBounds();
      x = Math.round(b.x + (b.width - WIDTH) / 2);
      y = Math.round(b.y + Math.min(80, Math.max(0, (b.height - h) / 2)));
    }
    x = Math.max(area.x, Math.min(x, area.x + area.width - WIDTH));
    y = Math.max(area.y, Math.min(y, area.y + area.height - h));
    entry.win.setPosition(x, y);
    entry.win.show();
    entry.win.focus();
  }
});

ipcMain.on('dialog:result', (event, res) => {
  const entry = open.get(event.sender.id);
  if (!entry) return;
  entry.result = res;
  if (!entry.win.isDestroyed()) entry.win.close();
});

// opts: { title, message, detail, buttons:[{label, kind:'primary'|'danger'|'ghost'}], cancelIndex, input:{label,value,placeholder}, parent }
// 결과: { index, value } (닫기·Esc는 cancelIndex, 기본 -1)
function showDialog(opts) {
  return new Promise((resolve) => {
    const parent = opts.parent && !opts.parent.isDestroyed() ? opts.parent : null;
    const win = new BrowserWindow({
      width: WIDTH,
      height: 200,
      useContentSize: true,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: !parent ? false : true,
      alwaysOnTop: !parent,
      parent: parent || undefined,
      modal: false,
      title: opts.title || '진도 위젯',
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload-dialog.js'),
        contextIsolation: true,
        sandbox: true,
        spellcheck: false,
      },
    });
    win.removeMenu();
    const { parent: _p, ...plain } = opts;
    const entry = { opts: plain, parent, win, shown: false, result: null };
    open.set(win.webContents.id, entry);
    const id = win.webContents.id;
    win.on('closed', () => {
      open.delete(id);
      const res = entry.result || { index: Number.isInteger(opts.cancelIndex) ? opts.cancelIndex : -1, value: null };
      resolve(res);
    });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'dialog.html'));
  });
}

// 짧은 안내
async function notify(title, message, parent, detail) {
  await showDialog({ title, message, detail, parent, buttons: [{ label: '확인', kind: 'primary' }] });
}

// 예/아니요 확인 → true/false
async function confirm({ title, message, yes = '확인', no = '취소', danger = false, parent, detail }) {
  const res = await showDialog({
    title, message, detail, parent, cancelIndex: 0,
    buttons: [{ label: no, kind: 'ghost' }, { label: yes, kind: danger ? 'danger' : 'primary' }],
  });
  return res.index === 1;
}

// 글 입력 → 문자열 또는 null(취소)
async function prompt({ title, message, label, value = '', placeholder = '', ok = '저장', parent }) {
  const res = await showDialog({
    title, message, parent, cancelIndex: 0,
    input: { label, value, placeholder },
    buttons: [{ label: '취소', kind: 'ghost' }, { label: ok, kind: 'primary' }],
  });
  return res.index === 1 ? res.value : null;
}

module.exports = { showDialog, notify, confirm, prompt };
