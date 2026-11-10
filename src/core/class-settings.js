'use strict';
// "반 · 캐릭터 설정" 창의 초안(draft)을 데이터에 적용하는 규칙.
// 미리 보기와 저장 모두 이 함수를 써서, 창을 연 동안 진도창에서 한 체크도 지켜집니다.

const { resizeClasses, MIN_CLASSES, MAX_CLASSES } = require('./data');

function draftFromData(data) {
  return {
    count: data.classes.length,
    classes: data.classes.map((c) => ({ name: c.name, custom_image: c.custom_image || null })),
    scale: data.character_scale,
    float: data.float_motion,
    labels: data.show_progress_labels,
  };
}

function clampScale(v) {
  const n = Math.round(Number(v) / 10) * 10;
  return Number.isFinite(n) ? Math.max(50, Math.min(150, n)) : 100;
}

function clampCount(v) {
  return Math.max(MIN_CLASSES, Math.min(MAX_CLASSES, Math.trunc(Number(v)) || MIN_CLASSES));
}

// data는 바꾸지 않고 새 data를 돌려줍니다.
function applyClassSettings(data, draft) {
  const out = resizeClasses(data, clampCount(draft.count));
  out.classes.forEach((cls, i) => {
    const d = draft.classes[i];
    if (!d) return;
    const name = String(d.name ?? '').trim();
    cls.name = name || cls.name;
    cls.custom_image = d.custom_image || null;
  });
  out.character_scale = clampScale(draft.scale);
  out.float_motion = Boolean(draft.float);
  out.show_progress_labels = Boolean(draft.labels);
  return out;
}

// 초안의 반 개수 바꾸기.
// 줄였다가 다시 늘리면 창을 열 때 있던 반의 이름·이미지를 되살리고,
// 처음 생기는 반은 지금 반 번호 다음 숫자로 이름을 짓습니다.
function resizeDraft(draft, count, original) {
  const n = clampCount(count);
  const classes = draft.classes.slice(0, n);
  while (classes.length < n) {
    const i = classes.length;
    if (original && original.classes[i]) {
      classes.push({ ...original.classes[i] });
      continue;
    }
    const used = classes.map((c) => (String(c.name).match(/\d/g) || []).join('')).filter(Boolean).map(Number);
    classes.push({ name: `${(used.length ? Math.max(...used) : 0) + 1}반`, custom_image: null });
  }
  return { ...draft, count: n, classes };
}

module.exports = { draftFromData, applyClassSettings, resizeDraft, clampScale };
