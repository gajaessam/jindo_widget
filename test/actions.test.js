'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/core/data');
const A = require('../src/core/actions');

function sample() {
  return D.normalizeData({
    classes: [{ name: '1반', progress: [[true, false, false], [false]] }, { name: '2반', progress: [[false, true, false], [true]] }],
    plan: [
      { name: '1차시', items: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] },
      { name: '2차시', items: [{ text: 'D' }] },
    ],
    lesson: { 0: 1, 1: 0 },
  });
}
const texts = (d, l) => d.plan[l].items.map((i) => i.text);

test('체크하면 그 반만 바뀌고 진도율이 오른다', () => {
  const d = sample();
  assert.equal(D.completion(d, 0), 25);
  A.toggleItem(d, 0, 0, 1);
  assert.deepEqual(d.classes[0].progress[0], [true, true, false]);
  assert.deepEqual(d.classes[1].progress[0], [false, true, false]);
  assert.equal(D.completion(d, 0), 50);
  A.toggleItem(d, 0, 0, 1, false);
  assert.equal(d.classes[0].progress[0][1], false);
  assert.throws(() => A.toggleItem(d, 0, 0, 9));
});

test('활동 추가·수정: 모든 반에 같이 생기고 체크는 안 된 상태', () => {
  const d = sample();
  const idx = A.addItem(d, 1, '  새   활동 ');
  assert.equal(idx, 1);
  assert.deepEqual(texts(d, 1), ['D', '새 활동']);
  assert.deepEqual(d.classes.map((c) => c.progress[1]), [[false, false], [true, false]]);
  A.editItem(d, 1, 1, '고친 활동');
  assert.equal(d.plan[1].items[1].text, '고친 활동');
  A.editItem(d, 1, 1, '   ');
  assert.equal(d.plan[1].items[1].text, '고친 활동', '빈 이름으로는 안 바뀜');
});

test('위로·아래로 이동하면 모든 반의 체크가 같이 따라간다', () => {
  const d = sample();
  assert.equal(A.moveItem(d, 0, 0, 1), 1);
  assert.deepEqual(texts(d, 0), ['B', 'A', 'C']);
  assert.deepEqual(d.classes[0].progress[0], [false, true, false]);
  assert.deepEqual(d.classes[1].progress[0], [true, false, false]);
  assert.equal(A.moveItem(d, 0, 0, -1), 0, '맨 위에서 위로는 그대로');
});

test('활동 삭제는 모든 반에서 같이 지워진다', () => {
  const d = sample();
  A.deleteItem(d, 0, 0);
  assert.deepEqual(texts(d, 0), ['B', 'C']);
  assert.deepEqual(d.classes.map((c) => c.progress[0]), [[false, false], [true, false]]);
});

test('차시 추가·이름 수정·삭제, 1개뿐이면 삭제 불가', () => {
  const d = sample();
  const li = A.addLesson(d, '');
  assert.equal(d.plan[li].name, '3차시');
  assert.deepEqual(d.classes[0].progress[li], []);
  A.renameLesson(d, li, '평가');
  assert.equal(d.plan[li].name, '평가');
  A.deleteLesson(d, 0); // 1반은 2차시(1)를 보던 중 → 0으로, 2반은 1차시(0)를 보던 중 → 0
  assert.deepEqual(d.plan.map((l) => l.name), ['2차시', '평가']);
  assert.deepEqual(d.lesson, { 0: 0, 1: 0 });
  A.deleteLesson(d, 1);
  assert.throws(() => A.deleteLesson(d, 0), /1개뿐/);
});

test('마지막 차시를 보던 반에서 그 차시를 지우면 앞 차시로', () => {
  const d = sample();
  d.lesson = { 0: 1 };
  A.deleteLesson(d, 1);
  assert.deepEqual(d.lesson, { 0: 0 });
});

test('보던 차시 번호가 이상하면 범위 안으로', () => {
  const d = sample();
  d.lesson = { 0: 99, 1: 'x' };
  assert.equal(A.currentLesson(d, 0), 1);
  assert.equal(A.currentLesson(d, 1), 0);
  assert.equal(A.currentLesson(d, 5), 0);
  assert.equal(A.setLesson(d, 0, -3), 0);
});

test('되돌리기: 지운 활동과 그 체크가 돌아오고, 그 뒤에 한 체크·메모는 유지', () => {
  const d = sample();
  const snap = D.cloneData(d);
  A.deleteItem(d, 0, 0); // A 삭제 (1반이 체크해 둔 활동)
  A.toggleItem(d, 0, 0, 1); // 삭제 후 C 체크
  A.setMemo(d, 0, '나중 메모');
  A.undoPlan(d, snap);
  assert.deepEqual(texts(d, 0), ['A', 'B', 'C']);
  assert.deepEqual(d.classes[0].progress[0], [true, false, true]);
  assert.equal(d.classes[0].memo, '나중 메모');
});

test('되돌리기: 순서 변경 취소', () => {
  const d = sample();
  const snap = D.cloneData(d);
  A.moveItem(d, 0, 2, -1);
  A.undoPlan(d, snap);
  assert.deepEqual(texts(d, 0), ['A', 'B', 'C']);
  assert.deepEqual(d.classes[1].progress[0], [false, true, false]);
});

test('되돌리기: 차시 삭제 취소하면 보던 차시도 돌아옴', () => {
  const d = sample();
  const snap = D.cloneData(d);
  A.deleteLesson(d, 1);
  A.undoPlan(d, snap);
  assert.equal(d.plan.length, 2);
  assert.deepEqual(d.classes[1].progress[1], [true]);
  assert.deepEqual(d.lesson, { 0: 1, 1: 0 });
});

test('저장해도 파일 형식은 그대로 (꼬리표 없음)', () => {
  const d = sample();
  A.addItem(d, 0, 'X');
  A.addLesson(d, 'Y');
  const out = D.toFileData(d);
  assert.ok(!JSON.stringify(out).includes('_uid'));
  assert.deepEqual(D.toFileData(D.normalizeData(out)), out);
});
