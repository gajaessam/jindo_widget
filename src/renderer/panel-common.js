'use strict';
// 설정 창 공통 도우미
(function () {
  // 내용의 실제 높이를 재서 main에 알립니다. main이 창 크기를 맞춘 뒤 처음 한 번 보여 줍니다.
  let pending = false;
  function report() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const body = document.body;
      body.style.maxHeight = 'none';
      const h = Math.ceil(body.getBoundingClientRect().height);
      body.style.maxHeight = '100vh';
      window.jindo.ready(h);
    });
  }
  window.panelReport = report;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented && typeof window.panelEscape === 'function') {
      e.preventDefault();
      window.panelEscape();
    }
  });
  window.el = function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else if (v !== false && v != null) node.setAttribute(k, v);
      }
    }
    for (const c of children) if (c != null) node.append(c);
    return node;
  };
})();
