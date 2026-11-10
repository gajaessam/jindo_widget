'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store, SaveBlockedError, RestoreError, DAILY_BACKUPS_KEPT } = require('../src/core/storage');
const D = require('../src/core/data');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jindo-test-'));
}
function clock(start = '2026-11-09T09:00:00') {
  const c = { t: new Date(start) };
  c.now = () => new Date(c.t);
  c.add = (ms) => { c.t = new Date(c.t.getTime() + ms); };
  c.nextDay = () => c.add(24 * 3600 * 1000);
  return c;
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function setup() {
  const dir = tempDir();
  const c = clock();
  const store = new Store({ dataDir: dir, now: c.now });
  return { dir, c, store };
}

test('파일이 없으면 기본값으로 시작하고 경고가 없다', () => {
  const { store } = setup();
  const r = store.load();
  assert.equal(r.isFresh, true);
  assert.equal(r.warning, '');
  assert.equal(r.data.classes.length, 6);
});

test('저장 후 다시 읽으면 같은 내용, 파일에는 _uid가 없다', () => {
  const { store } = setup();
  const { data } = store.load();
  data.classes[0].memo = '한글 메모 ✓';
  data.classes[0].progress[0][1] = true;
  store.save(data);
  const text = fs.readFileSync(store.dataFile, 'utf8');
  assert.ok(!text.includes('_uid'));
  assert.ok(text.includes('한글 메모 ✓'), 'UTF-8 그대로 저장');
  const again = new Store({ dataDir: store.dataDir }).load();
  assert.equal(again.data.classes[0].memo, '한글 메모 ✓');
  assert.equal(D.completion(again.data, 0), 33);
});

test('저장 때마다 직전 파일을 .bak으로, 임시 파일은 남지 않는다', () => {
  const { store, dir } = setup();
  const { data } = store.load();
  store.save(data);
  assert.equal(fs.existsSync(store.bakFile), false, '첫 저장은 직전 파일이 없음');
  data.classes[0].memo = '두 번째';
  store.save(data);
  assert.equal(readJson(store.bakFile).classes[0].memo, '');
  data.classes[0].memo = '세 번째';
  store.save(data);
  assert.equal(readJson(store.bakFile).classes[0].memo, '두 번째');
  assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp')), []);
});

test('바뀐 것이 없으면 다시 쓰지 않아 .bak이 그대로 남는다', () => {
  const { store } = setup();
  const { data } = store.load();
  data.classes[0].memo = '1';
  store.save(data);
  data.classes[0].memo = '2';
  store.save(data);
  assert.equal(store.save(data), false);
  assert.equal(readJson(store.bakFile).classes[0].memo, '1');
});

test('UTF-8 BOM이 붙은 파일도 읽는다', () => {
  const { store, dir } = setup();
  fs.writeFileSync(path.join(dir, 'progress.json'), '﻿' + JSON.stringify({ classes: [{ name: '가반' }] }), 'utf8');
  assert.equal(store.load().data.classes[0].name, '가반');
});

test('깨진 파일: 원본을 recovery로 보존하고 .bak에서 복구', () => {
  const { store, dir } = setup();
  const { data } = store.load();
  data.classes[0].memo = '좋은 상태';
  store.save(data);
  data.classes[0].memo = '그다음';
  store.save(data); // .bak = '좋은 상태'
  fs.writeFileSync(store.dataFile, '{"classes": [ 깨짐', 'utf8');
  const s2 = new Store({ dataDir: dir, now: () => new Date('2026-11-09T10:11:12') });
  const r = s2.load();
  assert.equal(r.data.classes[0].memo, '좋은 상태');
  assert.match(r.warning, /자동 백업을 복구/);
  const kept = path.join(dir, 'progress.recovery-20261109-101112.json');
  assert.equal(fs.readFileSync(kept, 'utf8'), '{"classes": [ 깨짐');
  // 복구한 내용으로 저장하면 깨진 원본은 .bak으로 가지 않고 recovery에만 남음
  s2.save(r.data);
  assert.equal(readJson(s2.dataFile).classes[0].memo, '좋은 상태');
  assert.equal(readJson(s2.bakFile).classes[0].memo, '좋은 상태');
  assert.equal(fs.readFileSync(kept, 'utf8'), '{"classes": [ 깨짐');
});

test('깨진 파일 + 쓸 수 있는 .bak도 없음: 새 데이터로 시작하고 알림', () => {
  const { store, dir } = setup();
  fs.writeFileSync(store.dataFile, 'not json', 'utf8');
  fs.writeFileSync(store.bakFile, '{"classes": []}', 'utf8');
  const r = store.load();
  assert.equal(r.data.classes.length, 6);
  assert.equal(r.isFresh, false);
  assert.match(r.warning, /원본을 보존/);
  assert.match(r.warning, /새 데이터/);
  assert.equal(fs.readdirSync(dir).filter((n) => n.startsWith('progress.recovery-')).length, 1);
});

test('같은 초에 두 번 보존해도 덮어쓰지 않는다', () => {
  const { store } = setup();
  fs.writeFileSync(store.dataFile, 'bad1', 'utf8');
  const a = store.preserveRecoveryCopy();
  fs.writeFileSync(store.dataFile, 'bad2', 'utf8');
  const b = store.preserveRecoveryCopy();
  assert.notEqual(a, b);
  assert.equal(fs.readFileSync(a, 'utf8'), 'bad1');
  assert.equal(fs.readFileSync(b, 'utf8'), 'bad2');
});

test('원본을 보존하지 못하면 덮어쓰지 않는다', () => {
  const { store } = setup();
  fs.writeFileSync(store.dataFile, 'broken', 'utf8');
  store.preserveRecoveryCopy = () => { throw new Error('디스크 가득 참'); };
  const r = store.load();
  assert.equal(store.saveBlocked, true);
  assert.match(r.warning, /원본 백업도 만들 수 없어요/);
  assert.throws(() => store.save(r.data), SaveBlockedError);
  assert.equal(fs.readFileSync(store.dataFile, 'utf8'), 'broken');
});

test('저장 직전에 파일이 깨져 있으면 먼저 보존하고 저장한다', () => {
  const { store, dir } = setup();
  const { data } = store.load();
  store.save(data);
  fs.writeFileSync(store.dataFile, 'oops', 'utf8');
  store.save(data);
  const kept = fs.readdirSync(dir).filter((n) => n.startsWith('progress.recovery-'));
  assert.equal(kept.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, kept[0]), 'utf8'), 'oops');
  assert.equal(readJson(store.dataFile).classes.length, 6);
});

