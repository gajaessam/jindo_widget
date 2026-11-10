'use strict';
// 진도 데이터의 모양을 다루는 순수 함수 모음 (파일, 화면과 무관).
// progress.json 형식은 기존 v0.2.x(Python)와 똑같이 유지합니다.

const crypto = require('crypto');

const DEFAULT_ITEMS = [
  '여기에 활동을 적어 주세요',
  '⋯ 버튼으로 수정해 보세요',
  '다 끝나면 체크해 보세요',
];
const MIN_CLASSES = 1;
const MAX_CLASSES = 20;

class DataFormatError extends Error {}

function newUid() {
  return crypto.randomBytes(6).toString('hex');
}

// 메모리 안에서만 쓰는 꼬리표(_uid). 계획을 고쳐도 체크가 같은 활동을 따라가게 해 줍니다.
// 파일에 저장할 때는 toFileData()가 지웁니다.
function attachUids(plan) {
  for (const lesson of plan) {
    if (!lesson._uid) lesson._uid = newUid();
    for (const item of lesson.items) {
      if (!item._uid) item._uid = newUid();
    }
  }
  return plan;
}

function freshData() {
  const plan = [{ name: '1차시', items: DEFAULT_ITEMS.map((text) => ({ text })) }];
  const classes = [];
  for (let n = 1; n <= 6; n++) {
    classes.push({
      name: `${n}반`,
      image: n - 1,
      custom_image: null,
      progress: [plan[0].items.map(() => false)],
      memo: '',
    });
  }
  const data = {
    classes,
    plan,
    lesson: {},
    float_motion: false,
    character_scale: 100,
    show_progress_labels: true,
  };
  attachUids(data.plan);
  return data;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// 아주 옛날 형식: plan 없이 반마다 lessons가 있음. 차시·활동 이름을 합쳐 공통 계획을 만들고
// 반별 완료 여부는 같은 차시 안에서 활동 이름으로 맞춰 옮깁니다. (기존 Python 동작과 같음)
function upgradeLegacyLessons(data) {
  const plan = [];
  for (const cls of data.classes) {
    const lessons = Array.isArray(cls.lessons) ? cls.lessons : [];
    lessons.forEach((oldLesson, lessonIdx) => {
      if (!isPlainObject(oldLesson)) return;
      while (plan.length <= lessonIdx) {
        plan.push({ name: typeof oldLesson.name === 'string' && oldLesson.name ? oldLesson.name : `${lessonIdx + 1}차시`, items: [] });
      }
      const target = plan[lessonIdx];
      if (!target.items.length && typeof oldLesson.name === 'string' && oldLesson.name) target.name = oldLesson.name;
      const known = new Set(target.items.map((item) => item.text));
      for (const oldItem of Array.isArray(oldLesson.items) ? oldLesson.items : []) {
        if (!isPlainObject(oldItem)) continue;
        const text = typeof oldItem.text === 'string' ? oldItem.text : '활동';
        if (known.has(text)) continue;
        target.items.push({ text });
        known.add(text);
      }
    });
  }
  data.plan = plan.length ? plan : [{ name: '1차시', items: [] }];
  for (const cls of data.classes) {
    const oldLessons = Array.isArray(cls.lessons) ? cls.lessons : [];
    cls.progress = data.plan.map((lesson, lessonIdx) => {
      const oldLesson = oldLessons[lessonIdx];
      const oldItems = isPlainObject(oldLesson) && Array.isArray(oldLesson.items) ? oldLesson.items : [];
      const done = new Map();
      for (const oldItem of oldItems) {
        if (isPlainObject(oldItem)) done.set(typeof oldItem.text === 'string' ? oldItem.text : '활동', Boolean(oldItem.done));
      }
      return lesson.items.map((item) => done.get(item.text) || false);
    });
  }
}

// 읽어 온 JSON을 검사하고 빠진 값을 채웁니다. 구조가 망가져 있으면 DataFormatError.
// 모르는 항목(예: 옛 image 값)은 지우지 않고 그대로 둡니다. 입력은 바꾸지 않습니다.
function normalizeData(input) {
  if (!isPlainObject(input) || !Array.isArray(input.classes)) {
    throw new DataFormatError('저장 데이터 구조가 올바르지 않습니다.');
  }
  const data = JSON.parse(JSON.stringify(input));
  if (!data.classes.length) throw new DataFormatError('저장된 반 정보가 없습니다.');
  if (data.classes.some((cls) => !isPlainObject(cls))) throw new DataFormatError('반 정보 형식이 올바르지 않습니다.');

  if (!('plan' in data)) {
    upgradeLegacyLessons(data);
  } else if (!Array.isArray(data.plan)) {
    throw new DataFormatError('진도 계획 형식이 올바르지 않습니다.');
  }

  data.plan = data.plan.map((lesson) => {
    if (!isPlainObject(lesson)) throw new DataFormatError('차시 정보 형식이 올바르지 않습니다.');
    const items = lesson.items === undefined ? [] : lesson.items;
    if (!Array.isArray(items)) throw new DataFormatError('활동 목록 형식이 올바르지 않습니다.');
    const out = { ...lesson };
    if (typeof out.name !== 'string') out.name = out.name == null ? '차시' : String(out.name);
    out.items = items.map((item) => {
      if (typeof item === 'string') return { text: item };
      if (!isPlainObject(item)) throw new DataFormatError('활동 정보 형식이 올바르지 않습니다.');
      const text = item.text == null ? '활동' : String(item.text);
      return item._uid ? { text, _uid: item._uid } : { text };
    });
    return out;
  });
  if (!data.plan.length) data.plan = [{ name: '1차시', items: [] }];

  data.classes.forEach((cls, idx) => {
    if (typeof cls.name !== 'string') cls.name = cls.name == null ? `${idx + 1}반` : String(cls.name);
    if (!('image' in cls)) cls.image = idx % 6;
    if (cls.custom_image !== null && typeof cls.custom_image !== 'string') cls.custom_image = null;
    if (typeof cls.memo !== 'string') cls.memo = cls.memo == null ? '' : String(cls.memo);
    const existing = Array.isArray(cls.progress) ? cls.progress : [];
    // 크기를 계획에 맞춤: 부족한 칸은 false, 남는 칸은 버림
    cls.progress = data.plan.map((lesson, lessonIdx) => {
      const marks = Array.isArray(existing[lessonIdx]) ? existing[lessonIdx] : [];
      return lesson.items.map((_, i) => (i < marks.length ? Boolean(marks[i]) : false));
    });
    delete cls.lessons;
  });

  if (!isPlainObject(data.lesson)) data.lesson = {};
  data.float_motion = Boolean(data.float_motion ?? false);
  data.show_progress_labels = Boolean(data.show_progress_labels ?? true);
  const scale = Number.parseInt(data.character_scale ?? 100, 10);
  data.character_scale = Number.isFinite(scale) ? Math.max(50, Math.min(150, scale)) : 100;

  attachUids(data.plan);
  return data;
}

// 파일에 쓸 모양: 메모리용 꼬리표(_uid)를 뺍니다.
function toFileData(data) {
  return JSON.parse(JSON.stringify(data, (key, value) => (key === '_uid' ? undefined : value)));
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

// 반의 진도율 = 모든 차시에서 완료한 활동 수 ÷ 전체 활동 수 × 100, 반올림. 활동이 없으면 0.
function completion(data, classIdx) {
  const cls = data.classes[classIdx];
  if (!cls) return 0;
  const total = data.plan.reduce((sum, lesson) => sum + lesson.items.length, 0);
  if (!total) return 0;
  let done = 0;
  for (const marks of cls.progress) for (const mark of marks) if (mark) done++;
  return Math.round((done * 100) / total);
}

// 한 차시 안에서의 진행: { done, total, percent }
function lessonCompletion(data, classIdx, lessonIdx) {
  const marks = (data.classes[classIdx] && data.classes[classIdx].progress[lessonIdx]) || [];
  const total = marks.length;
  const done = marks.filter(Boolean).length;
  return { done, total, percent: total ? Math.round((done * 100) / total) : 0 };
}

function summarize(data) {
  const activities = data.plan.reduce((sum, lesson) => sum + lesson.items.length, 0);
  let checks = 0;
  for (const cls of data.classes) for (const marks of cls.progress) for (const mark of marks) if (mark) checks++;
  return { classes: data.classes.length, lessons: data.plan.length, activities, checks };
}

// 반 개수 바꾸기. 늘리면 기존 반 번호 다음 숫자로 이름을 짓고, 줄이면 뒤쪽 반을 지웁니다.
function resizeClasses(data, count) {
  const target = Math.max(MIN_CLASSES, Math.min(MAX_CLASSES, Math.trunc(count)));
  const out = cloneData(data);
  if (target < out.classes.length) {
    out.classes.length = target;
    const lesson = {};
    for (const [key, value] of Object.entries(out.lesson)) {
      if (/^\d+$/.test(key) && Number(key) < target) lesson[key] = value;
    }
    out.lesson = lesson;
  } else if (target > out.classes.length) {
    const used = out.classes
      .map((cls) => (cls.name.match(/\d/g) || []).join(''))
      .filter(Boolean)
      .map(Number);
    let next = (used.length ? Math.max(...used) : 0) + 1;
    while (out.classes.length < target) {
      out.classes.push({
        name: `${next}반`,
        image: 0,
        custom_image: null,
        progress: out.plan.map((lesson) => lesson.items.map(() => false)),
        memo: '',
      });
      next++;
    }
  }
  return out;
}

const raceLayout = require('../shared/race-layout');

module.exports = {
  DataFormatError,
  MIN_CLASSES,
  MAX_CLASSES,
  newUid,
  attachUids,
  freshData,
  normalizeData,
  toFileData,
  cloneData,
  completion,
  lessonCompletion,
  summarize,
  resizeClasses,
  raceLayout,
};
