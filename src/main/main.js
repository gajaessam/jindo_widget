'use strict';
// 진도 위젯 시작점 (Electron main 프로세스)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain, screen, dialog, globalShortcut, shell } = require('electron');
const autostart = require('./autostart');
const { createUpdater } = require('./updater');

const native = require('./native');
const dialogs = require('./dialogs');
const { popupMenu } = require('./popup-menu');
const { createProgressWindow } = require('./progress-window');
const { createClassSettings } = require('./class-settings');
const { createPlanSettings } = require('./plan-settings');
const { createRestoreWindow } = require('./restore-window');
const { Store, defaultDataDir } = require('../core/storage');
const { completion, cloneData } = require('../core/data');
const { undoPlan } = require('../core/actions');
const { SaveScheduler } = require('../core/save-scheduler');
const { checkImage, MAX_IMAGE_BYTES, sniffImage } = require('../core/image-info');

const TRACK_HEIGHT = 150;
const DATA_DIR = process.env.JINDO_DATA_DIR || defaultDataDir();

app.setAppUserModelId('JindoWidget');

const ctx = {
  store: new Store({ dataDir: DATA_DIR }),
  data: null,
  saver: null,
  track: null,
  imageIssues: new Set(),
  quitting: false,
  undo: null, // 계획 변경 되돌리기용: 변경 직전 상태 (한 번만)
  progress: null,
};

// ── 데이터 바꾸기: 바꾼 뒤 바로 저장하고 화면을 새로 그림 ──
function afterChange() {
  ctx.saver.flush();
  pushTrack();
  if (ctx.progress) ctx.progress.refresh();
}
function commit(fn) {
  fn();
  afterChange();
}
// 계획(차시·활동) 변경은 되돌릴 수 있게 직전 상태를 남겨 둠
function commitPlan(fn) {
  const snapshot = cloneData(ctx.data);
  fn();
  ctx.undo = snapshot;
  afterChange();
}
// 데이터를 통째로 바꿈(백업에서 복원). 열린 창들은 옛 데이터를 보고 있으니 닫습니다.
function replaceData(next) {
  if (ctx.progress) ctx.progress.close();
  if (ctx.classSettings) ctx.classSettings.close();
  if (ctx.planSettings) ctx.planSettings.close();
  ctx.undo = null;
  ctx.data = next;
  pushTrack();
}

function undo() {
  if (!ctx.undo) return;
  undoPlan(ctx.data, ctx.undo);
  ctx.undo = null;
  afterChange();
}

// ── 저장 ──
let saveErrorShown = false;
function setupSaver() {
  ctx.saver = new SaveScheduler({
    save: () => ctx.store.save(ctx.data),
    onStatus: (status) => {
      app.emit('jindo:save-status', status);
      if (ctx.progress) ctx.progress.sendStatus(status);
    },
    onError: (err) => {
      if (saveErrorShown) return;
      saveErrorShown = true;
      dialogs.notify('진도를 저장할 수 없어요', '저장 위치의 권한과 여유 공간을 확인해 주세요.', null, String(err.message || err));
    },
  });
  app.on('jindo:save-status', (status) => {
    if (status === '저장됨') saveErrorShown = false;
  });
}

// ── 트랙 창 ──
// 반 · 캐릭터 설정 창이 열려 있으면 그 미리 보기를 그립니다.
function shownData() {
  return (ctx.previewData && ctx.previewData()) || ctx.data;
}

function trackViewModel() {
  const d = shownData();
  return {
    classes: d.classes.map((cls, idx) => ({
      name: cls.name,
      percent: completion(d, idx),
      imageKey: cls.custom_image || null,
    })),
    scale: d.character_scale,
    float: d.float_motion,
    labels: d.show_progress_labels,
  };
}

function pushTrack() {
  if (ctx.track && !ctx.track.isDestroyed()) ctx.track.webContents.send('track:state', trackViewModel());
}

// 작업표시줄 바로 위. 작업표시줄이 위·옆에 있거나 자동 숨김이면 화면 맨 아래에 놓입니다.
function placeTrack() {
  const win = ctx.track;
  if (!win || win.isDestroyed()) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const bounds = { x: wa.x, y: wa.y + wa.height - TRACK_HEIGHT, width: wa.width, height: TRACK_HEIGHT };
  win.setBounds(bounds);
  native.sendToBottom(win);
}

