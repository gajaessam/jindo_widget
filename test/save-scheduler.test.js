'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SaveScheduler, STATUS } = require('../src/core/save-scheduler');

function fakeTimers() {
  let now = 0;
  let id = 0;
  const jobs = new Map();
  return {
    setTimeout(fn, ms) { jobs.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout(t) { jobs.delete(t); },
    tick(ms) {
      now += ms;
      for (const [k, job] of [...jobs]) if (job.at <= now) { jobs.delete(k); job.fn(); }
    },
  };
}

test('메모: 타이핑이 0.5초 멈추면 한 번만 저장', () => {
  const timers = fakeTimers();
  let saves = 0;
  const statuses = [];
  const s = new SaveScheduler({ save: () => saves++, timers, onStatus: (x) => statuses.push(x) });
  for (let i = 0; i < 10; i++) { s.schedule(); timers.tick(100); }
  assert.equal(saves, 0);
  assert.equal(s.status, STATUS.SAVING);
  timers.tick(500);
  assert.equal(saves, 1);
  assert.equal(s.status, STATUS.SAVED);
  assert.equal(statuses.at(-1), '저장됨');
});

test('체크·창 닫기 등은 기다리지 않고 바로 저장, 기다리던 저장은 취소', () => {
  const timers = fakeTimers();
  let saves = 0;
  const s = new SaveScheduler({ save: () => saves++, timers });
  s.schedule();
  assert.equal(s.pending, true);
  assert.equal(s.flush(), true);
  assert.equal(saves, 1);
  assert.equal(s.pending, false);
  timers.tick(1000);
  assert.equal(saves, 1, '두 번 저장하지 않음');
});

test('저장 실패 시 "저장 오류"로 표시하고 알림', () => {
  const errors = [];
  const s = new SaveScheduler({ save: () => { throw new Error('권한 없음'); }, timers: fakeTimers(), onError: (e) => errors.push(e.message) });
  assert.equal(s.flush(), false);
  assert.equal(s.status, '저장 오류');
  assert.deepEqual(errors, ['권한 없음']);
});
