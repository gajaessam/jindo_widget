'use strict';
// 자동 실행: 현재 사용자 기준 HKCU\...\Run 의 "JindoWidget" 값 (기존 Python 버전과 같은 이름)

const { execFile } = require('child_process');
const { app } = require('electron');

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const VALUE = 'JindoWidget';

function reg(args) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout || '') }));
  });
}

// 설치한 프로그램에서만 켤 수 있음 (개발 중 실행은 electron.exe라서 등록하면 안 됨)
function supported() {
  return process.platform === 'win32' && app.isPackaged;
}

function command() {
  return `"${process.execPath}"`;
}

async function current() {
  const res = await reg(['query', RUN_KEY, '/v', VALUE]);
  if (!res.ok) return null;
  const m = res.stdout.match(/REG_SZ\s+(.+)\s*$/m);
  return m ? m[1].trim() : '';
}

async function isEnabled() {
  return (await current()) !== null;
}

async function setEnabled(on) {
  if (!supported()) throw new Error('자동 실행은 설치한 진도 위젯에서만 켤 수 있어요.');
  const res = on
    ? await reg(['add', RUN_KEY, '/v', VALUE, '/t', 'REG_SZ', '/d', command(), '/f'])
    : await reg(['delete', RUN_KEY, '/v', VALUE, '/f']);
  if (!res.ok && on) throw new Error('자동 실행을 등록하지 못했어요.');
  return isEnabled();
}

// 시작할 때: 자동 실행이 켜져 있는데 옛 실행 파일을 가리키면 지금 실행 파일로 고쳐 둠
async function repair() {
  if (!supported()) return;
  const value = await current();
  if (value && value.replace(/"/g, '').toLowerCase() !== process.execPath.toLowerCase()) {
    await reg(['add', RUN_KEY, '/v', VALUE, '/t', 'REG_SZ', '/d', command(), '/f']);
  }
}

module.exports = { supported, isEnabled, setEnabled, repair };
