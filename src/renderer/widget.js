const {
  addDays, analyze, buildSpeech, chooseDefault, dayLabel, pickLine, plainName, toggleTaste, ymd,
} = window.MealLogic;

const VIEW_DAYS = 7;
const CLICK_DISTANCE = 4;
const IDLE_LINE_MS = 4000;
const AWAKE_MS = 8000;
const $ = (id) => document.getElementById(id);

let state = null;
let images = {};
let view = { date: null, code: null };
let lastDefaultKey = null;
let currentDay = ymd(new Date());
let idleLine = null;
let idleTimer = null;
let awakeTimer = null;
let announcedVersion = null;
let updateHidden = false;

const keyOf = (target) => `${target.date}/${target.code}`;

function dayOffset(date) {
  const today = new Date();
  return Array.from({ length: VIEW_DAYS }, (_, i) => ymd(addDays(today, i))).indexOf(date);
}

function followDefault() {
  const next = chooseDefault(new Date(), state.meals, VIEW_DAYS);
  if (keyOf(next) !== lastDefaultKey) {
    lastDefaultKey = keyOf(next);
    view = next;
  }
}

function selectDate(date) {
  const meals = state.meals[date] || [];
  const same = meals.find((meal) => meal.code === view.code);
  const lunch = meals.find((meal) => meal.code === '2');
  view = { date, code: (same || lunch || meals[0] || { code: null }).code };
  closeNutrition();
  render();
}

// 다른 날짜나 끼니를 보면 그 식단 안내가 바로 보이도록 클릭 대사를 지운다.
function closeNutrition() {
  $('nutrition').hidden = true;
  clearSaying();
}

function clearSaying() {
  idleLine = null;
  clearTimeout(idleTimer);
}

function renderChips(meals) {
  $('chips').replaceChildren(...meals.map((meal) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = meal.name;
    chip.setAttribute('aria-pressed', String(meal.code === view.code));
    chip.addEventListener('click', () => {
      view = { date: view.date, code: meal.code };
      closeNutrition();
      render();
    });
    return chip;
  }));
}

function say(text) {
  idleLine = text;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleLine = null;
    render();
  }, IDLE_LINE_MS);
  render();
}

async function markTaste(dish, kind) {
  const { settings } = state;
  const adding = !(kind === 'favorites' ? dish.favorite : dish.disliked);
  await window.api.updateSettings(toggleTaste(settings, dish.name, kind));
  if (adding) {
    const situation = kind === 'favorites' ? 'markFavorite' : 'markDisliked';
    say(pickLine(settings.tone, situation, Math.random(), { menu: plainName(dish.name) }));
  }
}

function tasteButton(dish, kind, symbol, label, pressed) {
  const button = document.createElement('button');
  button.className = `taste taste-${kind}`;
  button.textContent = symbol;
  button.title = label;
  button.setAttribute('aria-label', `${dish.name} ${label}`);
  button.setAttribute('aria-pressed', String(pressed));
  button.addEventListener('click', () => markTaste(dish, kind));
  return button;
}

function renderDishes(dishes) {
  $('dishes').replaceChildren(...dishes.map((dish) => {
    const item = document.createElement('li');
    item.className = 'dish';
    item.classList.toggle('is-allergy', dish.allergyHits.length > 0);
    item.classList.toggle('is-favorite', dish.favorite && !dish.allergyHits.length);
    item.classList.toggle('is-disliked', dish.disliked);
    const name = document.createElement('span');
    name.className = 'dish-name';
    name.textContent = dish.name;
    item.append(name);
    if (dish.allergyHits.length) {
      const tag = document.createElement('span');
      tag.className = 'dish-tag';
      tag.textContent = `⚠ ${dish.allergyHits.join(', ')}`;
      item.append(tag);
    }
    const actions = document.createElement('span');
    actions.className = 'dish-actions';
    actions.append(
      tasteButton(dish, 'favorites', '♥', '좋아하는 메뉴', dish.favorite),
      tasteButton(dish, 'dislikes', '✕', '싫어하는 메뉴', dish.disliked),
    );
    item.append(actions);
    return item;
  }));
}

function renderNutrition(meal) {
  const kcal = $('kcal');
  kcal.hidden = !meal || !meal.calories;
  kcal.textContent = meal ? meal.calories : '';
  $('nutrition').replaceChildren(...(meal ? meal.nutrition : []).flatMap(({ label, value }) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    return [term, detail];
  }));
}

function renderUpdate() {
  const { update } = state;
  $('update').hidden = !update || !update.announce || updateHidden;
  if (!update) return;
  $('updateTitle').textContent = `새 버전 v${update.version} 준비 완료`;
  $('updateNotes').textContent = update.notes;
  $('updateNotes').hidden = !update.notes;
}

// 새 버전을 다 받았으면 캐릭터가 한 번 알려준다.
function announceUpdate() {
  const { update } = state;
  if (!update || !update.announce || update.version === announcedVersion) return;
  announcedVersion = update.version;
  updateHidden = false;
  $('bubble').hidden = false;
  wake();
  say(pickLine(state.settings.tone, 'updateReady', Math.random(), { version: `v${update.version}` }));
}

function renderStatus() {
  const status = $('status');
  const text = state.error && state.updatedAt
    ? pickLine(state.settings.tone, 'offline', view.date)
    : state.error
      ? `식단을 불러오지 못했어요. (${state.error})`
      : '';
  status.hidden = !text;
  status.textContent = text;
}

// 캐릭터를 잠깐 움직이게 한다. 평소에는 CPU를 아끼려고 멈춰 둔다.
function wake() {
  $('character').classList.add('awake');
  clearTimeout(awakeTimer);
  awakeTimer = setTimeout(() => $('character').classList.remove('awake'), AWAKE_MS);
}