function createTrack() {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,     // 눌러도 앞으로 나오지 않음
    hasShadow: false,
    alwaysOnTop: false,
    title: '진도 위젯',
    webPreferences: {
      preload: path.join(__dirname, 'preload-track.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  ctx.track = win;
  win.removeMenu();
  win.setIgnoreMouseEvents(true, { forward: true });
  placeTrack();
  win.once('ready-to-show', () => {
    win.showInactive();
    placeTrack();
  });
  win.on('closed', () => { ctx.track = null; });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'track.html'));
}

ipcMain.handle('track:state', () => trackViewModel());

ipcMain.handle('track:image', async (_e, idx) => {
  const cls = shownData().classes[idx];
  if (!cls || !cls.custom_image) return { ok: false };
  try {
    const stat = await fs.promises.stat(cls.custom_image);
    if (stat.size > MAX_IMAGE_BYTES) throw new Error('이미지 파일이 20MB보다 커요.');
    const bytes = await fs.promises.readFile(cls.custom_image);
    const info = sniffImage(bytes.subarray(0, 512 * 1024));
    return { ok: true, bytes, mime: info ? info.mime : 'image/png' };
  } catch (err) {
    noteImageIssue(cls.name, err.code === 'ENOENT' ? '이미지 파일을 찾을 수 없어요.' : err.message);
    return { ok: false };
  }
});

ipcMain.on('track:interactive', (_e, on) => {
  if (ctx.track && !ctx.track.isDestroyed()) ctx.track.setIgnoreMouseEvents(!on, { forward: true });
});

ipcMain.on('track:image-failed', (_e, idx, message) => {
  const cls = ctx.data.classes[idx];
  if (cls) noteImageIssue(cls.name, `이미지를 그리지 못했어요. (${message})`);
});

// 트랙 창 안 좌표 → 화면 좌표
function toScreenRect(r) {
  const b = ctx.track.getBounds();
  return { x: b.x + r.x, y: b.y + r.y, width: r.width, height: r.height };
}

ipcMain.on('track:click', (_e, idx, rect) => {
  if (!ctx.data.classes[idx] || !ctx.track) return;
  ctx.progress.open(idx, toScreenRect(rect));
});

