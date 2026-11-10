'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/core/data');

const OLD_FORMAT = {
  classes: [
    {
      name: '1반',
      image: 0,
      custom_image: 'C:\\Users\\이름\\AppData\\Roaming\\UsagiJindo\\characters\\a1b2c3d4_캐릭터.png',
      progress: [[true, false, false], []],
      memo: '이 반 메모',
    },
  ],
  plan: [
    { name: '1차시', items: [{ text: '활동 1' }, { text: '활동 2' }, { text: '활동 3' }] },
    { name: '2차시', items: [] },
  ],
  lesson: { 0: 1 },
  float_motion: false,
  character_scale: 100,
  show_progress_labels: true,
};

test('처음 실행 기본값: 1~6반, 1차시에 활동 3개, 멈춤, 100%, 진도율 표시', () => {
  const d = D.freshData();
  assert.deepEqual(d.classes.map((c) => c.name), ['1반', '2반', '3반', '4반', '5반', '6반']);
  assert.equal(d.plan.length, 1);
  assert.deepEqual(d.plan[0].items.map((i) => i.text), ['여기에 활동을 적어 주세요', '⋯ 버튼으로 수정해 보세요', '다 끝나면 체크해 보세요']);
  assert.equal(d.float_motion, false);
  assert.equal(d.character_scale, 100);
  assert.equal(d.show_progress_labels, true);
  assert.ok(d.classes.every((c) => c.custom_image === null && c.memo === '' && c.progress[0].length === 3));
});

test('기존 v0.2.x 파일을 그대로 읽고, 다시 저장 모양으로 바꾸면 원본과 같다', () => {
  const d = D.normalizeData(OLD_FORMAT);
  assert.deepEqual(D.toFileData(d), OLD_FORMAT);
  assert.ok(d.plan[0].items[0]._uid, '메모리에는 꼬리표가 붙는다');
});

test('모르는 항목과 옛 image 값은 지우지 않는다', () => {
  const input = { ...OLD_FORMAT, future_option: 'x', classes: [{ ...OLD_FORMAT.classes[0], image: 3, extra: 1 }] };
  const out = D.toFileData(D.normalizeData(input));
  assert.equal(out.future_option, 'x');
  assert.equal(out.classes[0].image, 3);
  assert.equal(out.classes[0].extra, 1);
});

test('입력 객체는 바꾸지 않는다', () => {
  const copy = JSON.parse(JSON.stringify(OLD_FORMAT));
  D.normalizeData(copy);
  assert.deepEqual(copy, OLD_FORMAT);
});

test('progress 크기가 plan과 다르면 부족한 칸은 false, 남는 칸은 버린다', () => {
  const input = JSON.parse(JSON.stringify(OLD_FORMAT));
  input.classes[0].progress = [[true, true, true, true, true]];
  const d = D.normalizeData(input);
  assert.deepEqual(d.classes[0].progress, [[true, true, true], []]);
  input.classes[0].progress = 'garbage';
  assert.deepEqual(D.normalizeData(input).classes[0].progress, [[false, false, false], []]);
});

test('빠진 값 채우기, 이상한 값 고치기', () => {
  const d = D.normalizeData({ classes: [{}, { name: 7, memo: null }], plan: [{ items: ['문자열 활동'] }], character_scale: 999, lesson: [] });
  assert.equal(d.classes[0].name, '1반');
  assert.equal(d.classes[1].name, '7');
  assert.equal(d.classes[1].memo, '');
  assert.equal(d.classes[1].image, 1);
  assert.equal(d.plan[0].name, '차시');
  assert.equal(d.plan[0].items[0].text, '문자열 활동');
  assert.equal(d.character_scale, 150);
  assert.deepEqual(d.lesson, {});
  assert.equal(D.normalizeData({ classes: [{}], character_scale: 'x' }).character_scale, 100);
  assert.equal(D.normalizeData({ classes: [{}], character_scale: 10 }).character_scale, 50);
});

test('plan이 빈 목록이면 1차시 하나를 만든다', () => {
  const d = D.normalizeData({ classes: [{}], plan: [] });
  assert.equal(d.plan.length, 1);
  assert.equal(d.plan[0].name, '1차시');
});

