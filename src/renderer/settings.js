const { ALLERGENS, tones } = window.MealLogic;

const REGIONS = [
  ['', '전체 지역'], ['B10', '서울'], ['C10', '부산'], ['D10', '대구'], ['E10', '인천'], ['F10', '광주'],
  ['G10', '대전'], ['H10', '울산'], ['I10', '세종'], ['J10', '경기'], ['K10', '강원'], ['M10', '충북'],
  ['N10', '충남'], ['P10', '전북'], ['Q10', '전남'], ['R10', '경북'], ['S10', '경남'], ['T10', '제주'],
];
const MOODS = [['default', '기본'], ['happy', '기쁨'], ['sad', '슬픔'], ['sleepy', '졸림']];
const $ = (id) => document.getElementById(id);

let settings = null;

const save = async (patch) => { settings = await window.api.updateSettings(patch); };
const splitWords = (text) => text.split(/[,，、\n]/).map((word) => word.trim()).filter(Boolean);

function option(value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

function renderSchool() {
  const { school } = settings;
  $('currentSchool').textContent = school
    ? `${school.name} (${school.address})`
    : '학교를 검색해서 선택해 주세요.';
}

function renderGrades() {
  const count = !settings.school || /초등|특수/.test(settings.school.kind) ? 6 : 3;
  const options = [option('0', '선택 안 함')];
  for (let grade = 1; grade <= count; grade++) options.push(option(String(grade), `${grade}학년`));
  $('grade').replaceChildren(...options);
  $('grade').value = String(settings.grade <= count ? settings.grade : 0);
}

function showHint(text, isError = false) {
  const hint = $('schoolHint');
  hint.hidden = !text;
  hint.textContent = text;
  hint.classList.toggle('error', isError);
}

function renderResults(schools) {
  $('schoolResults').replaceChildren(...schools.map((school) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = school.name;
    const detail = document.createElement('small');
    detail.textContent = `${school.kind} · ${school.address}`;
    button.append(detail);
    button.addEventListener('click', async () => {
      await save({ school });
      renderSchool();
      renderGrades();
      renderResults([]);
      showHint('');
      $('schoolName').value = '';
    });
    item.append(button);
    return item;
  }));
}

async function searchSchools(event) {
  event.preventDefault();
  const name = $('schoolName').value.trim();
  if (!name) return;
  showHint('찾는 중이에요...');
  renderResults([]);
  try {
    const { schools, total } = await window.api.searchSchools(name, $('region').value);
    renderResults(schools);
    if (!total) showHint('찾는 학교가 없어요. 이름을 줄이거나 지역을 바꿔 보세요.');
    else if (total > schools.length) {
      showHint(`${total}개 중 ${schools.length}개만 보여요. 지역을 고르거나 이름을 더 자세히 적어 보세요.`);
    } else showHint('');
  } catch {
    showHint('학교를 검색하지 못했어요. 인터넷 연결을 확인해 주세요.', true);
  }
}

function renderCharacters(images) {
  $('characters').replaceChildren(...MOODS.map(([mood, label]) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    const name = document.createElement('span');
    name.className = 'slot-name';
    name.textContent = label;
    const preview = document.createElement('div');
    preview.className = 'preview';
    if (images[mood]) {
      const image = document.createElement('img');
      image.src = images[mood];
      image.alt = `${label} 캐릭터`;
      preview.append(image);
    } else {
      preview.textContent = '비어 있음';
    }
    const pick = document.createElement('button');
    pick.textContent = images[mood] ? '바꾸기' : '넣기';
    pick.addEventListener('click', async () => {
      const result = await window.api.pickCharacter(mood);
      if (result.message) alert(result.message);
    });
    slot.append(name, preview, pick);
    if (images[mood]) {
      const remove = document.createElement('button');
      remove.textContent = '삭제';
      remove.addEventListener('click', () => window.api.removeCharacter(mood));
      slot.append(remove);
    }
    return slot;
  }));
}

function renderAllergies() {
  $('allergies').replaceChildren(...Object.entries(ALLERGENS).map(([number, label]) => {
    const row = document.createElement('label');
    row.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = settings.allergies.includes(Number(number));
    input.addEventListener('change', () => {
      const next = new Set(settings.allergies);
      if (input.checked) next.add(Number(number));
      else next.delete(Number(number));
      save({ allergies: [...next] });
    });
    row.append(input, ` ${label}`);
    return row;
  }));
}

function bindFields(isPackaged) {
  $('tone').value = settings.tone;
  $('tone').addEventListener('change', () => save({ tone: $('tone').value }));

  for (const key of ['favorites', 'dislikes']) {
    $(key).value = settings[key].join(', ');
    $(key).addEventListener('change', () => save({ [key]: splitWords($(key).value) }));
  }

  $('alwaysOnTop').checked = settings.alwaysOnTop;
  $('alwaysOnTop').addEventListener('change', () => save({ alwaysOnTop: $('alwaysOnTop').checked }));

  $('autoStart').checked = settings.autoStart;
  $('autoStart').disabled = !isPackaged;
  $('autoStartHint').hidden = isPackaged;
  $('autoStart').addEventListener('change', () => save({ autoStart: $('autoStart').checked }));

  for (const key of ['scale', 'opacity']) {
    const show = () => { $(`${key}Value`).textContent = `${Math.round($(key).value * 100)}%`; };
    $(key).value = settings[key];
    show();
    $(key).addEventListener('input', () => {
      show();
      save({ [key]: Number($(key).value) });
    });
  }
}

async function init() {
  const [state, images] = await Promise.all([window.api.getState(), window.api.getCharacters()]);
  settings = state.settings;

  $('region').append(...REGIONS.map(([value, label]) => option(value, label)));
  $('tone').append(...Object.entries(tones).map(([value, label]) => option(value, label)));
  $('schoolForm').addEventListener('submit', searchSchools);

  $('appVersion').textContent = `급식알리미 v${state.version}`;
  $('openHelp').addEventListener('click', () => window.api.openHelp());
  renderSchool();
  renderGrades();
  $('grade').addEventListener('change', () => save({ grade: Number($('grade').value) }));
  renderCharacters(images);
  renderAllergies();
  bindFields(state.isPackaged);
  window.api.onCharactersChanged(renderCharacters);
  // 위젯에서 찜한 메뉴를 열려 있는 설정 창에도 반영한다.
  window.api.onStateChanged(({ settings: next }) => {
    settings = next;
    for (const key of ['favorites', 'dislikes']) {
      if (document.activeElement !== $(key)) $(key).value = next[key].join(', ');
    }
  });
  if (!settings.school) $('schoolName').focus();
}

init();
