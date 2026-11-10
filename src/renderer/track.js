'use strict';
// 바탕 화면 트랙: 투명 창 하나에 모든 반 캐릭터를 그립니다.
// 가만히 있을 때는 아무 계산도 하지 않습니다(애니메이션 루프 정지). "살짝 둥둥"일 때만 낮은 빈도로 그립니다.

const api = window.jindoTrack;
const lane = document.getElementById('lane');
const flag = document.getElementById('flag');

const BASE_W = 56;          // 기존 버전과 같은 기본 캐릭터 상자 크기(100%)
const BASE_H = 62;
const FOOT = 4;             // 창 아래 여백
const ALPHA_HIT = 24;       // 이 값보다 불투명한 픽셀만 클릭으로 인정
const FLOAT_FRAME_MS = 100; // 둥둥 모드에서 확인 간격. 실제로 1픽셀이 바뀔 때만 다시 그립니다.
const DRAG_START_PX = 4;

let state = null;
let chars = [];
let hovered = null;
let interactive = false;
let press = null;
let rafId = 0;
let floatTimer = 0;
let lastTick = 0;

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function boxSize() {
  const s = (state ? state.scale : 100) / 100;
  return { w: Math.round(BASE_W * s), h: Math.round(BASE_H * s) };
}

function setInteractive(on) {
  if (on === interactive) return;
  interactive = on;
  api.setInteractive(on);
  document.body.style.cursor = on ? 'pointer' : '';
}

// ── 캐릭터 만들기 ──
function makeChar(idx) {
  const root = el('div', 'char');
  const tag = el('div', 'tag');
  const fig = el('div', 'figure');
  root.append(tag, fig);
  lane.appendChild(root);
  return {
    idx, root, tag, fig, canvas: null, alpha: null, bitmap: null, imageKey: undefined, broken: false,
    x: null, target: 0, speed: 100, walked: 0, lift: 0, dragging: false, phase: (idx % 3) * 2.1, width: 0, lastTransform: '',
  };
}

function renderPlaceholder(ch) {
  ch.fig.replaceChildren();
  ch.canvas = null;
  ch.alpha = null;
  const p = el('div', 'placeholder');
  p.textContent = '+';
  p.style.fontSize = `${Math.round(boxSize().w * 0.55)}px`;
  ch.fig.appendChild(p);
}

// 큰 이미지를 반씩 줄여 가며 그려서 테두리를 매끄럽게 (반투명 그대로)
function drawFitted(ch) {
  const { w, h } = boxSize();
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.max(1, Math.round(w * dpr));
  const chh = Math.max(1, Math.round(h * dpr));
  const bmp = ch.bitmap;
  const s = Math.min(cw / bmp.width, chh / bmp.height);
  const dw = Math.max(1, Math.round(bmp.width * s));
  const dh = Math.max(1, Math.round(bmp.height * s));

  let src = bmp;
  let sw = bmp.width;
  let sh = bmp.height;
  while (sw / 2 >= dw && sh / 2 >= dh) {
    const half = new OffscreenCanvas(Math.max(1, Math.floor(sw / 2)), Math.max(1, Math.floor(sh / 2)));
    const hc = half.getContext('2d');
    hc.imageSmoothingEnabled = true;
    hc.imageSmoothingQuality = 'high';
    hc.drawImage(src, 0, 0, sw, sh, 0, 0, half.width, half.height);
    src = half;
    sw = half.width;
    sh = half.height;
  }
  const canvas = el('canvas');
  canvas.width = cw;
  canvas.height = chh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, sw, sh, Math.round((cw - dw) / 2), chh - dh, dw, dh);
  ch.alpha = ctx.getImageData(0, 0, cw, chh).data;
  ch.canvas = canvas;
  ch.fig.replaceChildren(canvas);
}

async function loadImage(ch, key) {
  ch.imageKey = key;
  ch.bitmap = null;
  ch.broken = false;
  if (!key) { renderPlaceholder(ch); return; }
  const res = await api.getImage(ch.idx);
  if (ch.imageKey !== key) return; // 그사이 바뀜
  if (!res || !res.ok) {
    ch.broken = true;
    renderPlaceholder(ch);
    return;
  }
  try {
    const blob = new Blob([res.bytes], { type: res.mime });
    const bitmap = await createImageBitmap(blob); // GIF는 첫 장면
    if (ch.imageKey !== key) { bitmap.close(); return; }
    ch.bitmap = bitmap;
    drawFitted(ch);
  } catch (err) {
    ch.broken = true;
    renderPlaceholder(ch);
    api.imageFailed(ch.idx, String(err && err.message ? err.message : err));
  }
  relayout(false);
}

