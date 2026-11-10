'use strict';
// 진도창에서 하는 일들. 넘겨받은 data를 그 자리에서 바꿉니다. (main이 저장·화면 갱신을 맡음)
// 차시·활동은 모든 반이 함께 쓰는 공통 계획이고, 체크와 메모만 반마다 따로입니다.

const { newUid } = require('./data');

function clampLesson(data, idx) {
  const n = Number.parseInt(idx, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(data.plan.length - 1, n));
}

function currentLesson(data, classIdx) {
  return clampLesson(data, data.lesson[String(classIdx)] ?? 0);
}

function setLesson(data, classIdx, lessonIdx) {
  data.lesson[String(classIdx)] = clampLesson(data, lessonIdx);
  return data.lesson[String(classIdx)];
}

function cleanText(text, fallback) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t || fallback;
}

function toggleItem(data, classIdx, lessonIdx, itemIdx, value) {
  const marks = data.classes[classIdx].progress[lessonIdx];
  if (!marks || itemIdx < 0 || itemIdx >= marks.length) throw new Error('없는 활동이에요.');
  marks[itemIdx] = value === undefined ? !marks[itemIdx] : Boolean(value);
  return marks[itemIdx];
}

function addItem(data, lessonIdx, text) {
  const lesson = data.plan[lessonIdx];
  lesson.items.push({ text: cleanText(text, '활동'), _uid: newUid() });
  for (const cls of data.classes) cls.progress[lessonIdx].push(false);
  return lesson.items.length - 1;
}

function editItem(data, lessonIdx, itemIdx, text) {
  data.plan[lessonIdx].items[itemIdx].text = cleanText(text, data.plan[lessonIdx].items[itemIdx].text);
}

function moveItem(data, lessonIdx, itemIdx, delta) {
  const items = data.plan[lessonIdx].items;
  const to = itemIdx + delta;
  if (to < 0 || to >= items.length) return itemIdx;
  const swap = (arr) => { [arr[itemIdx], arr[to]] = [arr[to], arr[itemIdx]]; };
  swap(items);
  for (const cls of data.classes) swap(cls.progress[lessonIdx]);
  return to;
}

function deleteItem(data, lessonIdx, itemIdx) {
  data.plan[lessonIdx].items.splice(itemIdx, 1);
  for (const cls of data.classes) cls.progress[lessonIdx].splice(itemIdx, 1);
}

function addLesson(data, name) {
  data.plan.push({ name: cleanText(name, `${data.plan.length + 1}차시`), items: [], _uid: newUid() });
  for (const cls of data.classes) cls.progress.push([]);
  return data.plan.length - 1;
}

function renameLesson(data, lessonIdx, name) {
  data.plan[lessonIdx].name = cleanText(name, data.plan[lessonIdx].name);
}

// 차시가 1개뿐이면 지울 수 없음. 반마다 보던 차시 번호도 맞춰 줍니다.
function deleteLesson(data, lessonIdx) {
  if (data.plan.length <= 1) throw new Error('차시가 1개뿐이라 지울 수 없어요.');
  data.plan.splice(lessonIdx, 1);
  for (const cls of data.classes) cls.progress.splice(lessonIdx, 1);
  for (const key of Object.keys(data.lesson)) {
    const v = Number(data.lesson[key]);
    if (v > lessonIdx) data.lesson[key] = v - 1;
    else if (v === lessonIdx) data.lesson[key] = Math.min(lessonIdx, data.plan.length - 1);
  }
}

function setMemo(data, classIdx, text) {
  data.classes[classIdx].memo = String(text ?? '');
}

// 계획 변경 되돌리기: snapshot(변경 직전)의 계획으로 돌아가되,
// 그 뒤에 한 체크와 메모·반 이름 등은 지금 것을 유지합니다.
function undoPlan(current, snapshot) {
  if (snapshot.classes.length !== current.classes.length) throw new Error('반 개수가 바뀌어 되돌릴 수 없어요.');
  current.classes.forEach((cls, ci) => {
    const done = new Map();
    const fill = (src) => src.plan.forEach((lesson, li) => lesson.items.forEach((item, ii) => {
      done.set(item._uid, Boolean(src.classes[ci].progress[li] && src.classes[ci].progress[li][ii]));
    }));
    fill(snapshot);
    fill(current);
    cls.progress = snapshot.plan.map((lesson) => lesson.items.map((item) => done.get(item._uid) || false));
  });
  current.plan = JSON.parse(JSON.stringify(snapshot.plan));
  current.lesson = JSON.parse(JSON.stringify(snapshot.lesson));
}

module.exports = {
  currentLesson, setLesson, toggleItem, addItem, editItem, moveItem, deleteItem,
  addLesson, renameLesson, deleteLesson, setMemo, undoPlan,
};