// 사용 설명서: 앱 안의 창으로 엽니다 (PDF 프로그램을 따로 띄우지 않음)
let manualWindow = null;
function openManual() {
  if (manualWindow && !manualWindow.isDestroyed()) {
    if (manualWindow.isMinimized()) manualWindow.restore();
    manualWindow.show();
    manualWindow.focus();
    return;
  }
  manualWindow = new BrowserWindow({
    width: 600,
    height: 780,
    minWidth: 440,
    minHeight: 480,
    show: false,
    title: '진도 위젯 사용 설명서',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#FFF7F0',
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  manualWindow.removeMenu();
  // 설명서 안의 링크로 다른 곳으로 이동하지 않게 막고, 인터넷 주소는 기본 브라우저로
  manualWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  manualWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  manualWindow.once('ready-to-show', () => manualWindow.show());
  manualWindow.on('closed', () => { manualWindow = null; });
  manualWindow.loadFile(path.join(__dirname, '..', '..', 'docs', 'guide', 'index.html'));
}

async function toggleAutostart() {
  if (!autostart.supported()) {
    dialogs.notify('자동 실행', '자동 실행은 설치한 진도 위젯에서만 켜고 끌 수 있어요.\n(지금은 개발용으로 실행 중이에요)');
    return;
  }
  try {
    const on = await autostart.setEnabled(!(await autostart.isEnabled()));
    dialogs.notify('자동 실행', on ? 'Windows에 로그인하면 진도 위젯이 자동으로 켜져요.' : '자동 실행을 껐어요.');
  } catch (err) {
    dialogs.notify('자동 실행', err.message);
  }
}

ipcMain.on('track:context', async () => {
  const autoOn = await autostart.isEnabled().catch(() => false);
  const id = await popupMenu({
    items: [
      { id: 'class-settings', label: '반 · 캐릭터 설정' },
      { id: 'plan-settings', label: '수업 계획 설정' },
      { sep: true },
      { id: 'autostart', label: '자동 실행', type: 'check', checked: autostart.supported() && autoOn },
      { id: 'restore', label: '백업에서 복원' },
      { id: 'update', label: '업데이트 확인' },
      { id: 'manual', label: '사용 설명서' },
      { id: 'about', label: '프로그램 정보' },
      { id: 'quit', label: '전체 종료' },
    ],
  });
  switch (id) {
    case 'class-settings':
      ctx.classSettings.open();
      break;
    case 'plan-settings':
      ctx.planSettings.open();
      break;
    case 'restore':
      ctx.restoreWindow.open();
      break;
    case 'autostart':
      toggleAutostart();
      break;
    case 'update':
      ctx.updater.check(true);
      break;
    case 'manual':
      openManual();
      break;
    case 'about':
      dialogs.notify('프로그램 정보', `진도 위젯\n버전 v${app.getVersion()}\n\nⓒ 가정재연쌤 | 재배포·수정 문의: @gajae_ssam`);
      break;
    case 'quit':
      quitApp();
      break;
    default:
      break;
  }
});

ipcMain.on('track:pick-image', (_e, idx) => chooseImage(idx));

let picking = false;
async function chooseImage(idx) {
  if (picking) return;
  const cls = ctx.data.classes[idx];
  if (!cls) return;
  picking = true;
  try {
    const res = await dialog.showOpenDialog({
      title: `${cls.name} 캐릭터 이미지 선택`,
      properties: ['openFile'],
      filters: [{ name: '이미지 (PNG, JPG, WEBP, BMP, GIF)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
    });
    if (res.canceled || !res.filePaths[0]) return;
    const saved = importCharacter(res.filePaths[0]);
    if (ctx.data.classes[idx] !== cls) return;
    cls.custom_image = saved;
    ctx.saver.flush();
    pushTrack();
  } catch (err) {
    await dialogs.notify('이미지를 쓸 수 없어요', err.message);
  } finally {
    picking = false;
  }
}

// 고른 이미지를 검사하고 데이터 폴더의 characters 로 복사 (기존 버전과 같은 이름 규칙)
function importCharacter(source) {
  const stat = fs.statSync(source);
  const fd = fs.openSync(source, 'r');
  let head;
  try {
    head = Buffer.alloc(Math.min(stat.size, 512 * 1024));
    fs.readSync(fd, head, 0, head.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  checkImage({ name: path.basename(source), byteLength: stat.size, head });
  fs.mkdirSync(ctx.store.characterDir, { recursive: true });
  const dest = path.join(ctx.store.characterDir, `${crypto.randomBytes(4).toString('hex')}_${path.basename(source)}`);
  const temp = `${dest}.tmp`;
  try {
    fs.copyFileSync(source, temp);
    fs.renameSync(temp, dest);
  } finally {
    try { fs.unlinkSync(temp); } catch { /* 없음 */ }
  }
  return dest;
}

// 이미지 문제는 모아서 한 번에 알립니다.
let issueTimer = null;
const pendingIssues = [];
function noteImageIssue(className, message) {
  const key = `${className}: ${message}`;
  if (ctx.imageIssues.has(key)) return;
  ctx.imageIssues.add(key);
  pendingIssues.push(key);
  clearTimeout(issueTimer);
  issueTimer = setTimeout(() => {
    const list = pendingIssues.splice(0).join('\n');
    dialogs.notify('캐릭터 이미지를 불러오지 못했어요', '해당 반은 "+" 자리표시자로 보여요. 눌러서 이미지를 다시 골라 주세요.', null, list);
  }, 800);
}

// ── 시작과 종료 ──
function quitApp() {
  if (ctx.quitting) return;
  ctx.quitting = true;
  if (ctx.saver && ctx.data) ctx.saver.flush();
  app.quit();
}

app.on('before-quit', () => {
  if (!ctx.quitting && ctx.saver && ctx.data) {
    ctx.quitting = true;
    ctx.saver.flush();
  }
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { /* 트랙 창이 없어도 바로 끄지 않음 (quitApp으로만 종료) */ });

async function start() {
  // 두 개가 켜지면 진도가 서로 덮어써지므로 하나만 실행 (옛 Python 버전과도 같은 이름의 뮤텍스)
  // 시작 메뉴의 "사용 설명서"는 --guide 로 실행됨: 이미 켜져 있으면 그쪽에서 설명서 창만 엶
  const wantsGuide = process.argv.includes('--guide');
  if (!app.requestSingleInstanceLock()) {
    if (!wantsGuide) await dialogs.notify('진도 위젯', '진도 위젯이 이미 실행 중이에요.');
    app.exit(0);
    return;
  }
  if (!native.acquireSingleInstance()) {
    await dialogs.notify('진도 위젯', '진도 위젯이 이미 실행 중이에요.');
    app.exit(0);
    return;
  }
  app.on('second-instance', (_e, argv) => {
    if (argv.includes('--guide')) openManual();
  });
  if (wantsGuide) app.whenReady().then(() => setTimeout(openManual, 800));
  const loaded = ctx.store.load();
  ctx.data = loaded.data;
  setupSaver();
  ctx.progress = createProgressWindow({
    ctx,
    commit,
    commitPlan,
    undo,
    saveNow: () => ctx.saver.flush(),
    scheduleSave: () => ctx.saver.schedule(),
    status: () => ctx.saver.status,
  });
  ctx.classSettings = createClassSettings({ ctx, pushTrack, importCharacter, afterChange });
  ctx.planSettings = createPlanSettings({ ctx, commitPlan });
  ctx.restoreWindow = createRestoreWindow({ ctx, replaceData });
  ctx.updater = createUpdater({ quitApp, saveNow: () => ctx.saver.flush() });
  autostart.repair().catch(() => {});
  // 시작하고 잠시 뒤 한 번 업데이트 확인 (새 버전이 있을 때만 알림). 개발 중에는 JINDO_UPDATE_TEST=1 일 때만.
  if (app.isPackaged || process.env.JINDO_UPDATE_TEST) setTimeout(() => ctx.updater.check(false), 15000);
  createTrack();

  screen.on('display-metrics-changed', placeTrack);
  screen.on('display-added', placeTrack);
  screen.on('display-removed', placeTrack);

  // Ctrl+Shift+Q 로 종료 (Caps Lock 상태와 상관없음)
  globalShortcut.register('Control+Shift+Q', quitApp);

  if (loaded.warning) dialogs.notify('저장 파일 안내', loaded.warning);

  // 처음 설치해서 데이터가 없을 때만 한 번 안내. 기본값을 바로 저장해 두어 다음부터는 뜨지 않음.
  if (loaded.isFresh) {
    ctx.saver.flush();
    ctx.track.webContents.once('did-finish-load', () => setTimeout(() => {
      dialogs.showDialog({
        title: '진도 위젯을 시작해요',
        message: '• "+"를 눌러 반마다 캐릭터 그림을 골라 주세요.\n• 캐릭터를 클릭하면 진도창, 오른쪽 클릭하면 메뉴가 열려요.',
        buttons: [{ label: '시작하기', kind: 'primary' }],
      });
    }, 1200));
  }

  // 개발 확인용: JINDO_OPEN_WINDOW=class-settings|plan-settings|restore 이면 시작 후 그 창을 엽니다.
  const devWindow = {
    'class-settings': ctx.classSettings,
    'plan-settings': ctx.planSettings,
    restore: ctx.restoreWindow,
    'update-check': { open: () => ctx.updater.check(true) },
    manual: { open: openManual },
    autostart: { open: toggleAutostart },
  }[process.env.JINDO_OPEN_WINDOW];
  if (devWindow) setTimeout(() => devWindow.open(), 1500);

  // 개발 확인용: JINDO_OPEN_PROGRESS=반번호(0부터) 이면 시작 후 그 반 진도창을 엽니다.
  if (process.env.JINDO_OPEN_PROGRESS !== undefined) {
    const idx = Number(process.env.JINDO_OPEN_PROGRESS) || 0;
    ctx.track.webContents.once('did-finish-load', () => setTimeout(async () => {
      const r = await ctx.track.webContents.executeJavaScript(
        `(() => { const r = chars[${idx}].root.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
      ctx.progress.open(idx, toScreenRect(r));
    }, 1500));
  }
}

app.whenReady().then(start);