function applySizes() {
  const { w, h } = boxSize();
  for (const ch of chars) {
    ch.fig.style.width = `${w}px`;
    ch.fig.style.height = `${h}px`;
    if (ch.bitmap) drawFitted(ch);
    else if (!ch.canvas) renderPlaceholder(ch);
  }
}

// ── 상태 반영 ──
function applyState(next) {
  const first = state === null;
  const prev = state;
  state = next;
  if (chars.length !== next.classes.length) {
    for (const ch of chars) ch.root.remove();
    chars = next.classes.map((_, i) => makeChar(i));
    hovered = null;
  }
  const sizeChanged = !prev || prev.scale !== next.scale;
  if (sizeChanged) applySizes();
  next.classes.forEach((cls, i) => {
    const ch = chars[i];
    ch.tag.hidden = !next.labels;
    ch.tag.replaceChildren(document.createTextNode(cls.name), Object.assign(el('em'), { textContent: `${cls.percent}%` }));
    ch.root.title = '';
    if (ch.imageKey !== cls.imageKey) {
      ch.fig.style.width = `${boxSize().w}px`;
      ch.fig.style.height = `${boxSize().h}px`;
      loadImage(ch, cls.imageKey);
    }
  });
  relayout(first);
}

function relayout(snap) {
  if (!state) return;
  const W = window.innerWidth;
  const flagX = W - 34;
  flag.style.left = `${flagX}px`;
  let maxW = 0;
  for (const ch of chars) {
    ch.width = ch.root.offsetWidth;
    maxW = Math.max(maxW, ch.width);
  }
  const half = Math.max(boxSize().w, maxW) / 2;
  const start = 12 + half;
  const end = flagX - 6 - boxSize().w / 2;
  const targets = raceLayout(state.classes.map((c) => c.percent), start, Math.max(0, end - start), maxW + 6);
  chars.forEach((ch, i) => {
    const t = targets[i];
    if (ch.x === null || snap) ch.x = t;
    if (t !== ch.target) {
      ch.target = t;
      ch.speed = Math.max(70, Math.abs(t - ch.x) / 4); // 길어도 4초 안에 도착
    }
  });
  kick();
}

// ── 움직임 ──
function anyMoving() {
  return chars.some((ch) => ch.dragging || Math.abs(ch.x - ch.target) > 0.3 || ch.lift > 0.3);
}

function place(ch, now) {
  let hop = 0;
  if (!ch.dragging && Math.abs(ch.x - ch.target) > 0.3) hop = Math.abs(Math.sin(ch.walked / 9)) * 3;
  // 둥둥: 0~2픽셀, 정수 픽셀로만 움직여서 바뀔 때만 다시 그림 (대기 중 CPU 절약)
  const bob = state && state.float && !ch.dragging ? Math.round((Math.sin(now / 420 + ch.phase) + 1) * 1.0) : 0;
  const y = FOOT + ch.lift + hop + bob;
  const transform = `translate(${(ch.x - ch.width / 2).toFixed(1)}px, ${(-y).toFixed(1)}px)`;
  if (transform !== ch.lastTransform) {
    ch.root.style.transform = transform;
    ch.lastTransform = transform;
  }
  ch.drawnY = y;
}

function tick(now) {
  rafId = 0;
  const dt = Math.min(0.05, lastTick ? (now - lastTick) / 1000 : 0.016);
  lastTick = now;
  for (const ch of chars) {
    if (!ch.dragging) {
      const d = ch.target - ch.x;
      if (Math.abs(d) > 0.3) {
        const step = Math.sign(d) * Math.min(Math.abs(d), ch.speed * dt);
        ch.x += step;
        ch.walked += Math.abs(step);
      } else {
        ch.x = ch.target;
        ch.walked = 0;
      }
      if (ch.lift > 0.3) ch.lift *= Math.pow(0.002, dt); // 놓으면 부드럽게 내려옴
      else ch.lift = 0;
    }
    place(ch, now);
  }
  schedule();
}

