'use strict';
// 저장 파일 읽기·쓰기, .bak, 날짜별 백업, 복원.
// 데이터 폴더는 기존 버전과 같은 %APPDATA%\UsagiJindo 를 씁니다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeData, toFileData, freshData, summarize, DataFormatError } = require('./data');

const DAILY_BACKUPS_KEPT = 14;
const DAILY_RE = /^progress-(\d{4})-(\d{2})-(\d{2})\.json$/;
const BEFORE_RESTORE_RE = /^before-restore-\d{8}-\d{6}(-\d+)?\.json$/;

function pad(n) {
  return String(n).padStart(2, '0');
}
function dayStamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function timeStamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function displayTime(d) {
  return `${dayStamp(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Windows에서는 백신 등이 파일을 잠깐 잡고 있으면 이름 바꾸기가 실패할 수 있어 몇 번 다시 시도합니다.
function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (attempt >= 6 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      sleepSync(40 * (attempt + 1));
    }
  }
}

function tempNameFor(file) {
  return `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
}

function removeQuietly(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    /* 이미 없음 */
  }
}

// 임시 파일에 다 쓰고 디스크에 내린 뒤 바꿔치기 → 도중에 꺼져도 원래 파일은 멀쩡합니다.
function atomicWrite(file, text) {
  const temp = tempNameFor(file);
  try {
    const fd = fs.openSync(temp, 'w');
    try {
      fs.writeSync(fd, text, null, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    renameWithRetry(temp, file);
  } finally {
    removeQuietly(temp);
  }
}

function atomicCopy(from, to) {
  const temp = tempNameFor(to);
  try {
    fs.copyFileSync(from, temp);
    renameWithRetry(temp, to);
  } finally {
    removeQuietly(temp);
  }
}

function readJson(file) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

// JSON이 깨졌거나 구조가 이상한 경우(= 파일 내용 문제)인지, 읽기 자체가 안 되는 경우인지 구분
function isContentError(err) {
  return err instanceof SyntaxError || err instanceof DataFormatError;
}

class SaveBlockedError extends Error {}
class RestoreError extends Error {}

class Store {
  constructor({ dataDir, now = () => new Date() }) {
    this.dataDir = dataDir;
    this.now = now;
    this.dataFile = path.join(dataDir, 'progress.json');
    this.bakFile = path.join(dataDir, 'progress.json.bak');
    this.backupDir = path.join(dataDir, 'backups');
    this.characterDir = path.join(dataDir, 'characters');
    this.saveBlocked = false;
    this.recoveryFile = null;
  }

  uniqueName(dir, base, ext) {
    let candidate = path.join(dir, `${base}${ext}`);
    for (let n = 1; fs.existsSync(candidate); n++) candidate = path.join(dir, `${base}-${n}${ext}`);
    return candidate;
  }

  // 깨진 원본을 progress.recovery-날짜시각.json 으로 보존
  preserveRecoveryCopy() {
    const target = this.uniqueName(this.dataDir, `progress.recovery-${timeStamp(this.now())}`, '.json');
    fs.copyFileSync(this.dataFile, target, fs.constants.COPYFILE_EXCL);
    this.recoveryFile = target;
    return target;
  }

  // 읽기만 하고 아무것도 쓰지 않는 검사 (확인용 스크립트에서 사용)
  inspect() {
    const report = { dataDir: this.dataDir, exists: fs.existsSync(this.dataFile) };
    if (!report.exists) return report;
    try {
      const data = normalizeData(readJson(this.dataFile));
      report.ok = true;
      report.data = data;
      report.summary = summarize(data);
    } catch (err) {
      report.ok = false;
      report.error = err.message;
    }
    return report;
  }

  // 결과: { data, warning, isFresh }
  load() {
    this.saveBlocked = false;
    this.recoveryFile = null;
    fs.mkdirSync(this.dataDir, { recursive: true });
    let warning = '';
    let primaryError = null;

    if (fs.existsSync(this.dataFile)) {
      try {
        return { data: normalizeData(readJson(this.dataFile)), warning: '', isFresh: false };
      } catch (err) {
        primaryError = err;
        try {
          const kept = this.preserveRecoveryCopy();
          warning = `저장 파일을 읽지 못해 원본을 보존했어요.\n복구용 파일: ${kept}`;
        } catch (copyErr) {
          this.saveBlocked = true;
          warning = `저장 파일을 읽지 못했고 원본 백업도 만들 수 없어요.\n저장 위치의 권한과 여유 공간을 확인해 주세요.\n${copyErr.message}`;
        }
      }
    }

    if (fs.existsSync(this.bakFile)) {
      try {
        const data = normalizeData(readJson(this.bakFile));
        if (!primaryError) {
          warning = '기본 저장 파일이 없어 최근 자동 백업을 복구했어요.';
        } else if (this.recoveryFile) {
          warning = `기본 저장 파일을 읽지 못해 최근 자동 백업을 복구했어요.\n손상된 파일은 여기 보존했어요: ${this.recoveryFile}`;
        } else {
          warning = '기본 저장 파일을 읽지 못해 최근 자동 백업을 불러왔지만, 원본 보존 파일을 만들지 못했어요.\n저장 위치의 권한과 여유 공간을 확인해 주세요.';
        }
        // 손상된 원본을 보존하지 못했다면 계속 덮어쓰기를 막습니다.
        return { data, warning, isFresh: false };
      } catch {
        /* 백업도 못 씀 */
      }
    }

    if (primaryError) {
      warning = warning
        ? `${warning}\n쓸 수 있는 자동 백업이 없어 새 데이터를 준비했어요.`
        : `저장 파일을 읽을 수 없어 새 데이터를 준비했어요.\n${primaryError.message}`;
    }
    return { data: freshData(), warning, isFresh: !primaryError };
  }

  // 하루 한 번, 그날 첫 저장 직전 상태를 남깁니다. 실패해도 진짜 저장은 막지 않습니다.
  saveDailyBackup() {
    try {
      const today = path.join(this.backupDir, `progress-${dayStamp(this.now())}.json`);
      if (fs.existsSync(today)) return;
      fs.mkdirSync(this.backupDir, { recursive: true });
      atomicCopy(this.dataFile, today);
      this.prune(DAILY_RE);
    } catch {
      /* 무시 */
    }
  }

  prune(pattern) {
    const names = fs.readdirSync(this.backupDir).filter((name) => pattern.test(name)).sort();
    for (const name of names.slice(0, Math.max(0, names.length - DAILY_BACKUPS_KEPT))) {
      removeQuietly(path.join(this.backupDir, name));
    }
  }

  save(data) {
    if (this.saveBlocked) throw new SaveBlockedError('원본 저장 파일을 보존하지 못해 덮어쓰기를 막았어요.');
    // 쓰기 전에 모양을 한 번 더 검사해서 망가진 데이터를 쓰지 않습니다.
    const fileData = toFileData(data);
    normalizeData(fileData);
    const text = JSON.stringify(fileData, null, 2);
    fs.mkdirSync(this.dataDir, { recursive: true });

    if (fs.existsSync(this.dataFile)) {
      // 바뀐 것이 없으면 쓰지 않음 (.bak이 지금과 같은 내용으로 덮이지 않게)
      if (fs.readFileSync(this.dataFile, 'utf8') === text) return false;
      let currentValid = false;
      try {
        normalizeData(readJson(this.dataFile));
        currentValid = true;
      } catch (err) {
        if (!isContentError(err)) throw err; // 읽을 수조차 없으면 덮어쓰지 않음
        if (!this.recoveryFile || !fs.existsSync(this.recoveryFile)) this.preserveRecoveryCopy();
      }
      if (currentValid) {
        atomicCopy(this.dataFile, this.bakFile);
        this.saveDailyBackup();
      }
    }
    atomicWrite(this.dataFile, text);
    return true;
  }

  // 백업 목록: 최근에 저장된 것부터, 깨진 파일은 건너뜀
  listBackups() {
    let names = [];
    try {
      names = fs.readdirSync(this.backupDir);
    } catch {
      return [];
    }
    const entries = [];
    for (const name of names) {
      const beforeRestore = BEFORE_RESTORE_RE.test(name);
      if (!beforeRestore && !DAILY_RE.test(name)) continue;
      const file = path.join(this.backupDir, name);
      try {
        const data = normalizeData(readJson(file));
        const savedAt = fs.statSync(file).mtimeMs;
        const s = summarize(data);
        const savedText = displayTime(new Date(savedAt));
        entries.push({
          file,
          name,
          beforeRestore,
          savedAt,
          savedText,
          ...s,
          label: `${savedText}   ${s.classes}개 반 · 활동 ${s.activities}개 · 체크 ${s.checks}개${beforeRestore ? '  (복원 직전)' : ''}`,
        });
      } catch {
        /* 깨진 백업은 목록에서 뺌 */
      }
    }
    entries.sort((a, b) => b.savedAt - a.savedAt);
    return entries;
  }

  // 복원: 지금 상태를 먼저 저장하고 before-restore 로 보관한 뒤에만 덮어씁니다.
  restore(entry, currentData) {
    let backupData;
    try {
      backupData = normalizeData(readJson(entry.file));
    } catch (err) {
      throw new RestoreError(`백업 파일을 읽지 못했어요.\n${err.message}`);
    }
    try {
      this.save(currentData);
      fs.mkdirSync(this.backupDir, { recursive: true });
      const keep = this.uniqueName(this.backupDir, `before-restore-${timeStamp(this.now())}`, '.json');
      fs.copyFileSync(this.dataFile, keep, fs.constants.COPYFILE_EXCL);
      this.prune(BEFORE_RESTORE_RE);
    } catch (err) {
      throw new RestoreError(`지금 상태를 보관하지 못해 복원을 취소했어요.\n저장 위치의 권한과 여유 공간을 확인해 주세요.\n\n${err.message}`);
    }
    this.save(backupData);
    return backupData;
  }
}

function defaultDataDir() {
  const base = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
  return path.join(base, 'UsagiJindo');
}

module.exports = { Store, SaveBlockedError, RestoreError, defaultDataDir, DAILY_BACKUPS_KEPT, dayStamp, timeStamp };
