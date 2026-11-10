'use strict';
(async function () {
  const api = window.jindoMenu;
  const opts = await api.options();
  const menu = document.getElementById('menu');
  if (opts.heading) {
    const h = document.createElement('div');
    h.className = 'head';
    h.textContent = opts.heading;
    menu.appendChild(h);
  }
  for (const it of opts.items) {
    if (it.sep) { menu.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.setAttribute('role', it.type === 'check' ? 'menuitemcheckbox' : 'menuitem');
    const label = document.createElement('span');
    label.textContent = it.label;
    b.appendChild(label);
    if (it.type === 'check') {
      b.setAttribute('aria-checked', String(Boolean(it.checked)));
      const c = document.createElement('span');
      c.className = 'check';
      c.textContent = '✓';
      b.appendChild(c);
    }
    if (it.danger) b.classList.add('danger');
    b.disabled = Boolean(it.disabled);
    b.addEventListener('click', () => api.choose(it.id));
    menu.appendChild(b);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); api.choose(null); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const btns = [...menu.querySelectorAll('button:not(:disabled)')];
      const i = btns.indexOf(document.activeElement);
      const n = btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length];
      if (n) n.focus();
    }
  });
  window.addEventListener('blur', () => api.choose(null));
  await document.fonts.ready;
  const r = document.body.getBoundingClientRect();
  api.ready(Math.ceil(r.width), Math.ceil(r.height));
})();
