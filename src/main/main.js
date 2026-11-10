const {
  app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage, screen, net, powerMonitor, Notification,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createStore } = require('./store.js');
const { createNeisClient } = require('./neis.js');
const { ymd, addDays } = require('../shared/logic.js');
const { version: APP_VERSION } = require('../../package.json');

const WIDGET_WIDTH = 320;
const WIDGET_MIN_HEIGHT = 100;
const FETCH_DAYS = 7;
const SCHEDULE_DAYS = 14;
const KEEP_PAST_DAYS = 7;
const REFRESH_INTERVAL = 6 * 60 * 60 * 1000;
const APP_ID = 'app.geupsikalimi.widget';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MOODS = ['default', 'happy', 'sad', 'sleepy'];
const IMAGE_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
};

let store;
let widget = null;
let settingsWindow = null;
let helpWindow = null;
let updateWindow = null;
let tray = null;
let dragOrigin = null;
let refreshing = null;
let lastError = null;
let update = null; // 내려받기를 마친 새 버전 { version, notes }
let updater = null;
// 업데이트 진행 상태. state: idle, checking, downloading, latest, ready, error, dev(개발 실행)
let updateStatus = { state: app.isPackaged ? 'idle' : 'dev' };

const charactersDir = () => path.join(app.getPath('userData'), 'characters');
const schoolKey = (school) => (school ? `${school.region}-${school.code}` : null);
const widgetWidth = () => Math.round(WIDGET_WIDTH * store.getSettings().scale);

function currentState() {
  const cache = store.readCache();
  const settings = store.getSettings();
  const matches = cache.schoolKey === schoolKey(settings.school);
  return {
    settings,
    meals: matches ? cache.meals : {},
    schedule: matches ? cache.schedule || {} : {},
    updatedAt: matches ? cache.updatedAt : null,
    error: lastError,
    loading: Boolean(refreshing),
    isPackaged: app.isPackaged,
    version: APP_VERSION,
    update,
    updateStatus,
  };
}

function broadcast(channel, payload) {
  for (const win of [widget, settingsWindow, updateWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

// 학사일정은 자주 바뀌지 않으므로 하루 한 번만 받는다. 실패해도 식단 표시에는 영향을 주지 않는다.
async function refreshSchedule(client, school, isCurrentSchool) {
  const today = ymd(new Date());
  if (store.readCache().scheduleDay === today) return;
  try {
    const schedule = await client.fetchSchedule(school, new Date(), SCHEDULE_DAYS);
    if (isCurrentSchool()) store.writeCache({ ...store.readCache(), schedule, scheduleDay: today });
  } catch (error) {
    console.error('학사일정 갱신 실패:', error);
  }
}

function refreshMeals() {
  const { school } = store.getSettings();
  if (!school) return Promise.resolve();
  if (refreshing) return refreshing;
  const key = schoolKey(school);
  // 받는 도중 학교가 바뀌면 이전 학교의 결과는 버리고 새 학교 식단을 받는다.
  const isCurrentSchool = () => schoolKey(store.getSettings().school) === key;
  const run = async () => {
    try {
      const client = createNeisClient({ fetch: net.fetch });
      const fresh = await client.fetchMeals(school, new Date(), FETCH_DAYS);
      if (isCurrentSchool()) {
        const cache = store.readCache();
        const oldest = ymd(addDays(new Date(), -KEEP_PAST_DAYS));
        const kept = cache.schoolKey === key
          ? Object.fromEntries(Object.entries(cache.meals).filter(([date]) => date >= oldest))
          : {};
        store.writeCache({
          ...(cache.schoolKey === key ? cache : {}),
          schoolKey: key,
          meals: { ...kept, ...fresh },
          updatedAt: Date.now(),
        });
        lastError = null;
        broadcast('state:changed', currentState());
        await refreshSchedule(client, school, isCurrentSchool);
      }
    } catch (error) {
      console.error('식단 갱신 실패:', error);
      if (isCurrentSchool()) lastError = error.message || '식단을 불러오지 못했어요.';
    } finally {
      refreshing = null;
      if (isCurrentSchool()) broadcast('state:changed', currentState());
      else refreshMeals();
    }
  };
  refreshing = run();
  broadcast('state:changed', currentState());
  return refreshing;
}

function applyWindowSettings(settings) {
  if (widget) {
    widget.setAlwaysOnTop(settings.alwaysOnTop);
    widget.setOpacity(settings.opacity);
    const bounds = widget.getBounds();
    const width = widgetWidth();
    if (bounds.width !== width) {
      // 캐릭터의 가운데가 제자리에 있도록 양쪽으로 넓힌다.
      const x = bounds.x + Math.round((bounds.width - width) / 2);
      widget.setBounds({ ...bounds, ...clampToScreen(x, bounds.y, width, bounds.height), width });
      savePosition();
    }
  }
  // 개발 실행에서는 시작 프로그램에 등록하지 않는다.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.autoStart });
}

function clampToScreen(x, y, width, height) {
  const area = screen.getDisplayNearestPoint({ x, y }).workArea;
  return {
    x: Math.min(Math.max(x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(y, area.y), area.y + area.height - height),
  };
}

// 창 높이는 말풍선에 따라 달라지므로 가장 작은 높이일 때의 위치로 저장한다.
// 다음 실행 때 같은 높이에서 시작해 아래쪽을 기준으로 커지면 캐릭터가 제자리에 온다.
function savePosition() {
  const { x, y, height } = widget.getBounds();
  store.updateSettings({ position: { x, y: y + height - WIDGET_MIN_HEIGHT } });
}

function initialPosition() {
  const { position } = store.getSettings();
  const width = widgetWidth();
  if (position) return clampToScreen(position.x, position.y, width, WIDGET_MIN_HEIGHT);
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: area.x + area.width - width - 16,
    y: area.y + area.height - WIDGET_MIN_HEIGHT - 16,
  };
}

function lockNavigation(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
}

const webPreferences = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
};

function createWidget() {
  const settings = store.getSettings();
  widget = new BrowserWindow({
    ...initialPosition(),
    width: widgetWidth(),
    height: WIDGET_MIN_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: settings.alwaysOnTop,
    webPreferences,
  });
  lockNavigation(widget);
  widget.setOpacity(settings.opacity);
  widget.setIgnoreMouseEvents(true, { forward: true });
  widget.once('ready-to-show', () => widget.showInactive());
  widget.on('closed', () => { widget = null; });
  widget.loadFile(path.join(__dirname, '..', 'renderer', 'widget.html'));
}

function openSettings() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 440,
    minHeight: 480,
    title: '급식알리미 설정',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#fff8ea',
    webPreferences,
  });
  settingsWindow.removeMenu();
  lockNavigation(settingsWindow);
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
}

