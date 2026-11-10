'use strict';
(async function () {
  const api = window.jindo;
  const mb = (n) => (n / 1048576).toFixed(1);
  function show(p) {
    if (!p || !p.total) return;
    const pct = Math.min(100, Math.floor((p.received / p.total) * 100));
    document.getElementById('title').textContent = `v${p.version} 내려받는 중`;
    document.getElementById('fill').style.width = `${pct}%`;
    document.getElementById('info').textContent = `${pct}% · ${mb(p.received)}MB / ${mb(p.total)}MB`;
  }
  api.on('update:progress', show);
  document.getElementById('cancel').addEventListener('click', () => api.send('update:cancel'));
  window.panelEscape = () => api.send('update:cancel');
  show(await api.invoke('update:get'));
  await document.fonts.ready;
  window.panelReport();
})();
