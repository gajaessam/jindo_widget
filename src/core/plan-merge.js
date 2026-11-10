'use strict';
// "수업 계획 설정" 창에서 고친 계획을 적용할 때, 그동안 진도창에서 한 체크를 잃지 않도록 합칩니다.
// 활동마다 붙은 꼬리표(_uid)로 체크를 따라가므로 순서를 바꿔도 체크가 그 활동을 따라갑니다.

const { cloneData, attachUids } = require('./data');

// 차시·활동의 이름과 순서만 뽑은 "계획 모양"
function planShape(plan) {
  return JSON.stringify(plan.map((lesson) => [lesson._uid, lesson.name, lesson.items.map((item) => [item._uid, item.text])]));
}

// 설정 창을 연 뒤 진도창에서 계획 자체(차시·활동 추가/삭제/이름/순서)가 바뀌었는지
function planChangedSince(openedPlan, livePlan) {
  return planShape(openedPlan) !== planShape(livePlan);
}

// livePlan 기준의 data에 editedPlan을 적용한 새 data를 돌려줍니다.
// - 체크는 지금(live) 상태에서 가져옵니다. (설정 창을 연 뒤 한 체크도 그대로)
// - 새로 만든 활동은 체크 안 됨, 지운 활동의 체크는 사라짐
// - 반마다 마지막으로 보던 차시도 같은 차시를 따라갑니다.
function applyEditedPlan(data, editedPlan) {
  const out = cloneData(data);
  const plan = attachUids(cloneData(editedPlan));
  if (!plan.length) throw new Error('차시는 하나 이상 있어야 해요.');

  out.classes.forEach((cls) => {
    const done = new Map();
    data.plan.forEach((lesson, li) => {
      lesson.items.forEach((item, ii) => done.set(item._uid, Boolean(cls.progress[li] && cls.progress[li][ii])));
    });
    cls.progress = plan.map((lesson) => lesson.items.map((item) => done.get(item._uid) || false));
  });

  const newIndexOfLesson = new Map(plan.map((lesson, idx) => [lesson._uid, idx]));
  const lessonSel = {};
  for (const [key, value] of Object.entries(data.lesson || {})) {
    const oldLesson = data.plan[Number(value)];
    let idx = oldLesson ? newIndexOfLesson.get(oldLesson._uid) : undefined;
    if (idx === undefined) idx = Math.max(0, Math.min(plan.length - 1, Number(value) || 0));
    lessonSel[key] = idx;
  }
  out.plan = plan;
  out.lesson = lessonSel;
  return out;
}

// 설정 창에서 받은 계획 정리: 빈 이름은 기본값으로, 차시는 하나 이상
function cleanPlan(input) {
  if (!Array.isArray(input) || !input.length) throw new Error('차시는 하나 이상 있어야 해요.');
  return input.map((lesson, li) => {
    const name = String((lesson && lesson.name) ?? '').replace(/\s+/g, ' ').trim() || `${li + 1}차시`;
    const items = (Array.isArray(lesson && lesson.items) ? lesson.items : []).map((item) => {
      const text = String((item && item.text) ?? '').replace(/\s+/g, ' ').trim() || '활동';
      return item && item._uid ? { text, _uid: String(item._uid) } : { text };
    });
    return lesson && lesson._uid ? { name, items, _uid: String(lesson._uid) } : { name, items };
  });
}

module.exports = { planChangedSince, applyEditedPlan, cleanPlan };
