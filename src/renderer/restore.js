'use strict';
(async function () {
  const $ = (id) => document.getElementById(id);
  const api = window.jindo;
  const entries = await api.invoke('restore:list');
  let selected = null;

  function render() {
    const list = $('list');
    list.replaceChildren();
    entries.forEach((e) => {
      const b = el('button', { class: 'entry', role: 'radio', 'aria-checked': String(selected === e.name) },
        el('span', { class: 'dot' }),
        el('span', null,
          el('span', { class: 'when', text: e.savedText }),
          e.beforeRestore ? el('span', { class: 'tag', text: '복원 직전' }) : null,
          el('div', { class: 'info', text: `${e.classes}개 반 · 활동 ${e.activities}개 · 체크 ${e.checks}개` })));
      b.addEventListener('click', () => { selected = e.name; render(); });
      b.addEventListener('dblclick', () => { selected = e.name; run(); });
      list.append(b);
    });
    $('empty').hidden = entries.length > 0;
    $('run').disabled = !selected;
    window.panelReport();
  }

  async function run() {
    if (!selected) return;
    $('run').disabled = true;
    const ok = await api.invoke('restore:run', selected);
    if (!ok) $('run').disabled = false;
  }

  $('run').addEventListener('click', run);
  const close = () => api.send('restore:close');
  $('close').addEventListener('click', close);
  $('x').addEventListener('click', close);
  window.panelEscape = close;

  await document.fonts.ready;
  render();
})();
