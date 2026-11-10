'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/core/data');
const S = require('../src/core/class-settings');

function sample() {
  const d = D.freshData();
  d.classes[0].custom_image = 'C:\\a.png';
  d.classes[5].name = '9반';
  return d;
}

test('초안을 그대로 적용하면 데이터가 바뀌지 않는다', () => {
  const d = sample();
  const out = S.applyClassSettings(d, S.draftFromData(d));
  assert.deepEqual(D.toFileData(out), D.toFileData(d));
});

test('이름·이미지·크기·대기 동작·진도율 표시 적용', () => {
  const d = sample();
  const draft = S.draftFromData(d);
  draft.classes[1] = { name: '  2학년 3반 ', custom_image: 'C:\\b.png' };
  draft.classes[0].custom_image = null; // 이미지 삭제
  draft.scale = 133;
  draft.float = true;
  draft.labels = false;
  const out = S.applyClassSettings(d, draft);
  assert.equal(out.classes[1].name, '2학년 3반');
  assert.equal(out.classes[1].custom_image, 'C:\\b.png');
  assert.equal(out.classes[0].custom_image, null);
  assert.equal(out.character_scale, 130, '10% 단위');
  assert.equal(out.float_motion, true);
  assert.equal(out.show_progress_labels, false);
  assert.equal(d.classes[1].name, '2반', '원래 데이터는 그대로');
});

test('빈 이름은 원래 이름 유지, 크기는 50~150', () => {
  const d = sample();
  const draft = S.draftFromData(d);
  draft.classes[2].name = '   ';
  draft.scale = 999;
  const out = S.applyClassSettings(d, draft);
  assert.equal(out.classes[2].name, '3반');
  assert.equal(out.character_scale, 150);
  assert.equal(S.clampScale(10), 50);
});

test('설정 창을 연 뒤 진도창에서 한 체크는 저장해도 남는다', () => {
  const d = sample();
  const draft = S.draftFromData(d); // 창 열 때
  d.classes[0].progress[0][2] = true; // 그사이 진도창에서 체크
  d.classes[0].memo = '메모';
  draft.classes[0].name = '1반(수정)';
  const out = S.applyClassSettings(d, draft);
  assert.equal(out.classes[0].progress[0][2], true);
  assert.equal(out.classes[0].memo, '메모');
  assert.equal(out.classes[0].name, '1반(수정)');
});

test('반 늘리기: 지금 반 번호 다음 숫자로 이름', () => {
  const d = sample();
  const draft = S.resizeDraft(S.draftFromData(d), 8, null);
  assert.deepEqual(draft.classes.slice(6).map((c) => c.name), ['10반', '11반']);
  const out = S.applyClassSettings(d, draft);
  assert.equal(out.classes.length, 8);
  assert.equal(out.classes[7].name, '11반');
  assert.deepEqual(out.classes[7].progress, [[false, false, false]]);
});

test('줄였다가 다시 늘리면 원래 반의 이름·이미지가 돌아오고 진도도 남아 있다', () => {
  const d = sample();
  d.classes[5].progress[0] = [true, true, false];
  const original = S.draftFromData(d);
  let draft = S.resizeDraft(original, 3, original);
  assert.equal(draft.classes.length, 3);
  draft = S.resizeDraft(draft, 6, original);
  assert.equal(draft.classes[5].name, '9반');
  const out = S.applyClassSettings(d, draft);
  assert.deepEqual(out.classes[5].progress[0], [true, true, false]);
});

test('반 줄이기 적용: 뒤쪽 반과 그 반의 차시 기록 삭제, 1~20', () => {
  const d = sample();
  d.lesson = { 0: 0, 4: 0 };
  const out = S.applyClassSettings(d, S.resizeDraft(S.draftFromData(d), 2, null));
  assert.equal(out.classes.length, 2);
  assert.deepEqual(out.lesson, { 0: 0 });
  assert.equal(S.resizeDraft(S.draftFromData(d), 0, null).count, 1);
  assert.equal(S.resizeDraft(S.draftFromData(d), 50, null).count, 20);
});