test('망가진 데이터는 쓰지 않는다', () => {
  const { store } = setup();
  const { data } = store.load();
  store.save(data);
  const before = fs.readFileSync(store.dataFile, 'utf8');
  assert.throws(() => store.save({ classes: [] }));
  assert.equal(fs.readFileSync(store.dataFile, 'utf8'), before);
});

test('날짜별 백업: 그날 첫 저장 직전 상태를 하루 한 번', () => {
  const { store, c } = setup();
  const { data } = store.load();
  data.classes[0].memo = '어제 마지막';
  store.save(data);
  c.nextDay(); // 11-10
  data.classes[0].memo = '오늘 첫 저장';
  store.save(data);
  data.classes[0].memo = '오늘 두 번째';
  store.save(data);
  const daily = path.join(store.backupDir, 'progress-2026-11-10.json');
  assert.equal(readJson(daily).classes[0].memo, '어제 마지막');
});

test('날짜별 백업은 최근 14개만 보관', () => {
  const { store, c } = setup();
  const { data } = store.load();
  store.save(data);
  for (let i = 0; i < 20; i++) {
    c.nextDay();
    data.classes[0].memo = `day ${i}`;
    store.save(data);
  }
  const names = fs.readdirSync(store.backupDir).filter((n) => n.startsWith('progress-')).sort();
  assert.equal(names.length, DAILY_BACKUPS_KEPT);
  assert.equal(names[names.length - 1], 'progress-2026-11-29.json');
});