function setMood(mood) {
  const character = $('character');
  if (character.dataset.mood !== mood) wake();
  character.dataset.mood = mood;
  const src = images[mood] || images.default;
  const image = $('characterImage');
  image.hidden = !src;
  $('characterDefault').toggleAttribute('hidden', Boolean(src));
  if (src && image.getAttribute('src') !== src) image.src = src;
}

function render() {
  const now = new Date();
  const { settings } = state;
  $('root').style.zoom = settings.scale;
  const hasSchool = Boolean(settings.school);
  const meals = state.meals[view.date] || [];
  const meal = meals.find((item) => item.code === view.code) || null;
  const dishes = meal ? analyze(meal, settings) : [];
  const offset = dayOffset(view.date);

  $('dayLabel').textContent = dayLabel(view.date, now);
  $('prevDay').disabled = !hasSchool || offset <= 0;
  $('nextDay').disabled = !hasSchool || offset < 0 || offset >= VIEW_DAYS - 1;
  renderChips(meals);
  renderDishes(dishes);
  renderNutrition(meal);
  renderStatus();
  renderUpdate();

  if (!hasSchool) {
    $('speech').textContent = pickLine(settings.tone, 'noSchool', 'setup');
    setMood('default');
    return;
  }
  if (state.loading && !Object.keys(state.meals).length) {
    $('speech').textContent = '식단을 가져오는 중이에요...';
    setMood('default');
    return;
  }
  // 받아오지 못한 날을 "급식 없는 날"로 안내하면 안 된다.
  if (state.error && !(view.date in state.meals)) {
    $('speech').textContent = pickLine(settings.tone, 'loadFailed', view.date);
    setMood('sad');
    return;
  }
  const speech = buildSpeech({
    meal,
    dishes,
    tone: settings.tone,
    when: dayLabel(view.date, now),
    now,
    date: view.date,
    schedule: state.schedule,
    grade: settings.grade,
  });
  $('speech').textContent = idleLine || speech.text;
  setMood(speech.mood);
}

function poke() {
  const character = $('character');
  character.classList.remove('poke');
  void character.offsetWidth; // 애니메이션을 처음부터 다시 재생한다.
  character.classList.add('poke');
  wake();

  if (!state.settings.school) {
    window.api.openSettings();
    return;
  }
  $('bubble').hidden = false;
  say(pickLine(state.settings.tone, 'idle', Math.random()));
}

function setupCharacterInput() {
  const character = $('character');
  let start = null;

  character.addEventListener('pointerenter', wake);
  character.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    start = { x: event.screenX, y: event.screenY, moved: false };
    character.setPointerCapture(event.pointerId);
    window.api.dragStart();
  });
  character.addEventListener('pointermove', (event) => {
    if (!start) return;
    const dx = event.screenX - start.x;
    const dy = event.screenY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < CLICK_DISTANCE) return;
    start.moved = true;
    character.classList.add('dragging');
    window.api.dragMove(dx, dy);
  });
  const finish = (clicked) => {
    if (!start) return;
    const wasClick = clicked && !start.moved;
    start = null;
    character.classList.remove('dragging');
    window.api.dragEnd();
    if (wasClick) poke();
  };
  character.addEventListener('pointerup', () => finish(true));
  character.addEventListener('pointercancel', () => finish(false));
  character.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.api.openWidgetMenu();
  });
  character.addEventListener('animationend', () => character.classList.remove('poke'));
}

// 투명한 빈 공간은 클릭이 뒤쪽 창으로 통과하게 한다.
function setupClickThrough() {
  let ignoring = true;
  document.addEventListener('mousemove', (event) => {
    if (event.buttons) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const solid = Boolean(target && target.closest('.bubble, .character'));
    if (solid === ignoring) {
      ignoring = !solid;
      window.api.setIgnoreMouse(ignoring);
    }
  });
}

function setupControls() {
  const move = (delta) => selectDate(ymd(addDays(new Date(), dayOffset(view.date) + delta)));
  $('prevDay').addEventListener('click', () => move(-1));
  $('nextDay').addEventListener('click', () => move(1));
  $('closeBubble').addEventListener('click', () => { $('bubble').hidden = true; });
  $('kcal').addEventListener('click', () => { $('nutrition').hidden = !$('nutrition').hidden; });
  $('updateNow').addEventListener('click', () => window.api.installUpdate());
  $('updateLater').addEventListener('click', () => {
    updateHidden = true;
    render();
  });
}

function tick() {
  const today = ymd(new Date());
  if (today !== currentDay) {
    currentDay = today;
    window.api.refresh();
  }
  followDefault();
  render();
}

async function init() {
  setupCharacterInput();
  setupClickThrough();
  setupControls();
  new ResizeObserver(() => {
    window.api.setWidgetHeight($('root').getBoundingClientRect().height);
  }).observe($('root'));

  window.api.onStateChanged((next) => {
    state = next;
    followDefault();
    render();
    announceUpdate();
  });
  window.api.onCharactersChanged((next) => {
    images = next;
    render();
  });
  // 아이콘을 다시 눌렀을 때 "여기 있어" 하고 알려준다.
  window.api.onHello(() => {
    if (!state || !state.settings.school) return;
    $('bubble').hidden = false;
    wake();
    say(pickLine(state.settings.tone, 'idle', Math.random()));
  });

  [state, images] = await Promise.all([window.api.getState(), window.api.getCharacters()]);
  followDefault();
  render();
  setInterval(tick, 30000);
}

init();