function schedule() {
  if (rafId || floatTimer) return;
  if (anyMoving()) {
    rafId = requestAnimationFrame(tick);
  } else if (state && state.float) {
    lastTick = 0;
    floatTimer = setTimeout(() => { floatTimer = 0; rafId = requestAnimationFrame(tick); }, FLOAT_FRAME_MS);
  } else {
    lastTick = 0; // 완전히 멈춤: 다음 변화까지 아무것도 하지 않음
  }
}

function kick() {
  if (floatTimer) { clearTimeout(floatTimer); floatTimer = 0; }
  if (!rafId) rafId = requestAnimationFrame(tick);
}

// ── 마우스: 캐릭터가 그려진 픽셀 위에서만 클릭을 받고 나머지는 바탕 화면으로 통과 ──
function figureRect(ch) {
  const { w, h } = boxSize();
  const bottom = window.innerHeight - (ch.drawnY || FOOT);
  return { left: ch.x - w / 2, top: bottom - h, width: w, height: h };
}

function hitTest(px, py) {
  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i];
    if (ch.x === null) continue;
    const r = figureRect(ch);
    if (px >= r.left && px < r.left + r.width && py >= r.top && py < r.top + r.height) {
      if (!ch.alpha) return ch; // 자리표시자 전체
      const cx = Math.floor(((px - r.left) / r.width) * ch.canvas.width);
      const cy = Math.floor(((py - r.top) / r.height) * ch.canvas.height);
      if (ch.alpha[(cy * ch.canvas.width + cx) * 4 + 3] > ALPHA_HIT) return ch;
    }
    if (!ch.tag.hidden) {
      const t = ch.tag.getBoundingClientRect();
      if (px >= t.left && px < t.right && py >= t.top && py < t.bottom) return ch;
    }
  }
  return null;
}

function setHover(ch) {
  if (hovered === ch) return;
  if (hovered) hovered.root.classList.remove('hover');
  hovered = ch;
  if (ch) ch.root.classList.add('hover');
}

// 캐릭터(이름표 포함)의 창 안 위치. main이 화면 좌표로 바꿉니다.
function rectOnScreen(ch) {
  const r = ch.root.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}

document.addEventListener('mousemove', (e) => {
  if (press) {
    const { ch } = press;
    const dx = e.clientX - press.startX;
    const dy = e.clientY - press.startY;
    if (!ch.dragging && Math.hypot(dx, dy) >= DRAG_START_PX) ch.dragging = true;
    if (ch.dragging) {
      ch.x = Math.max(0, Math.min(window.innerWidth, press.startCharX + dx));
      const maxLift = window.innerHeight - boxSize().h - FOOT - (ch.tag.hidden ? 0 : ch.tag.offsetHeight + 4);
      ch.lift = Math.max(0, Math.min(maxLift, press.startLift - dy));
      kick();
    }
    return;
  }
  const hit = hitTest(e.clientX, e.clientY);
  setHover(hit);
  setInteractive(Boolean(hit));
});

document.addEventListener('mouseleave', () => {
  if (press) return;
  setHover(null);
  setInteractive(false);
});

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const ch = hitTest(e.clientX, e.clientY);
  if (!ch) return;
  press = { ch, startX: e.clientX, startY: e.clientY, startCharX: ch.x, startLift: ch.lift };
});

document.addEventListener('mouseup', (e) => {
  if (e.button !== 0 || !press) return;
  const { ch } = press;
  press = null;
  if (ch.dragging) {
    ch.dragging = false;
    ch.speed = Math.max(90, Math.abs(ch.target - ch.x) / 2.5); // 진도 위치로 돌아감
    kick();
  } else if (!state.classes[ch.idx].imageKey) {
    api.pickImage(ch.idx);
  } else {
    api.click(ch.idx, rectOnScreen(ch));
  }
  const hit = hitTest(e.clientX, e.clientY);
  setHover(hit);
  setInteractive(Boolean(hit));
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const ch = hitTest(e.clientX, e.clientY);
  if (ch) api.context(ch.idx, rectOnScreen(ch));
});

window.addEventListener('resize', () => relayout(true));
// 배율(DPI)이 바뀌면 다시 선명하게 그리기
function watchDpr() {
  const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  mq.addEventListener('change', () => { applySizes(); relayout(true); watchDpr(); }, { once: true });
}
watchDpr();

api.onState(applyState);
document.fonts.ready.then(() => api.getState()).then(applyState);