// 릴리스 메모(HTML 또는 마크다운)를 줄 단위의 짧은 글로 바꾼다.
function noteLines(notes, max) {
  const raw = Array.isArray(notes) ? notes.map((item) => item.note || '').join('\n') : String(notes || '');
  return raw
    .replace(/<\/?(p|li|br|h\d|ul|ol)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n')
    .map((line) => line.replace(/^[\s*•#-]+/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean)
    .slice(0, max);
}

// 위젯 말풍선에 보여줄 한 줄 요약
function plainNotes(notes) {
  return noteLines(notes, 3).join(' · ').slice(0, 120);
}

function setUpdateStatus(next) {
  updateStatus = { ...next, at: Date.now() };
  broadcast('state:changed', currentState());
}

function checkUpdate() {
  if (!updater) {
    setUpdateStatus({ state: 'dev' });
    return;
  }
  if (['checking', 'downloading', 'ready'].includes(updateStatus.state)) return;
  updater.checkForUpdates().catch((error) => {
    console.error('업데이트 확인 실패:', error);
    setUpdateStatus({ state: 'error' });
  });
}



function notifyUpdate() {
  if (!Notification.isSupported()) return;
  const notice = new Notification({
    title: '급식알리미 업데이트',
    body: `새 버전 v${update.version} 준비 완료! 위젯에서 바로 설치할 수 있어요.`,
  });
  notice.on('click', () => {
    if (!widget) return;
    widget.showInactive();
    widget.moveTop();
  });
  notice.show();
}

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  updater = autoUpdater;
  autoUpdater.on('checking-for-update', () => {
    if (updateStatus.state !== 'ready') setUpdateStatus({ state: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    if (updateStatus.state !== 'ready') setUpdateStatus({ state: 'downloading', version: info.version, percent: 0 });
  });
  autoUpdater.on('update-not-available', () => setUpdateStatus({ state: 'latest' }));
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.floor(progress.percent);
    if (updateStatus.state === 'downloading' && percent !== updateStatus.percent) {
      setUpdateStatus({ ...updateStatus, percent });
    }
  });
  autoUpdater.on('error', (error) => {
    console.error('업데이트 오류:', error);
    if (updateStatus.state !== 'ready') setUpdateStatus({ state: 'error' });
  });
  autoUpdater.on('update-downloaded', (info) => {
    // 같은 버전은 앱을 다시 켜도 한 번만 알린다. 그 뒤에는 종료할 때 조용히 설치된다.
    const isNew = store.getSettings().announcedUpdate !== info.version;
    if (isNew) store.updateSettings({ announcedUpdate: info.version });
    update = { version: info.version, notes: plainNotes(info.releaseNotes), announce: isNew || Boolean(update && update.announce) };
    setUpdateStatus({ state: 'ready', version: info.version });
    if (isNew) notifyUpdate();
  });
  checkUpdate();
  setInterval(checkUpdate, REFRESH_INTERVAL);
}

function installUpdate() {
  require('electron-updater').autoUpdater.quitAndInstall(true, true);
}

function openHelp() {
  if (helpWindow) {
    helpWindow.show();
    helpWindow.focus();
    return;
  }
  helpWindow = new BrowserWindow({
    width: 560,
    height: 760,
    minWidth: 440,
    minHeight: 480,
    title: '급식알리미 사용 설명서',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#fff8ea',
    webPreferences,
  });
  helpWindow.removeMenu();
  lockNavigation(helpWindow);
  helpWindow.on('closed', () => { helpWindow = null; });
  helpWindow.loadFile(path.join(__dirname, '..', 'renderer', 'help.html'));
}

function openUpdateInfo() {
  if (updateWindow) {
    updateWindow.show();
    updateWindow.focus();
    return;
  }
  updateWindow = new BrowserWindow({
    width: 480,
    height: 620,
    minWidth: 400,
    minHeight: 420,
    title: '급식알리미 업데이트 정보',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#fff8ea',
    webPreferences,
  });
  updateWindow.removeMenu();
  lockNavigation(updateWindow);
  updateWindow.on('closed', () => { updateWindow = null; });
  updateWindow.loadFile(path.join(__dirname, '..', 'renderer', 'update.html'));
}

function menuTemplate() {
  return [
    ...(update ? [{ label: '업데이트 설치하고 다시 시작', click: installUpdate }, { type: 'separator' }] : []),
    { label: widget && widget.isVisible() ? '위젯 숨기기' : '위젯 보이기', click: toggleWidget },
    { label: '식단 새로고침', click: () => refreshMeals() },
    { label: '설정', click: openSettings },
    { label: '사용 설명서', click: openHelp },
    { label: '업데이트 정보', click: openUpdateInfo },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ];
}

function toggleWidget() {
  if (!widget) return;
  if (widget.isVisible()) {
    widget.hide();
  } else {
    widget.showInactive();
    widget.moveTop(); // 다른 창 뒤에 묻히지 않게 앞으로 꺼낸다.
  }
}

function createTray() {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, '..', '..', 'assets', 'icon.png'))
    .resize({ width: 32, height: 32, quality: 'best' });
  tray = new Tray(icon);
  tray.setToolTip('급식알리미');
  tray.on('click', toggleWidget);
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate(menuTemplate())));
}

