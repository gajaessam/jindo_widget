'use strict';
// 진도창 화면
const api = window.jindoProgress;
const $ = (id) => document.getElementById(id);
const card = $('card');
const list = $('list');
const menu = $('menu');
const memo = $('memo');

let v = null;
let menuAnchor = null;

function setStatus(s) {
  const el = $('status');
  el.textContent = s;
  el.classList.toggle('saving', s === '저장 중…');
  el.classList.toggle('error', s === '저장 오류');
}

function render(next) {
  const classChanged = !v || v.classIdx !== next.classIdx;
  v = next;
  closeMenu();
  document.title = `${v.className} 진도`;
  $('title').textContent = `${v.className} 진도`;
  $('lessonName').textContent = v.lessonName;
  $('lessonName').title = v.lessonName;
  $('prev').disabled = v.lessonIdx <= 0;
  $('next').disabled = v.lessonIdx >= v.lessonCount - 1;
  $('barFill').style.width = `${v.percent}%`;
  $('bar').setAttribute('aria-valuenow', String(v.percent));
  $('progText').textContent = v.total
    ? `이번 차시 ${v.done}/${v.total} · ${v.percent}% 완료`
    : '이번 차시에는 활동이 없어요';
  $('progText').title = `전체 진도 ${v.overall}%`;

  list.replaceChildren();
  v.items.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = `row${item.done ? ' done' : ''}`;
    const chk = document.createElement('button');
    chk.className = 'chk';
    chk.textContent = '✓';
    chk.setAttribute('role', 'checkbox');
    chk.setAttribute('aria-checked', String(item.done));
    chk.setAttribute('aria-label', item.text);
    chk.addEventListener('click', () => api.action('toggle', { item: i }));
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = item.text;
    txt.addEventListener('click', () => api.action('toggle', { item: i }));
    const more = document.createElement('button');
    more.className = 'icon-btn';
    more.textContent = '⋯';
    more.title = '활동 메뉴';
    more.setAttribute('aria-label', `${item.text} 메뉴`);
    more.setAttribute('aria-haspopup', 'menu');
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      openMenu(more, li, [
        { label: '활동 수정', run: () => api.action('editItem', { item: i }) },
        { label: '위로 이동', disabled: i === 0, run: () => api.action('moveItem', { item: i, delta: -1 }) },
        { label: '아래로 이동', disabled: i === v.items.length - 1, run: () => api.action('moveItem', { item: i, delta: 1 }) },
        { sep: true },
        { label: '활동 삭제', danger: true, run: () => api.action('deleteItem', { item: i }) },
      ]);
    });
    li.append(chk, txt, more);
    list.appendChild(li);
  });
  $('empty').hidden = v.items.length > 0;

  if (classChanged || document.activeElement !== memo) memo.value = v.memo;
  $('undo').disabled = !v.canUndo;
  setStatus(v.status);

  document.body.style.maxHeight = `${v.maxHeight}px`;
  report();
}

function report() {
  requestAnimationFrame(() => api.ready(Math.ceil(document.body.getBoundingClientRect().height)));
}

// ── ⋯ 메뉴 (누른 버튼 바로 옆에 뜸) ──
function openMenu(anchorBtn, row, items) {
  if (menuAnchor === anchorBtn) { closeMenu(); return; }
  closeMenu();
  menu.replaceChildren();
  for (const it of items) {
    if (it.sep) { menu.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.setAttribute('role', 'menuitem');
    b.textContent = it.label;
    if (it.title) b.title = it.title;
    if (it.danger) b.className = 'danger';
    b.disabled = Boolean(it.disabled);
    b.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); it.run(); });
    menu.appendChild(b);
  }
  menu.hidden = false;
  menuAnchor = anchorBtn;
  if (row) row.classList.add('menu-open');
  const r = anchorBtn.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = Math.min(r.right - mw, window.innerWidth - mw - 6);
  left = Math.max(6, left);
  let top = r.bottom + 4;
  if (top + mh > window.innerHeight - 6) top = r.top - mh - 4; // 아래 자리가 없으면 위로
  top = Math.max(6, top);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  const first = menu.querySelector('button:not(:disabled)');
  if (first) first.focus();
}

function closeMenu() {
  if (menu.hidden) return;
  menu.hidden = true;
  menuAnchor = null;
  for (const r of list.querySelectorAll('.menu-open')) r.classList.remove('menu-open');
}

document.addEventListener('click', (e) => { if (!menu.contains(e.target)) closeMenu(); });
window.addEventListener('blur', closeMenu);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (!menu.hidden) { const a = menuAnchor; closeMenu(); if (a) a.focus(); }
    else api.action('close');
  }
  if (!menu.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const btns = [...menu.querySelectorAll('button:not(:disabled)')];
    const i = btns.indexOf(document.activeElement);
    const n = btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length];
    if (n) n.focus();
  }
});

$('close').addEventListener('click', () => api.action('close'));
$('prev').addEventListener('click', () => api.action('lesson', { delta: -1 }));
$('next').addEventListener('click', () => api.action('lesson', { delta: 1 }));
$('addItem').addEventListener('click', () => api.action('addItem'));
$('addLesson').addEventListener('click', () => api.action('addLesson'));
$('undo').addEventListener('click', () => api.action('undo'));
$('lessonMenuBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const only = v.lessonCount <= 1;
  openMenu($('lessonMenuBtn'), null, [
    { label: '차시 이름 수정', run: () => api.action('renameLesson') },
    { sep: true },
    { label: only ? '차시 삭제 (1개뿐이라 불가)' : '차시 삭제', danger: !only, disabled: only, run: () => api.action('deleteLesson') },
  ]);
});

memo.addEventListener('input', () => api.memo(memo.value));
memo.addEventListener('blur', () => api.memoFlush());

api.onView(render);
api.onStatus(setStatus);
api.onTail((x) => {
  const t = $('tail');
  t.style.left = `${Math.max(40, Math.min(window.innerWidth - 40, x))}px`;
});

document.fonts.ready.then(() => api.get()).then((first) => { if (first) render(first); });
