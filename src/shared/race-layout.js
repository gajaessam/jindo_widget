// 진도율 → 트랙 위 위치. 겹치는 반만 필요한 만큼 띄우고, 진도 순서는 바꾸지 않습니다.
// (기존 Python calculate_race_positions와 같은 계산) Node와 화면(브라우저) 양쪽에서 씁니다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.raceLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return function raceLayout(progressValues, start, length, maxGap) {
    if (maxGap === undefined) maxGap = 72;
    const count = progressValues.length;
    const result = new Array(count);
    if (!count) return result;
    length = Math.max(0, Number(length));
    const end = start + length;
    const gap = Math.min(maxGap, length / Math.max(1, count - 1));
    const order = progressValues.map((_, idx) => idx).sort((a, b) => progressValues[a] - progressValues[b] || a - b);
    let pos = order.map((idx) => start + (length * Math.max(0, Math.min(100, progressValues[idx]))) / 100);
    for (let i = 1; i < count; i++) pos[i] = Math.max(pos[i], pos[i - 1] + gap);
    pos[count - 1] = Math.min(pos[count - 1], end);
    for (let i = count - 2; i >= 0; i--) pos[i] = Math.min(pos[i], pos[i + 1] - gap);
    if (pos[0] < start) {
      const shift = start - pos[0];
      pos = pos.map((x) => Math.min(end, x + shift));
      for (let i = count - 2; i >= 0; i--) pos[i] = Math.min(pos[i], pos[i + 1] - gap);
    }
    order.forEach((idx, rank) => {
      result[idx] = Math.max(start, Math.min(end, pos[rank]));
    });
    return result;
  };
});
