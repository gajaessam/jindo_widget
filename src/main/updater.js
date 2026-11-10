'use strict';
// 업데이트 확인 → (사용자가 동의하면) 내려받기 → SHA-256 검증 → (동의하면) 설치 파일 실행
// 인터넷은 이 기능에만 씁니다. 진도·메모·이미지는 보내지 않습니다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { app, net, shell, ipcMain } = require('electron');
const dialogs = require('./dialogs');
const { openPanel, getPanel } = require('./panel');
const { GITHUB_REPOSITORY, pickUpdate } = require('../core/update');

const KEY = 'update';

function createUpdater({ quitApp, saveNow }) {
  let busy = false;
  let abort = null;
  let progress = { received: 0, total: 0, version: '' };

  async function fetchLatest() {
    const res = await net.fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'JindoWidget-Updater' },
      cache: 'no-store',
    });
    if (res.status === 404) return null; // 아직 Release가 없음
    if (!res.ok) throw new Error(`GitHub 응답 오류 (${res.status})`);
    return res.json();
  }

  function sendProgress() {
    const win = getPanel(KEY);
    if (win) win.webContents.send('update:progress', progress);
  }

  async function download(upd) {
    const dir = path.join(app.getPath('temp'), 'JindoWidget-update');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, path.basename(upd.asset.name));
    const part = `${file}.part`;
    abort = new AbortController();
    progress = { received: 0, total: upd.asset.size, version: upd.version };
    const win = openPanel(KEY, { file: 'update.html', width: 420, title: '업데이트 내려받기' });
    if (win) win.webContents.once('did-finish-load', sendProgress);
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(part);
    try {
      const res = await net.fetch(upd.asset.url, { signal: abort.signal, headers: { 'User-Agent': 'JindoWidget-Updater' } });
      if (!res.ok) throw new Error(`내려받기 오류 (${res.status})`);
      const reader = res.body.getReader();
      let last = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        progress.received += value.length;
        if (progress.received > upd.asset.size) throw new Error('받은 파일 크기가 예상과 달라요.');
        hash.update(value);
        if (!out.write(value)) await new Promise((r) => out.once('drain', r));
        if (Date.now() - last > 150) { last = Date.now(); sendProgress(); }
      }
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
      sendProgress();
      if (progress.received !== upd.asset.size) throw new Error('받은 파일 크기가 예상과 달라요.');
      if (hash.digest('hex') !== upd.asset.sha256) throw new Error('받은 파일이 GitHub의 검증 값(SHA-256)과 달라요. 설치하지 않았어요.');
      fs.rmSync(file, { force: true });
      fs.renameSync(part, file);
      return file;
    } catch (err) {
      out.destroy();
      fs.rmSync(part, { force: true });
      if (abort.signal.aborted) return null;
      throw err;
    } finally {
      abort = null;
      const w = getPanel(KEY);
      if (w) w.close();
    }
  }

  function runInstaller(file) {
    saveNow();
    try {
      const child = spawn(file, [], { detached: true, stdio: 'ignore', windowsHide: false });
      child.on('error', () => shell.openPath(file));
      child.unref();
    } catch {
      shell.openPath(file);
    }
    setTimeout(quitApp, 300);
  }

  // manual: 메뉴에서 누른 경우(결과를 항상 알려 줌). 자동 확인이면 새 버전이 있을 때만 알림.
  async function check(manual) {
    if (busy) {
      if (manual) {
        const w = getPanel(KEY);
        if (w) w.focus();
        else dialogs.notify('업데이트 확인', '업데이트를 확인하는 중이에요.');
      }
      return;
    }
    busy = true;
    try {
      let upd = null;
      try {
        const release = await fetchLatest();
        upd = release ? pickUpdate(release, app.getVersion()) : null;
      } catch (err) {
        if (manual) await dialogs.notify('업데이트 확인', '업데이트를 확인하지 못했어요.\n인터넷 연결을 확인한 뒤 다시 시도해 주세요.', null, err.message);
        return;
      }
      if (!upd) {
        if (manual) await dialogs.notify('업데이트 확인', `지금 쓰는 v${app.getVersion()}이(가) 최신 버전이에요.`);
        return;
      }
      const ask = await dialogs.showDialog({
        title: '새 버전이 있어요',
        message: `진도 위젯 v${upd.version}이(가) 나왔어요. (지금 v${app.getVersion()})\n내려받을까요? 진도와 메모는 그대로 남아요.`,
        detail: `바뀐 점\n${upd.notes || '(적힌 내용이 없어요)'}`,
        cancelIndex: 0,
        buttons: [{ label: '나중에', kind: 'ghost' }, { label: '내려받기', kind: 'primary' }],
      });
      if (ask.index !== 1) return;
      let file;
      try {
        file = await download(upd);
      } catch (err) {
        await dialogs.notify('업데이트를 받지 못했어요', err.message);
        return;
      }
      if (!file) return; // 취소
      const ok = await dialogs.confirm({
        title: '설치 파일을 받았어요',
        message: `v${upd.version} 설치 파일을 받고 검증까지 마쳤어요.\n지금 설치할까요? 진도 위젯이 꺼진 뒤 설치 화면이 열려요.`,
        yes: '지금 설치', no: '나중에',
      });
      if (ok) runInstaller(file);
    } finally {
      busy = false;
    }
  }

  ipcMain.handle('update:get', () => progress);
  ipcMain.on('update:cancel', () => { if (abort) abort.abort(); });

  return { check };
}

module.exports = { createUpdater };
