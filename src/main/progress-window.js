'use strict';
// 진도창: 캐릭터를 왼쪽 클릭하면 그 캐릭터 위에 뜨는 말풍선 창

const path = require('path');
const { BrowserWindow, ipcMain, screen } = require('electron');
const A = require('../core/actions');
const { completion, lessonCompletion } = require('../core/data');
const dialogs = require('./dialogs');

const WIDTH = 384; // 카드 352 + 양옆 그림자 여백

function createProgressWindow(app) {
  // app: { ctx, commit(fn), commitPlan(fn), undo(), saveNow(), scheduleSave(), status() }
  const { ctx } = app;
  let win = null;
  let classIdx = -1;
  let anchor = null; // { bottom, centerX }
  let shown = false;
  let busy = false;

  function isOpen() {
    return Boolean(win && !win.isDestroyed());
  }

  function view() {
    const d = ctx.data;
    const li = A.currentLesson(d, classIdx);
    const lesson = d.plan[li];
    const marks = d.classes[classIdx].progress[li];
    const lc = lessonCompletion(d, classIdx, li);
    const wa = screen.getDisplayNearestPoint({ x: Math.round(anchor.centerX), y: Math.round(anchor.bottom) }).workArea;
    return {
      classIdx,
      className: d.classes[classIdx].name,
      lessonIdx: li,
      lessonCount: d.plan.length,
      lessonName: lesson.name,
      items: lesson.items.map((item, i) => ({ text: item.text, done: Boolean(marks[i]) })),
      done: lc.done,
      total: lc.total,
      percent: lc.percent,
      overall: completion(d, classIdx),
      memo: d.classes[classIdx].memo,
      canUndo: Boolean(ctx.undo),
      status: app.status(),
      maxHeight: Math.max(320, Math.floor(anchor.bottom - wa.y - 4)),
    };
  }

  function refresh() {
    if (!isOpen()) return;
    if (classIdx >= ctx.data.classes.length) { close(); return; }
    win.webContents.send('progress:view', view());
  }

  function sendStatus(status) {
    if (isOpen()) win.webContents.send('progress:status', status);
  }

  // 말풍선 위치: 캐릭터 바로 위, 꼬리가 캐릭터를 가리키도록
  function place(height) {
    const wa = screen.getDisplayNearestPoint({ x: Math.round(anchor.centerX), y: Math.round(anchor.bottom) }).workArea;
    const h = Math.max(200, Math.min(Math.round(height), Math.floor(anchor.bottom - wa.y)));
    let x = Math.round(anchor.centerX - WIDTH / 2);
    x = Math.max(wa.x, Math.min(x, wa.x + wa.width - WIDTH));
    const y = Math.round(anchor.bottom - h);
    win.setBounds({ x, y: Math.max(wa.y, y), width: WIDTH, height: h });
    win.webContents.send('progress:tail', Math.round(anchor.centerX - x));
  }

  function create() {
    win = new BrowserWindow({
      width: WIDTH,
      height: 480,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      title: '진도창',
      webPreferences: {
        preload: path.join(__dirname, 'preload-progress.js'),
        contextIsolation: true,
        sandbox: true,
        spellcheck: false,
      },
    });
    win.removeMenu();
    shown = false;
    win.on('closed', () => {
      win = null;
      classIdx = -1;
    });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'progress.html'));
  }

  // rect: 화면 좌표의 캐릭터(이름표 포함) 영역
  function open(idx, rect) {
    if (isOpen() && idx === classIdx) { close(); return; } // 같은 캐릭터를 다시 누르면 닫기
    app.saveNow(); // 다른 반을 열 때 메모 등은 바로 저장
    classIdx = idx;
    anchor = { bottom: rect.y - 2, centerX: rect.x + rect.width / 2 };
    if (!isOpen()) create();
    else refresh();
    if (shown) win.focus();
  }

  function close() {
    if (!isOpen()) return;
    app.saveNow();
    win.close();
  }

  function fromWin(event) {
    return isOpen() && event.sender === win.webContents;
  }

  ipcMain.handle('progress:get', (event) => (fromWin(event) ? view() : null));

  ipcMain.on('progress:ready', (event, height) => {
    if (!fromWin(event)) return;
    place(height);
    if (!shown) {
      shown = true;
      win.show();
      win.focus();
    }
  });

  ipcMain.on('progress:memo', (event, text) => {
    if (!fromWin(event)) return;
    A.setMemo(ctx.data, classIdx, text);
    app.scheduleSave();
  });

  ipcMain.on('progress:memo-flush', (event) => {
    if (fromWin(event)) app.saveNow();
  });

  ipcMain.on('progress:action', async (event, name, arg = {}) => {
    if (!fromWin(event) || busy) return;
    const d = ctx.data;
    const ci = classIdx;
    const li = A.currentLesson(d, ci);
    busy = true;
    try {
      switch (name) {
        case 'close':
          close();
          break;
        case 'toggle':
          app.commit(() => A.toggleItem(ctx.data, ci, li, arg.item));
          break;
        case 'lesson':
          app.commit(() => A.setLesson(ctx.data, ci, li + (arg.delta > 0 ? 1 : -1)));
          break;
        case 'addItem': {
          const text = await dialogs.prompt({ title: '활동 추가', message: `${d.plan[li].name}에 넣을 활동이에요. 모든 반에 함께 생겨요.`, label: '활동 이름', ok: '추가하기', parent: win });
          if (text !== null && ctx.data === d) app.commitPlan(() => A.addItem(ctx.data, li, text));
          break;
        }
        case 'editItem': {
          const item = d.plan[li].items[arg.item];
          if (!item) break;
          const text = await dialogs.prompt({ title: '활동 수정', label: '활동 이름', value: item.text, parent: win });
          if (text !== null && ctx.data === d && d.plan[li].items[arg.item] === item) app.commitPlan(() => A.editItem(ctx.data, li, arg.item, text));
          break;
        }
        case 'moveItem':
          app.commitPlan(() => A.moveItem(ctx.data, li, arg.item, arg.delta > 0 ? 1 : -1));
          break;
        case 'deleteItem':
          app.commitPlan(() => A.deleteItem(ctx.data, li, arg.item));
          break;
        case 'addLesson': {
          const text = await dialogs.prompt({ title: '차시 추가', message: '새 차시는 모든 반에 함께 생겨요.', label: '차시 이름', value: `${d.plan.length + 1}차시`, ok: '추가하기', parent: win });
          if (text !== null && ctx.data === d) {
            app.commitPlan(() => {
              const nli = A.addLesson(ctx.data, text);
              A.setLesson(ctx.data, ci, nli);
            });
          }
          break;
        }
        case 'renameLesson': {
          const text = await dialogs.prompt({ title: '차시 이름 수정', label: '차시 이름', value: d.plan[li].name, parent: win });
          if (text !== null && ctx.data === d) app.commitPlan(() => A.renameLesson(ctx.data, li, text));
          break;
        }
        case 'deleteLesson': {
          if (d.plan.length <= 1) break;
          const ok = await dialogs.confirm({
            title: '차시 삭제',
            message: `"${d.plan[li].name}"을(를) 지울까요?\n이 차시의 활동과 모든 반의 체크가 함께 지워져요.\n지운 뒤 진도창의 되돌리기로 한 번 되살릴 수 있어요.`,
            yes: '삭제', danger: true, parent: win,
          });
          if (ok && ctx.data === d) app.commitPlan(() => A.deleteLesson(ctx.data, li));
          break;
        }
        case 'undo':
          app.undo();
          break;
        default:
          break;
      }
    } catch (err) {
      dialogs.notify('진도창', err.message, isOpen() ? win : null);
    } finally {
      busy = false;
    }
  });

  return { open, close, refresh, sendStatus, isOpen, get classIdx() { return classIdx; }, get window() { return win; } };
}

module.exports = { createProgressWindow };
