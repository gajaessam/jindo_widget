'use strict';
// 수업 계획 설정 창: 모든 반이 함께 쓰는 차시·활동을 한꺼번에 고치고 "저장"으로 적용

const { ipcMain } = require('electron');
const { openPanel, getPanel } = require('./panel');
const dialogs = require('./dialogs');
const { cloneData } = require('../core/data');
const { planChangedSince, applyEditedPlan, cleanPlan } = require('../core/plan-merge');

const KEY = 'plan-settings';

function createPlanSettings(app) {
  // app: { ctx, commitPlan }
  const { ctx } = app;
  let opened = null;

  function fromWin(event) {
    const win = getPanel(KEY);
    return win && event.sender === win.webContents ? win : null;
  }

  function open() {
    const win = openPanel(KEY, { file: 'plan.html', width: 580, title: '수업 계획 설정' });
    if (!win) return;
    opened = cloneData(ctx.data.plan);
    win.on('closed', () => { opened = null; });
  }

  function close() {
    const win = getPanel(KEY);
    if (win) win.close();
  }

  ipcMain.handle('plan:get', (event) => (fromWin(event) && opened ? cloneData(opened) : null));

  ipcMain.handle('plan:confirm', async (event, opts) => {
    const win = fromWin(event);
    if (!win) return false;
    return dialogs.confirm({ ...opts, parent: win });
  });

  ipcMain.handle('plan:save', async (event, edited) => {
    const win = fromWin(event);
    if (!win || !opened) return false;
    let plan;
    try {
      plan = cleanPlan(edited);
    } catch (err) {
      await dialogs.notify('수업 계획 설정', err.message, win);
      return false;
    }
    if (planChangedSince(opened, ctx.data.plan)) {
      const ok = await dialogs.confirm({
        title: '수업 계획 저장',
        message: '이 창을 연 뒤 진도창에서 차시나 활동이 바뀌었어요.\n이 창의 계획으로 덮어쓸까요?\n(체크한 내용은 활동을 따라 그대로 남아요)',
        yes: '덮어쓰기', parent: win,
      });
      if (!ok || !opened) return false;
    }
    app.commitPlan(() => {
      const out = applyEditedPlan(ctx.data, plan);
      ctx.data.plan = out.plan;
      ctx.data.lesson = out.lesson;
      ctx.data.classes.forEach((cls, i) => { cls.progress = out.classes[i].progress; });
    });
    opened = null;
    win.close();
    return true;
  });

  ipcMain.on('plan:close', (event) => {
    if (fromWin(event)) close();
  });

  return { open, close };
}

module.exports = { createPlanSettings };