test('날짜별 백업이 실패해도 진짜 저장은 된다', () => {
  const { store } = setup();
  const { data } = store.load();
  store.save(data);
  fs.writeFileSync(store.backupDir, '폴더 자리에 파일', 'utf8'); // backups 폴더를 만들 수 없게
  data.classes[0].memo = '저장돼야 함';
  store.save(data);
  assert.equal(readJson(store.dataFile).classes[0].memo, '저장돼야 함');
});

test('백업 목록: 반 수, 활동 수, 체크 수, 깨진 백업은 건너뜀', () => {
  const { store, c } = setup();
  const { data } = store.load();
  data.classes[0].progress[0] = [true, true, false];
  store.save(data);
  c.nextDay();
  data.classes[0].memo = '다음 날';
  store.save(data);
  fs.writeFileSync(path.join(store.backupDir, 'progress-2026-01-01.json'), 'broken', 'utf8');
  fs.writeFileSync(path.join(store.backupDir, 'other.json'), '{}', 'utf8');
  const list = store.listBackups();
  assert.equal(list.length, 1);
  assert.equal(list[0].classes, 6);
  assert.equal(list[0].activities, 3);
  assert.equal(list[0].checks, 2);
  assert.equal(list[0].beforeRestore, false);
  assert.match(list[0].label, /6개 반 · 활동 3개 · 체크 2개$/);
});

test('복원: 지금 상태를 before-restore로 남기고, 그것으로 복원을 되돌릴 수 있다', () => {
  const { store, c } = setup();
  let { data } = store.load();
  data.classes[0].memo = '옛날';
  store.save(data);
  c.nextDay();
  data = D.resizeClasses(data, 3);
  data.classes[0].memo = '지금';
  store.save(data); // 11-10 백업 = '옛날'(6개 반)
  c.add(60 * 1000);

  const entry = store.listBackups().find((e) => e.name === 'progress-2026-11-10.json');
  data.classes[0].memo = '저장 안 된 최신';
  const restored = store.restore(entry, data);
  assert.equal(restored.classes.length, 6, '반 수가 달라도 복원');
  assert.equal(restored.classes[0].memo, '옛날');
  assert.equal(readJson(store.dataFile).classes[0].memo, '옛날');

  const before = store.listBackups().find((e) => e.beforeRestore);
  assert.ok(before, '(복원 직전) 항목이 목록에 있음');
  assert.match(before.label, /\(복원 직전\)$/);
  assert.equal(before.classes, 3);
  const back = store.restore(before, restored);
  assert.equal(back.classes[0].memo, '저장 안 된 최신');
  assert.equal(back.classes.length, 3);
});

test('복원: 지금 상태를 보관하지 못하면 복원하지 않는다', () => {
  const { store, c } = setup();
  const { data } = store.load();
  data.classes[0].memo = 'A';
  store.save(data);
  c.nextDay();
  data.classes[0].memo = 'B';
  store.save(data);
  const entry = store.listBackups()[0];
  store.saveBlocked = true; // 저장이 막힌 상황
  assert.throws(() => store.restore(entry, data), RestoreError);
  store.saveBlocked = false;
  assert.equal(readJson(store.dataFile).classes[0].memo, 'B');
});

test('inspect는 아무 파일도 만들거나 바꾸지 않는다', () => {
  const { store, dir } = setup();
  fs.writeFileSync(store.dataFile, JSON.stringify({ classes: [{ name: '1반' }] }), 'utf8');
  const before = fs.readdirSync(dir);
  const r = store.inspect();
  assert.equal(r.ok, true);
  assert.equal(r.summary.classes, 1);
  assert.deepEqual(fs.readdirSync(dir), before);
});
