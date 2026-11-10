'use strict';
(async function () {
  const $ = (id) => document.getElementById(id);
  const api = window.jindo;
  let plan = await api.invoke('plan:get');
  if (!plan) return;
  let dirty = false;
  let focusAfter = null; // 다시 그린 뒤 포커스할 입력칸 id
  let drag = null;

  const box = $('lessons');
  const scroller = document.querySelector('.scroll');
  const indicator = el('div', { class: 'drop-line', hidden: true });

  function touch() { dirty = true; }

  async function confirmDelete(title, message) {
    return api.invoke('plan:confirm', { title, message, yes: '삭제', danger: true });
  }

  function handle(label, onDown) {
    const h = el('span', { class: 'handle', text: '⠿', title: `끌어서 ${label} 옮기기`, 'aria-hidden': 'true' });
    h.addEventListener('pointerdown', onDown);
    return h;
  }

  function render() {
    box.replaceChildren();
    plan.forEach((lesson, li) => {
      const nameId = `lesson${li}`;
      const name = el('input', { type: 'text', id: nameId, value: lesson.name, maxlength: '60', 'aria-label': `${li + 1}번째 차시 이름` });
      name.addEventListener('input', () => { lesson.name = name.value; touch(); });
      const head = el('div', { class: 'lesson-head' },
        handle('차시', (e) => startDrag(e, { type: 'lesson', li })),
        el('span', { class: 'badge', text: `${li + 1}` }),
        name,
        el('div', { class: 'tools' },
          el('button', {
            class: 'icon-btn del', text: '✕', title: plan.length <= 1 ? '차시가 1개뿐이라 지울 수 없어요' : '차시 삭제', 'aria-label': '차시 삭제', disabled: plan.length <= 1,
            onclick: async () => {
              const ok = await confirmDelete('차시 삭제', `"${lesson.name || `${li + 1}차시`}"을(를) 지울까요?\n저장하면 이 차시의 활동과 모든 반의 체크가 함께 지워져요.`);
              if (!ok) return;
              plan.splice(li, 1);
              touch();
              render();
            },
          })));

      const items = el('div', { class: 'items', 'data-li': String(li) });
      if (!lesson.items.length) items.append(el('div', { class: 'none', text: '활동이 없어요' }));
      lesson.items.forEach((item, ii) => {
        const id = `item${li}_${ii}`;
        const input = el('input', { type: 'text', id, value: item.text, maxlength: '120', 'aria-label': `${li + 1}차시 ${ii + 1}번째 활동` });
        input.addEventListener('input', () => { item.text = input.value; touch(); });
        items.append(el('div', { class: 'item', 'data-li': String(li), 'data-ii': String(ii) },
          handle('활동', (e) => startDrag(e, { type: 'item', li, ii })),
          input,
          el('div', { class: 'tools' },
            el('button', {
              class: 'icon-btn del', text: '✕', title: '활동 삭제', 'aria-label': '활동 삭제',
              onclick: async () => {
                const ok = await confirmDelete('활동 삭제', `"${item.text || '활동'}"을(를) 지울까요?\n저장하면 모든 반의 이 활동 체크도 함께 지워져요.`);
                if (!ok) return;
                lesson.items.splice(ii, 1);
                touch();
                render();
              },
            }))));
      });
      const add = el('button', {
        class: 'btn pill-btn add-item', text: '+ 활동',
        onclick: () => { lesson.items.push({ text: '' }); focusAfter = `item${li}_${lesson.items.length - 1}`; touch(); render(); },
      });
      box.append(el('div', { class: 'lesson', 'data-li': String(li) }, head, items, add));
    });
    box.append(indicator);
    const total = plan.reduce((s, l) => s + l.items.length, 0);
    $('summary').textContent = `차시 ${plan.length}개 · 활동 ${total}개 · ⠿를 끌어서 순서를 바꿀 수 있어요`;
    window.panelReport();
    if (focusAfter) {
      const f = $(focusAfter);
      focusAfter = null;
      if (f) { f.focus(); f.scrollIntoView({ block: 'nearest' }); }
    }
  }

  // ── 끌어서 옮기기 ──
  function startDrag(e, src) {
    if (e.button !== 0) return;
    e.preventDefault();
    const node = src.type === 'lesson'
      ? box.querySelector(`.lesson[data-li="${src.li}"]`)
      : box.querySelector(`.item[data-li="${src.li}"][data-ii="${src.ii}"]`);
    node.classList.add('dragging');
    document.body.classList.add('is-dragging');
    drag = { src, node, target: null, pointerId: e.pointerId, lastY: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.addEventListener('pointermove', onMove);
    e.currentTarget.addEventListener('pointerup', onUp);
    e.currentTarget.addEventListener('pointercancel', cancelDrag);
    onMove(e);
  }

  function showLine(top, left, width) {
    const base = box.getBoundingClientRect();
    indicator.hidden = false;
    // 맨 위·맨 아래 자리도 스크롤 영역 밖으로 잘리지 않게 안쪽으로 맞춤
    const rel = Math.max(1, Math.min(top - base.top - 2, base.height - 5));
    indicator.style.top = `${rel}px`;
    indicator.style.left = `${left - base.left}px`;
    indicator.style.width = `${width}px`;
  }

  // 마우스 위치에서 끼워 넣을 자리 찾기
  function findTarget(y) {
    const cards = [...box.querySelectorAll('.lesson')];
    if (drag.src.type === 'lesson') {
      let index = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) { index = i; break; }
      }
      const ref = cards[Math.min(index, cards.length - 1)].getBoundingClientRect();
      const lineY = index < cards.length ? ref.top - 6 : ref.bottom + 6;
      return { index, line: [lineY, ref.left, ref.width] };
    }
    // 활동: 마우스가 있는(또는 가장 가까운) 차시 안에서
    let li = 0;
    let best = Infinity;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (d < best) { best = d; li = i; }
    });
    const rows = [...cards[li].querySelectorAll('.item')];
    const itemsBox = cards[li].querySelector('.items').getBoundingClientRect();
    if (!rows.length) return { li, index: 0, line: [itemsBox.top + itemsBox.height / 2, itemsBox.left, itemsBox.width] };
    let index = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) { index = i; break; }
    }
    const ref = rows[Math.min(index, rows.length - 1)].getBoundingClientRect();
    const lineY = index < rows.length ? ref.top - 3 : ref.bottom + 3;
    return { li, index, line: [lineY, ref.left, ref.width] };
  }

  let scrollTimer = 0;
  function autoScroll() {
    if (!drag) { scrollTimer = 0; return; }
    const r = scroller.getBoundingClientRect();
    const edge = 40;
    let dy = 0;
    if (drag.lastY < r.top + edge) dy = -Math.ceil((r.top + edge - drag.lastY) / 4);
    else if (drag.lastY > r.bottom - edge) dy = Math.ceil((drag.lastY - (r.bottom - edge)) / 4);
    if (dy) {
      scroller.scrollTop += dy;
      updateTarget();
      scrollTimer = requestAnimationFrame(autoScroll);
    } else scrollTimer = 0;
  }

  function updateTarget() {
    drag.target = findTarget(drag.lastY);
    showLine(...drag.target.line);
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.lastY = e.clientY;
    updateTarget();
    if (!scrollTimer) scrollTimer = requestAnimationFrame(autoScroll);
  }

  function endDrag(handleEl) {
    if (handleEl) {
      handleEl.removeEventListener('pointermove', onMove);
      handleEl.removeEventListener('pointerup', onUp);
      handleEl.removeEventListener('pointercancel', cancelDrag);
    }
    if (drag) drag.node.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    indicator.hidden = true;
    drag = null;
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { src, target } = drag;
    endDrag(e.currentTarget);
    if (!target) return;
    if (src.type === 'lesson') {
      let to = target.index;
      if (to > src.li) to -= 1;
      if (to === src.li) return;
      const [moved] = plan.splice(src.li, 1);
      plan.splice(to, 0, moved);
    } else {
      let to = target.index;
      if (target.li === src.li && to > src.ii) to -= 1;
      if (target.li === src.li && to === src.ii) return;
      const [moved] = plan[src.li].items.splice(src.ii, 1);
      plan[target.li].items.splice(to, 0, moved); // 다른 차시로 옮겨도 체크는 활동을 따라감
    }
    touch();
    render();
  }

  function cancelDrag(e) {
    endDrag(e && e.currentTarget);
  }

  $('addLesson').addEventListener('click', () => {
    plan.push({ name: `${plan.length + 1}차시`, items: [] });
    focusAfter = `lesson${plan.length - 1}`;
    touch();
    render();
  });

  $('save').addEventListener('click', async () => {
    $('save').disabled = true;
    const ok = await api.invoke('plan:save', plan);
    if (!ok) $('save').disabled = false;
  });

  async function close() {
    if (drag) { endDrag(null); return; } // 끄는 중 Esc는 취소만
    if (dirty) {
      const ok = await api.invoke('plan:confirm', { title: '수업 계획 설정', message: '바꾼 내용을 저장하지 않고 닫을까요?', yes: '저장하지 않고 닫기', no: '계속 고치기' });
      if (!ok) return;
    }
    api.send('plan:close');
  }
  $('close').addEventListener('click', close);
  $('x').addEventListener('click', close);
  window.panelEscape = close;

  await document.fonts.ready;
  render();
})();