function readCharacters() {
  const images = {};
  let files = [];
  try {
    files = fs.readdirSync(charactersDir());
  } catch {
    return images;
  }
  for (const file of files) {
    const { name, ext } = path.parse(file);
    const type = IMAGE_TYPES[ext.toLowerCase()];
    if (!MOODS.includes(name) || !type) continue;
    const data = fs.readFileSync(path.join(charactersDir(), file)).toString('base64');
    images[name] = `data:${type};base64,${data}`;
  }
  return images;
}

function removeCharacterFiles(mood) {
  if (!fs.existsSync(charactersDir())) return;
  for (const file of fs.readdirSync(charactersDir())) {
    if (path.parse(file).name === mood) fs.rmSync(path.join(charactersDir(), file));
  }
}

async function pickCharacter(mood) {
  if (!MOODS.includes(mood)) return { ok: false };
  const parent = settingsWindow || undefined;
  const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
    title: '캐릭터 이미지 선택',
    properties: ['openFile'],
    filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
  });
  if (canceled || !filePaths.length) return { ok: false };
  const source = filePaths[0];
  const ext = path.extname(source).toLowerCase();
  if (!IMAGE_TYPES[ext]) return { ok: false, message: 'PNG, JPG, GIF, WEBP 이미지만 넣을 수 있어요.' };
  if (fs.statSync(source).size > MAX_IMAGE_BYTES) {
    return { ok: false, message: '15MB 이하의 이미지만 넣을 수 있어요.' };
  }
  fs.mkdirSync(charactersDir(), { recursive: true });
  removeCharacterFiles(mood);
  fs.copyFileSync(source, path.join(charactersDir(), `${mood}${ext}`));
  broadcast('characters:changed', readCharacters());
  return { ok: true };
}