test('구조가 망가진 파일은 오류로 알린다', () => {
  for (const bad of [null, [], {}, { classes: [] }, { classes: [1] }, { classes: [{}], plan: {} }, { classes: [{}], plan: [1] }, { classes: [{}], plan: [{ items: {} }] }, { classes: [{}], plan: [{ items: [5] }] }]) {
    assert.throws(() => D.normalizeData(bad), D.DataFormatError, JSON.stringify(bad));
  }
});

test('아주 옛날 형식(반마다 lessons)을 공통 계획으로 바꾸고 체크는 활동 이름으로 맞춘다', () => {
  const legacy = {
    classes: [
      { name: '1반', lessons: [{ name: '도입', items: [{ text: 'A', done: true }, { text: 'B', done: false }] }] },
      { name: '2반', lessons: [{ name: '도입', items: [{ text: 'B', done: true }, { text: 'C', done: true }] }, { name: '전개', items: [{ text: 'D', done: true }] }] },
    ],
  };
  const d = D.normalizeData(legacy);
  assert.deepEqual(d.plan.map((l) => [l.name, l.items.map((i) => i.text)]), [['도입', ['A', 'B', 'C']], ['전개', ['D']]]);
  assert.deepEqual(d.classes[0].progress, [[true, false, false], [false]]);
  assert.deepEqual(d.classes[1].progress, [[false, true, true], [true]]);
  assert.equal('lessons' in d.classes[0], false);
});

test('진도율 = 완료 ÷ 전체 × 100 반올림, 활동이 없으면 0%', () => {
  const d = D.normalizeData(OLD_FORMAT);
  assert.equal(D.completion(d, 0), 33);
  d.classes[0].progress = [[true, true, false], []];
  assert.equal(D.completion(d, 0), 67);
  const empty = D.normalizeData({ classes: [{}], plan: [{ name: '1차시', items: [] }] });
  assert.equal(D.completion(empty, 0), 0);
  assert.deepEqual(D.lessonCompletion(d, 0, 0), { done: 2, total: 3, percent: 67 });
  assert.deepEqual(D.lessonCompletion(d, 0, 1), { done: 0, total: 0, percent: 0 });
});

test('반 늘리기: 기존 반 번호 다음 숫자로 이름 짓기', () => {
  let d = D.freshData();
  d.classes[5].name = '9반';
  d = D.resizeClasses(d, 8);
  assert.deepEqual(d.classes.slice(6).map((c) => c.name), ['10반', '11반']);
  assert.deepEqual(d.classes[7].progress, [[false, false, false]]);
});

test('반 줄이기: 뒤쪽 반과 그 반의 마지막 차시 기록이 사라진다, 1~20 범위', () => {
  let d = D.freshData();
  d.lesson = { 0: 0, 5: 0 };
  d = D.resizeClasses(d, 3);
  assert.equal(d.classes.length, 3);
  assert.deepEqual(d.lesson, { 0: 0 });
  assert.equal(D.resizeClasses(d, 0).classes.length, 1);
  assert.equal(D.resizeClasses(d, 99).classes.length, 20);
});

test('트랙 위치: 진도 순서 유지, 같은 진도는 필요한 만큼만 띄움', () => {
  const pos = D.raceLayout([50, 50, 0, 100], 0, 1000, 72);
  assert.equal(pos[2], 0);
  assert.equal(pos[3], 1000);
  assert.equal(pos[0], 500);
  assert.equal(pos[1], 572);
  // 진도 순서가 뒤집히지 않음
  const values = [10, 80, 80, 80, 81, 100, 0];
  const p = D.raceLayout(values, 20, 600);
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
  for (let i = 1; i < order.length; i++) assert.ok(p[order[i]] >= p[order[i - 1]], '순서 유지');
  assert.ok(p.every((x) => x >= 20 && x <= 620), '트랙 밖으로 나가지 않음');
});

test('트랙 위치: 끝에 몰려도 겹치지 않게 앞으로 밀어 줌', () => {
  const p = D.raceLayout([100, 100, 100], 0, 1000, 72);
  assert.deepEqual(p, [856, 928, 1000]);
  assert.deepEqual(D.raceLayout([], 0, 100), []);
  assert.deepEqual(D.raceLayout([40], 0, 100), [40]);
});
