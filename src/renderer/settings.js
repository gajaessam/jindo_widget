'use strict';
(async function () {
  const $ = (id) => document.getElementById(id);
  const api = window.jindo;
  let draft = await api.invoke('settings:get');
  if (!draft) return;
  const thumbs = new Map(); // 파일 경로 → blob URL

  async function thumbFor(file, box) {
    box.replaceChildren();
    if (!file) { box.textContent = '+'; return; }
    let url = thumbs.get(file);
    if (!url) {
      const res = await api.invoke('settings:image', file);
      if (!res) { box.textContent = '!'; box.title = '이미지 파일을 찾을 수 없어요'; return; }
      url = URL.createObjectURL(new Blob([res.bytes], { type: res.mime }));
      thumbs.set(file, url);
    }
    box.replaceChildren(el('img', { src: url, alt: '' }));
  }

  function renderList() {
    const list = $('list');
    list.replaceChildren();
    draft.classes.forEach((cls, i) => {
      const thumb = el('div', { class: 'thumb' });
      const input = el('input', { type: 'text', id: `name${i}`, value: cls.name, maxlength: '40', 'aria-label': `${i + 1}번째 반 이름` });
      input.addEventListener('input', async () => { draft = await api.invoke('settings:update', { index: i, name: input.value }); });
      const pick = el('button', { class: 'btn pill-btn', text: '이미지 선택', onclick: async () => { draft = await api.invoke('settings:pick-image', i); renderList(); } });
      const clear = el('button', { class: 'icon-btn', text: '✕', title: '이미지 삭제', 'aria-label': `${cls.name} 이미지 삭제`, onclick: async () => { draft = await api.invoke('settings:update', { index: i, clearImage: true }); renderList(); } });
      clear.disabled = !cls.custom_image;
      list.append(el('div', { class: 'cls' }, thumb, input, el('div', { class: 'acts' }, pick, clear)));
      thumbFor(cls.custom_image, thumb);
    });
    $('count').textContent = `${draft.count}개`;
    $('minus').disabled = draft.count <= 1;
    $('plus').disabled = draft.count >= 20;
    window.panelReport();
  }

  function renderOptions() {
    $('scale').value = draft.scale;
    $('scaleVal').textContent = `${draft.scale}%`;
    $('floatOn').setAttribute('aria-pressed', String(draft.float));
    $('floatOff').setAttribute('aria-pressed', String(!draft.float));
    $('labels').setAttribute('aria-checked', String(draft.labels));
  }

  async function update(patch, rerenderList) {
    draft = await api.invoke('settings:update', patch);
    renderOptions();
    if (rerenderList) renderList();
  }

  $('minus').addEventListener('click', () => update({ count: draft.count - 1 }, true));
  $('plus').addEventListener('click', () => update({ count: draft.count + 1 }, true));
  $('scale').addEventListener('input', () => { $('scaleVal').textContent = `${$('scale').value}%`; update({ scale: Number($('scale').value) }); });
  $('floatOn').addEventListener('click', () => update({ float: true }));
  $('floatOff').addEventListener('click', () => update({ float: false }));
  $('labels').addEventListener('click', () => update({ labels: !draft.labels }));
  $('save').addEventListener('click', async () => {
    $('save').disabled = true;
    const ok = await api.invoke('settings:save');
    if (!ok) $('save').disabled = false;
  });
  const close = () => api.send('settings:close');
  $('close').addEventListener('click', close);
  $('x').addEventListener('click', close);
  window.panelEscape = close;

  await document.fonts.ready;
  renderOptions();
  renderList();
})();
