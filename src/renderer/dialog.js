'use strict';
// 앱 모양에 맞춘 알림·확인·입력 창. 내용을 다 그린 뒤 크기를 알려 주면 main이 그때 창을 보여 줍니다.
(async function () {
  const opts = await window.jindoDialog.options();
  const $ = (id) => document.getElementById(id);
  document.title = opts.title || '진도 위젯';
  $('title').textContent = opts.title || '진도 위젯';
  $('message').textContent = opts.message || '';
  $('message').hidden = !opts.message;
  if (opts.detail) { $('detail').hidden = false; $('detail').textContent = opts.detail; }

  const input = $('input');
  if (opts.input) {
    $('field').hidden = false;
    $('inputLabel').textContent = opts.input.label || '';
    input.value = opts.input.value || '';
    input.placeholder = opts.input.placeholder || '';
  }

  const buttons = opts.buttons && opts.buttons.length ? opts.buttons : [{ label: '확인', kind: 'primary' }];
  const cancelIndex = Number.isInteger(opts.cancelIndex) ? opts.cancelIndex : -1;
  let done = false;
  function finish(index) {
    if (done) return;
    if (opts.input && index >= 0 && buttons[index].kind !== 'ghost') {
      const value = input.value.trim();
      if (!value && !opts.input.allowEmpty) {
        $('error').hidden = false;
        $('error').textContent = '내용을 적어 주세요.';
        resize();
        input.focus();
        return;
      }
      done = true;
      window.jindoDialog.result({ index, value });
      return;
    }
    done = true;
    window.jindoDialog.result({ index, value: null });
  }

  buttons.forEach((b, i) => {
    const el = document.createElement('button');
    el.className = `btn ${b.kind || ''}`.trim();
    el.textContent = b.label;
    el.addEventListener('click', () => finish(i));
    $('buttons').appendChild(el);
  });
  $('close').addEventListener('click', () => finish(cancelIndex));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(cancelIndex); }
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const primary = buttons.findIndex((b) => b.kind === 'primary' || b.kind === 'danger');
      finish(primary >= 0 ? primary : 0);
    }
  });

  function resize() {
    const rect = document.body.getBoundingClientRect();
    window.jindoDialog.ready(Math.ceil(rect.height));
  }
  await document.fonts.ready;
  resize();
  requestAnimationFrame(() => {
    if (opts.input) { input.focus(); input.select(); }
    else {
      const btns = $('buttons').querySelectorAll('button');
      const primary = buttons.findIndex((b) => b.kind === 'primary' || b.kind === 'danger');
      (btns[primary >= 0 ? primary : 0] || btns[0]).focus();
    }
  });
})();
