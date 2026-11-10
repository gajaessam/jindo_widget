'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/core/data');
const { planChangedSince, applyEditedPlan } = require('../src/core/plan-merge');

function sample() {
  return D.normalizeData({
    classes: [{ name: '1반', progress: [[false, false, false], [false]] }, { name: '2반', progress: [[true, false, false], [true]] }],
    plan: [
      { name: '1차시', items: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] },
      { name: '2차시', items: [{ text: 'D' }] },
    ],
    lesson: { 0: 1, 1: 0 },
  });
}

test('설정 창을 연 뒤 진도창에서 한 체크는 저장해도 지워지지 않는다', () => {
  const live = sample();
  const edited = D.cloneData(live.plan); // 설정 창이 열릴 때 복사
  edited[0].items.push({ text: '새 활동' });
  live.classes[0].progress[0][1] = true; // 창이 열려 있는 동안 진도창에서 체크
  assert.equal(planChangedSince(D.cloneData(live.plan), live.plan), false, '체크만으로는 계획이 바뀐 게 아님');
  const out = applyEditedPlan(live, edited);
  assert.deepEqual(out.classes[0].progress, [[false, true, false, false], [false]]);
  assert.deepEqual(out.classes[1].progress, [[true, false, false, false], [true]]);
});

test('순서를 바꾸면 체크가 해당 활동을 따라간다', () => {
  const live = sample();
  const edited = D.cloneData(live.plan);
  edited[0].items.reverse(); // C, B, A
  edited.reverse(); // 2차시, 1차시
  const out = applyEditedPlan(live, edited);
  assert.deepEqual(out.plan.map((l) => l.name), ['2차시', '1차시']);
  assert.deepEqual(out.classes[1].progress, [[true], [false, false, true]]);
  // 반마다 보던 차시도 같은 차시를 따라감
  assert.deepEqual(out.lesson, { 0: 0, 1: 1 });
});

test('지운 활동의 체크는 사라지고 이름을 바꿔도 체크는 유지', () => {
  const live = sample();
  const edited = D.cloneData(live.plan);
  edited[0].items[0].text = 'A(수정)';
  edited[0].items.splice(1, 1); // B 삭제
  const out = applyEditedPlan(live, edited);
  assert.deepEqual(out.plan[0].items.map((i) => i.text), ['A(수정)', 'C']);
  assert.deepEqual(out.classes[1].progress[0], [true, false]);
});

test('보던 차시가 지워지면 범위 안으로 맞춘다', () => {
  const live = sample();
  const edited = D.cloneData(live.plan).slice(0, 1);
  const out = applyEditedPlan(live, edited);
  assert.deepEqual(out.lesson, { 0: 0, 1: 0 });
  assert.throws(() => applyEditedPlan(live, []));
});

test('진도창에서 계획 자체가 바뀌면 알아챈다', () => {
  const live = sample();
  const opened = D.cloneData(live.plan);
  assert.equal(planChangedSince(opened, live.plan), false);
  live.plan[0].items.push({ text: '진도창에서 추가', _uid: D.newUid() });
  assert.equal(planChangedSince(opened, live.plan), true);
  const live2 = sample();
  const opened2 = D.cloneData(live2.plan);
  [live2.plan[0].items[0], live2.plan[0].items[1]] = [live2.plan[0].items[1], live2.plan[0].items[0]];
  assert.equal(planChangedSince(opened2, live2.plan), true, '순서 변경도 계획 변경');
});

test('덮어쓰기로 결정해도 진도창에서 옮긴 활동의 체크는 따라간다', () => {
  const live = sample();
  const edited = D.cloneData(live.plan);
  // 진도창에서 C를 맨 위로 옮기고 체크
  const [c] = live.plan[0].items.splice(2, 1);
  live.plan[0].items.unshift(c);
  live.classes.forEach((cls) => { const [m] = cls.progress[0].splice(2, 1); cls.progress[0].unshift(m); });
  live.classes[0].progress[0][0] = true; // C 체크
  const out = applyEditedPlan(live, edited); // 설정 창의 순서(A,B,C)로 덮어쓰기
  assert.deepEqual(out.plan[0].items.map((i) => i.text), ['A', 'B', 'C']);
  assert.deepEqual(out.classes[0].progress[0], [false, false, true]);
});

test('설정 창에서 받은 계획 정리: 빈 이름 채우기, 꼬리표 유지, 빈 계획 거부', () => {
  const { cleanPlan } = require('../src/core/plan-merge');
  const out = cleanPlan([{ name: '  ', items: [{ text: '', _uid: 'u1' }, { text: ' 발표  하기 ' }], _uid: 'L1' }]);
  assert.deepEqual(out, [{ name: '1차시', items: [{ text: '활동', _uid: 'u1' }, { text: '발표 하기' }], _uid: 'L1' }]);
  assert.throws(() => cleanPlan([]), /하나 이상/);
  assert.throws(() => cleanPlan(null));
});

test('적용 결과는 원래 data를 바꾸지 않는다', () => {
  const live = sample();
  const snapshot = JSON.stringify(live);
  applyEditedPlan(live, D.cloneData(live.plan).reverse());
  assert.equal(JSON.stringify(live), snapshot);
});
