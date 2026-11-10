'use strict';
// 백업에서 복원 창

const { ipcMain } = require('electron');
const { openPanel, getPanel } = require('./panel');
const dialogs = require('./dialogs');

const KEY = 'restore';

function createRestoreWindow(app) {
  // app: { ctx, replaceData(newData), closeDataWindows() }
  const { ctx } = app;

  function fromWin(event) {
    const win = getPanel(KEY);
    return win && event.sender === win.webContents ? win : null;
  }

  function open() {
    openPanel(KEY, { file: 'restore.html', width: 540, title: '백업에서 복원' });
  }

  function entries() {
    return ctx.store.listBackups().map((e) => ({
      name: e.name, savedText: e.savedText, beforeRestore: e.beforeRestore,
      classes: e.classes, activities: e.activities, checks: e.checks,
    }));
  }

  ipcMain.handle('restore:list', (event) => (fromWin(event) ? entries() : []));

  ipcMain.handle('restore:run', async (event, name) => {
    const win = fromWin(event);
    if (!win) return false;
    const entry = ctx.store.listBackups().find((e) => e.name === name);
    if (!entry) {
      await dialogs.notify('백업에서 복원', '그 백업을 찾을 수 없어요. 목록을 다시 열어 주세요.', win);
      return false;
    }
    const ok = await dialogs.confirm({
      title: '백업에서 복원',
      message: `${entry.savedText} 상태로 되돌릴까요?\n(${entry.classes}개 반 · 활동 ${entry.activities}개 · 체크 ${entry.checks}개)\n\n지금 상태는 "(복원 직전)"으로 보관돼서, 이 복원도 다시 되돌릴 수 있어요.`,
      yes: '복원하기', parent: win,
    });
    if (!ok) return false;
    try {
      ctx.saver.flush();
      const restored = ctx.store.restore(entry, ctx.data);
      app.replaceData(restored);
    } catch (err) {
      await dialogs.notify('복원하지 못했어요', err.message, win);
      return false;
    }
    win.close();
    await dialogs.notify('백업에서 복원', `${entry.savedText} 상태로 복원했어요.`);
    return true;
  });

  ipcMain.on('restore:close', (event) => {
    const win = fromWin(event);
    if (win) win.close();
  });

  return { open };
}

module.exports = { createRestoreWindow };
