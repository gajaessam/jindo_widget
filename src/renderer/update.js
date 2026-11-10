const $ = (id) => document.getElementById(id);

const STATE_TEXT = {
  idle: () => '아직 확인하지 않았어요.',
  checking: () => '새 버전을 확인하는 중이에요...',
  downloading: (s) => `새 버전 v${s.version} 받는 중이에요 (${s.percent || 0}%)`,
  latest: () => '최신 버전을 쓰고 있어요.',
  ready: (s) => `새 버전 v${s.version} 준비 완료! 지금 설치할 수 있어요.`,
  error: () => '확인하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.',
  dev: () => '개발 실행에서는 업데이트를 확인하지 않아요.',
};

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
}

function render(state) {
  const status = state.updateStatus || { state: 'idle' };
  $('currentVersion').textContent = `v${state.version}`;
  $('state').textContent = (STATE_TEXT[status.state] || STATE_TEXT.idle)(status);
  $('state').className = `state ${status.state}`;

  const downloading = status.state === 'downloading';
  $('bar').hidden = !downloading;
  $('barFill').style.width = `${downloading ? status.percent || 0 : 0}%`;

  // 새 버전을 받았을 때만 이번에 달라진 점을 한 줄로 보여준다.
  const notes = status.state === 'ready' && state.update ? state.update.notes : '';
  $('news').hidden = !notes;
  $('news').textContent = notes ? `이번에 달라진 점: ${notes}` : '';

  const showTime = status.at && ['latest', 'error', 'ready'].includes(status.state);
  $('checkedAt').hidden = !showTime;
  if (showTime) $('checkedAt').textContent = `마지막 확인: ${formatTime(status.at)}`;

  $('checkNow').disabled = ['checking', 'downloading', 'ready', 'dev'].includes(status.state);
  $('installNow').hidden = status.state !== 'ready';
}

async function init() {
  $('checkNow').addEventListener('click', () => window.api.checkUpdate());
  $('installNow').addEventListener('click', () => window.api.installUpdate());
  window.api.onStateChanged(render);
  render(await window.api.getState());
}

init();
