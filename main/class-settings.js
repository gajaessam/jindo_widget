'use strict';
// 반 · 캐릭터 설정 창 (바꾸는 동안 바탕 화면에 미리 보여 주고, 저장해야 확정)

const fs = require('fs');
const { ipcMain, dialog } = require('electron');
const { openPanel, getPanel } = require('./panel');
const dialogs = require('./dialogs');
const { draftFromData, applyClassSettings, resizeDraft, clampScale } = require('../core/class-settings');
const { sniffImage, MAX_IMAGE_BYTES } = require('../core/image-info');

const KEY = 'class-settings';

function createClassSettings(app) {
  // app: { ctx, pushTrack, importCharacter, afterChange }
  const { ctx } = app;
  let draft = null;
  let original = null;

  ctx.previewData = () => (draft ? applyClassSettings(ctx.data, draft) : null);

  function fromWin(event) {
    const win = getPanel(KEY);
    return win && event.sender === win.webContents ? win : null;
  }

  function open() {
    const win = openPanel(KEY, { file: 'settings.html', width: 540, title: '반 · 캐릭터 설정' });
    if (!win) return;
    original = draftFromData(ctx.data);
    draft = JSON.parse(JSON.stringify(original));
    win.on('closed', () => {
      draft = null;
      original = null;
      app.pushTrack(); // "닫기"면 원래대로
    });
  }

  function close() {
    const win = getPanel(KEY);
    if (win) win.close();
  }

  ipcMain.handle('settings:get', (event) => (fromWin(event) && draft ? draft : null));

  ipcMain.handle('settings:update', (event, patch) => {
    if (!fromWin(event) || !draft) return null;
    if ('count' in patch) draft = resizeDraft(draft, patch.count, original);
    if ('scale' in patch) draft.scale = clampScale(patch.scale);
    if ('float' in patch) draft.float = Boolean(patch.float);
    if ('labels' in patch) draft.labels = Boolean(patch.labels);
    if ('name' in patch && draft.classes[patch.index]) draft.classes[patch.index].name = String(patch.name).slice(0, 40);
    if ('clearImage' in patch && draft.classes[patch.index]) draft.classes[patch.index].custom_image = null;
    app.pushTrack();
    return draft;
  });

  ipcMain.handle('settings:pick-image', async (event, index) => {
    const win = fromWin(event);
    if (!win || !draft || !draft.classes[index]) return null;
    const res = await dialog.showOpenDialog(win, {
      title: `${draft.classes[index].name} 캐릭터 이미지 선택`,
      properties: ['openFile'],
      filters: [{ name: '이미지 (PNG, JPG, WEBP, BMP, GIF)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
    });
    if (res.canceled || !res.filePaths[0] || !draft) return draft;
    try {
      const saved = app.importCharacter(res.filePaths[0]);
      draft.classes[index].custom_image = saved;
      app.pushTrack();
    } catch (err) {
      await dialogs.notify('이미지를 쓸 수 없어요', err.message, win);
    }
    return draft;
  });

  // 미리 보기 그림: 지금 초안이나 원래 설정에 있는 파일만 읽어 줍니다.
  ipcMain.handle('settings:image', async (event, file) => {
    if (!fromWin(event) || !draft || !file) return null;
    const known = [...draft.classes, ...(original ? original.classes : [])].some((c) => c.custom_image === file);
    if (!known) return null;
    try {
      const stat = await fs.promises.stat(file);
      if (stat.size > MAX_IMAGE_BYTES) return null;
      const bytes = await fs.promises.readFile(file);
      const info = sniffImage(bytes.subarray(0, 512 * 1024));
      return { bytes, mime: info ? info.mime : 'image/png' };
    } catch {
      return null;
    }
  });

  ipcMain.handle('settings:save', async (event) => {
    const win = fromWin(event);
    if (!win || !draft) return false;
    const removed = ctx.data.classes.length - draft.count;
    if (removed > 0) {
      const names = ctx.data.classes.slice(draft.count).map((c) => c.name).join(', ');
      const ok = await dialogs.confirm({
        title: '반 줄이기',
        message: `마지막 ${removed}개 반(${names})의 진도와 메모가 삭제돼요.\n계속할까요?`,
        yes: '삭제하고 저장', danger: true, parent: win,
      });
      if (!ok || !draft) return false;
    }
    const out = applyClassSettings(ctx.data, draft);
    if (out.classes.length !== ctx.data.classes.length) ctx.undo = null; // 되돌리기는 반 수가 같을 때만
    ctx.data.classes = out.classes;
    ctx.data.lesson = out.lesson;
    ctx.data.character_scale = out.character_scale;
    ctx.data.float_motion = out.float_motion;
    ctx.data.show_progress_labels = out.show_progress_labels;
    draft = null;
    if (ctx.progress && ctx.progress.classIdx >= ctx.data.classes.length) ctx.progress.close();
    app.afterChange();
    win.close();
    return true;
  });

  ipcMain.on('settings:close', (event) => {
    if (fromWin(event)) close();
  });

  return { open, close, isOpen: () => Boolean(getPanel(KEY)) };
}

module.exports = { createClassSettings };