function registerIpc() {
  ipcMain.handle('state:get', () => currentState());
  ipcMain.handle('meals:refresh', () => refreshMeals());
  ipcMain.handle('schools:search', (_event, name, region) => (
    createNeisClient({ fetch: net.fetch }).searchSchools(String(name), region ? String(region) : '')
  ));
  ipcMain.handle('settings:update', (_event, patch) => {
    const before = store.getSettings();
    const settings = store.updateSettings(patch);
    applyWindowSettings(settings);
    broadcast('state:changed', currentState());
    if (schoolKey(before.school) !== schoolKey(settings.school)) {
      lastError = null;
      refreshMeals();
    }
    return settings;
  });
  ipcMain.handle('characters:get', () => readCharacters());
  ipcMain.handle('characters:pick', (_event, mood) => pickCharacter(mood));
  ipcMain.handle('characters:remove', (_event, mood) => {
    if (MOODS.includes(mood)) removeCharacterFiles(mood);
    broadcast('characters:changed', readCharacters());
  });

  ipcMain.on('settings:open', openSettings);
  ipcMain.on('help:open', openHelp);
  ipcMain.on('update:check', checkUpdate);
  ipcMain.on('update:install', () => {
    if (update) installUpdate();
  });
  ipcMain.on('widget:menu', () => {
    if (widget) Menu.buildFromTemplate(menuTemplate()).popup({ window: widget });
  });
  ipcMain.on('widget:ignore-mouse', (_event, ignore) => {
    if (widget) widget.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });
  ipcMain.on('widget:height', (_event, height) => {
    if (!widget || !Number.isFinite(height)) return;
    const bounds = widget.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const next = Math.min(Math.max(Math.ceil(height), WIDGET_MIN_HEIGHT), area.height);
    if (next === bounds.height) return;
    // 캐릭터가 제자리에 있도록 아래쪽 기준으로 키운다.
    const { x, y } = clampToScreen(bounds.x, bounds.y + bounds.height - next, bounds.width, next);
    widget.setBounds({ x, y, width: bounds.width, height: next });
  });
  ipcMain.on('widget:drag-start', () => {
    if (widget) dragOrigin = widget.getBounds();
  });
  ipcMain.on('widget:drag-move', (_event, dx, dy) => {
    if (!widget || !dragOrigin) return;
    widget.setBounds({ ...dragOrigin, x: dragOrigin.x + Math.round(dx), y: dragOrigin.y + Math.round(dy) });
  });
  ipcMain.on('widget:drag-end', () => {
    if (!widget || !dragOrigin) return;
    dragOrigin = null;
    const bounds = widget.getBounds();
    const position = clampToScreen(bounds.x, bounds.y, bounds.width, bounds.height);
    widget.setBounds({ ...bounds, ...position });
    savePosition();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);
  // 이미 켜져 있는데 또 실행되면(자동 실행과 아이콘 클릭이 겹칠 때 등) 위젯만 앞으로 꺼낸다.
  // 학교를 아직 고르지 않았을 때만 설정 창을 연다.
  app.on('second-instance', () => {
    if (widget) {
      widget.showInactive();
      widget.moveTop();
      widget.webContents.send('widget:hello');
    }
    if (!store || !store.getSettings().school) openSettings();
  });

  app.whenReady().then(() => {
    store = createStore(app.getPath('userData'));
    registerIpc();
    createWidget();
    createTray();
    applyWindowSettings(store.getSettings());
    if (store.getSettings().school) refreshMeals();
    else openSettings();
    setInterval(refreshMeals, REFRESH_INTERVAL);
    powerMonitor.on('resume', refreshMeals);
    setupAutoUpdate();
  });

  // 위젯은 트레이에 상주하므로 창이 닫혀도 종료하지 않는다.
  app.on('window-all-closed', () => {});
}
