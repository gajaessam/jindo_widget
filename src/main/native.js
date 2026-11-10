'use strict';
// Windows 기능을 직접 부르는 부분 (koffi 사용). Windows가 아니거나 실패하면 조용히 넘어갑니다.

let koffi = null;
let user32 = null;
let kernel32 = null;
const fn = {};

function init() {
  if (process.platform !== 'win32' || koffi) return Boolean(user32);
  try {
    koffi = require('koffi');
    user32 = koffi.load('user32.dll');
    kernel32 = koffi.load('kernel32.dll');
    fn.SetWindowPos = user32.func('int __stdcall SetWindowPos(intptr hWnd, intptr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags)');
    fn.CreateMutexW = kernel32.func('intptr __stdcall CreateMutexW(intptr lpMutexAttributes, int bInitialOwner, str16 lpName)');
    fn.OpenMutexW = kernel32.func('intptr __stdcall OpenMutexW(uint dwDesiredAccess, int bInheritHandle, str16 lpName)');
    fn.CloseHandle = kernel32.func('int __stdcall CloseHandle(intptr hObject)');
    return true;
  } catch (err) {
    console.error('native init failed', err);
    user32 = null;
    return false;
  }
}

function hwndOf(win) {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? Number(buf.readBigInt64LE(0)) : buf.readInt32LE(0);
}

const HWND_BOTTOM = 1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const SWP_NOOWNERZORDER = 0x0200;

// 창을 다른 프로그램 창들 아래(바탕 화면 바로 위)로 보냅니다.
function sendToBottom(win) {
  if (!init()) return false;
  try {
    return Boolean(fn.SetWindowPos(hwndOf(win), HWND_BOTTOM, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_NOOWNERZORDER));
  } catch {
    return false;
  }
}

// 기존 Python 버전, 설치 프로그램(Inno Setup AppMutex)과 같은 이름의 뮤텍스
const MUTEX_NAME = 'Local\\JindoWidget-SingleInstance';
const SYNCHRONIZE = 0x00100000;
let mutexHandle = 0;

// 이미 다른 진도 위젯(옛 버전 포함)이 켜져 있으면 false
function acquireSingleInstance() {
  if (!init()) return true;
  try {
    const existing = fn.OpenMutexW(SYNCHRONIZE, 0, MUTEX_NAME);
    if (existing) {
      fn.CloseHandle(existing);
      return false;
    }
    mutexHandle = fn.CreateMutexW(0, 0, MUTEX_NAME);
    return true; // 만들지 못해도 실행은 막지 않음
  } catch {
    return true;
  }
}

module.exports = { sendToBottom, acquireSingleInstance };
