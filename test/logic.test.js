const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDishes, parseNutrition, analyze, chooseDefault, buildSpeech, mainDish, dayLabel, ymd, normalize, toggleTaste,
  classifyEvent, eventApplies, scheduleContext,
} = require('../src/shared/logic.js');
const LINES = require('../src/shared/lines.js');
const { sanitize } = require('../src/main/store.js');
const { createNeisClient } = require('../src/main/neis.js');

const prefs = (extra = {}) => ({ favorites: [], dislikes: [], allergies: [], ...extra });
const meal = (code, ...dishes) => ({ code, dishes: dishes.map((name) => ({ name, allergens: [] })) });

test('실제 나이스 형식의 메뉴를 이름과 알레르기로 나눈다', () => {
  const raw = '*발아현미밥 <br/>미니생크림케이크 (1.2.5.6)<br/>*순대국/양념장(과) (2.5.6.9.10.13.16)<br/>돼지고기메추리알장조림(조)(과학고) (1.5.6.10.13)';
  assert.deepEqual(parseDishes(raw), [
    { name: '발아현미밥', allergens: [] },
    { name: '미니생크림케이크', allergens: [1, 2, 5, 6] },
    { name: '순대국/양념장(과)', allergens: [2, 5, 6, 9, 10, 13, 16] },
    { name: '돼지고기메추리알장조림(조)(과학고)', allergens: [1, 5, 6, 10, 13] },
  ]);
});

test('괄호 없이 숫자만 붙은 표기도 읽는다', () => {
  assert.deepEqual(parseDishes('쌀밥<br/>제육볶음5.6.10.13.<br/>비타민C음료'), [
    { name: '쌀밥', allergens: [] },
    { name: '제육볶음', allergens: [5, 6, 10, 13] },
    { name: '비타민C음료', allergens: [] },
  ]);
});

test('메뉴 이름 안의 괄호와 HTML 엔티티를 망가뜨리지 않는다', () => {
  assert.deepEqual(parseDishes('다시마&amp;파프리카(초장) (5.6)<br/>')[0], {
    name: '다시마&파프리카(초장)', allergens: [5, 6],
  });
});

test('영양 정보를 나눈다', () => {
  assert.deepEqual(parseNutrition('탄수화물(g) : 137.8<br/>단백질(g) : 19.5'), [
    { label: '탄수화물(g)', value: '137.8' },
    { label: '단백질(g)', value: '19.5' },
  ]);
});

test('돈까스와 돈가스를 같은 메뉴로 본다', () => {
  assert.equal(normalize('돈 까스'), normalize('돈가스'));
  const [dish] = analyze(meal('2', '수제돈가스'), prefs({ favorites: ['돈까스'] }));
  assert.equal(dish.favorite, true);
});

test('등록한 알레르기만 표시한다', () => {
  const [dish] = analyze({ dishes: [{ name: '케이크', allergens: [1, 2] }] }, prefs({ allergies: [2, 9] }));
  assert.deepEqual(dish.allergyHits, ['우유']);
});

test('번호가 없어도 메뉴 이름으로 알레르기를 찾는다', () => {
  const hits = (name, allergies) => analyze({ dishes: [{ name, allergens: [] }] }, prefs({ allergies }))[0].allergyHits;
  assert.deepEqual(hits('우유', [2]), ['우유']);
  assert.deepEqual(hits('치즈돈까스', [2, 10]), ['우유', '돼지고기']);
  assert.deepEqual(hits('돈가스', [10]), ['돼지고기']);
  assert.deepEqual(hits('새우튀김', [9]), ['새우']);
  assert.deepEqual(hits('후라이드치킨', [15]), ['닭고기']);
});

test('등록하지 않았거나 다른 재료인 메뉴에는 경고하지 않는다', () => {
  const hits = (name, allergies) => analyze({ dishes: [{ name, allergens: [] }] }, prefs({ allergies }))[0].allergyHits;
  assert.deepEqual(hits('새우튀김', [2]), []);
  assert.deepEqual(hits('땅콩조림', [5]), []);
  assert.deepEqual(hits('굴비구이', [18]), []);
  assert.deepEqual(hits('쌀밥', [13]), []);
});

test('번호와 이름으로 찾은 알레르기를 중복 없이 합친다', () => {
  const dish = { name: '새우튀김', allergens: [1, 9] };
  assert.deepEqual(analyze({ dishes: [dish] }, prefs({ allergies: [9, 1] }))[0].allergyHits, ['난류', '새우']);
});

test('메뉴를 찜하면 끝의 메모를 뺀 이름으로 등록한다', () => {
  assert.deepEqual(toggleTaste(prefs(), '치킨마요덮밥(과)', 'favorites'), { favorites: ['치킨마요덮밥'], dislikes: [] });
  assert.deepEqual(toggleTaste(prefs(), '양상추샐러드(과)&키위D', 'favorites'), { favorites: ['양상추샐러드&키위D'], dislikes: [] });
});

test('메뉴 중간에 메모가 있어도 찜한 메뉴를 알아본다', () => {
  const liked = toggleTaste(prefs(), '샐러드(과)&키위D', 'favorites');
  assert.equal(analyze({ dishes: [{ name: '샐러드(과)&키위D', allergens: [] }] }, prefs(liked))[0].favorite, true);
});

test('찜한 메뉴를 다시 누르면 해제된다', () => {
  assert.deepEqual(toggleTaste(prefs({ favorites: ['돈까스', '치킨'] }), '수제돈가스', 'favorites'), {
    favorites: ['치킨'], dislikes: [],
  });
});

test('좋아요와 싫어요는 동시에 등록되지 않는다', () => {
  assert.deepEqual(toggleTaste(prefs({ dislikes: ['가지'] }), '가지볶음', 'favorites'), {
    favorites: ['가지볶음'], dislikes: [],
  });
  assert.deepEqual(toggleTaste(prefs({ favorites: ['가지볶음'] }), '가지볶음', 'dislikes'), {
    dislikes: ['가지볶음'], favorites: [],
  });
});

test('대표 메뉴에서 밥, 국, 김치, 우유를 건너뛴다', () => {
  const dishes = [{ name: '현미밥' }, { name: '미역국' }, { name: '깍두기' }, { name: '제육볶음' }];
  assert.equal(mainDish(dishes), '제육볶음');
  assert.equal(mainDish([{ name: '쌀밥' }]), '쌀밥');
});

test('스프는 건너뛰고 덮밥은 대표 메뉴로 보며 끝의 메모를 뗀다', () => {
  assert.equal(mainDish([{ name: '칠분도미밥' }, { name: '브로콜리스프' }, { name: '순살돈까스' }]), '순살돈까스');
  assert.equal(mainDish([{ name: '치킨마요덮밥(과)' }, { name: '어묵국' }]), '치킨마요덮밥');
  assert.equal(mainDish([{ name: '미역국-(과)' }, { name: '찜닭(조)(과학고)' }]), '찜닭');
  assert.equal(mainDish([{ name: '미소장국(중등)-[팽이,두부]' }, { name: '참치마요&구이김' }]), '참치마요&구이김');
});

test('시간대에 맞는 끼니를 고른다', () => {
  const day = new Date(2026, 10, 4);
  const today = ymd(day);
  const tomorrow = ymd(new Date(2026, 10, 5));
  const meals = {
    [today]: [meal('1', '죽'), meal('2', '비빔밥'), meal('3', '카레')],
    [tomorrow]: [meal('2', '국수')],
  };
  const at = (hour) => new Date(2026, 10, 4, hour);
  assert.deepEqual(chooseDefault(at(7), meals), { date: today, code: '1' });
  assert.deepEqual(chooseDefault(at(11), meals), { date: today, code: '2' });
  assert.deepEqual(chooseDefault(at(16), meals), { date: today, code: '3' });
  assert.deepEqual(chooseDefault(at(20), meals), { date: tomorrow, code: '2' });
});

test('점심만 있는 학교는 오후에 다음 급식일로 넘어간다', () => {
  const meals = {
    20261106: [meal('2', '비빔밥')], // 금요일
    20261107: [],
    20261108: [],
    20261109: [meal('2', '국수')], // 월요일
  };
  assert.deepEqual(chooseDefault(new Date(2026, 10, 6, 15), meals), { date: '20261109', code: '2' });
});

test('식단이 하나도 없으면 오늘의 빈 화면을 보여준다', () => {
  assert.deepEqual(chooseDefault(new Date(2026, 10, 6, 15), {}), { date: '20261106', code: null });
});

test('날짜 표시', () => {
  const now = new Date(2026, 10, 6, 12);
  assert.equal(dayLabel('20261106', now), '오늘');
  assert.equal(dayLabel('20261107', now), '내일');
  assert.equal(dayLabel('20261109', now), '11/9(월)');
});

function speak(dishes, extra = {}, now = new Date(2026, 10, 4, 12)) {
  const target = { code: '2', dishes };
  return buildSpeech({
    meal: target, dishes: analyze(target, extra), tone: 'friendly', when: '오늘', now, date: ymd(now),
  });
}

test('알레르기가 좋아하는 메뉴보다 우선한다', () => {
  const result = speak([{ name: '돈까스', allergens: [6] }], prefs({ favorites: ['돈까스'], allergies: [6] }));
  assert.equal(result.mood, 'sad');
  assert.match(result.text, /돈까스/);
  assert.match(result.text, /밀 표시/);
});

test('좋아하는 메뉴는 기쁜 표정, 싫어하는 메뉴는 슬픈 표정이다', () => {
  assert.equal(speak([{ name: '치킨', allergens: [] }], prefs({ favorites: ['치킨'] })).mood, 'happy');
  assert.equal(speak([{ name: '가지볶음', allergens: [] }], prefs({ dislikes: ['가지'] })).mood, 'sad');
});

test('좋아하는 메뉴와 싫어하는 메뉴가 같이 있으면 기쁜 쪽을 택한다', () => {
  const dishes = [{ name: '가지볶음', allergens: [] }, { name: '치킨', allergens: [] }];
  assert.equal(speak(dishes, prefs({ favorites: ['치킨'], dislikes: ['가지'] })).mood, 'happy');
});

test('급식이 없으면 졸린 표정이고 대사에 빈칸이 남지 않는다', () => {
  const result = buildSpeech({
    meal: null, dishes: [], tone: 'tsundere', when: '내일', now: new Date(2026, 10, 6), date: '20261107',
  });
  assert.equal(result.mood, 'sleepy');
  assert.doesNotMatch(result.text, /[{}]/);
});

test('모든 말투의 대사에 채우지 못한 빈칸이 없다', () => {
  for (const tone of ['friendly', 'tsundere', 'hype', 'polite']) {
    for (let day = 1; day <= 30; day++) {
      const now = new Date(2026, 10, day, 12);
      const target = { code: '2', dishes: [{ name: '카레', allergens: [1] }, { name: '우엉조림', allergens: [] }] };
      const cases = [prefs(), prefs({ allergies: [1] }), prefs({ favorites: ['카레'] }), prefs({ dislikes: ['카레'] })];
      for (const p of cases) {
        const { text } = buildSpeech({ meal: target, dishes: analyze(target, p), tone, when: '오늘', now, date: ymd(now) });
        assert.doesNotMatch(text, /[{}]/, `${tone}: ${text}`);
      }
    }
  }
});

test('대사는 상황에 맞는 빈칸만 쓰고 메뉴 뒤에 조사를 바로 붙이지 않는다', () => {
  const allowed = {
    normal: ['when', 'meal', 'menu'],
    favorite: ['when', 'meal', 'menu'],
    disliked: ['when', 'meal', 'menu'],
    allergy: ['when', 'meal', 'menu', 'dish', 'allergen'],
    friday: ['when', 'meal', 'menu'],
    noMeal: ['when'],
    examToday: ['when', 'meal', 'menu', 'event'],
    examSoon: ['when', 'meal', 'menu', 'event', 'days'],
    dayOff: ['when', 'meal', 'menu', 'event'],
    vacationSoon: ['when', 'meal', 'menu', 'event', 'days'],
    noMealEvent: ['when', 'event'],
    markFavorite: ['menu'],
    markDisliked: ['menu'],
    updateReady: ['version'],
  };
  for (const [tone, set] of Object.entries(LINES)) {
    for (const [situation, keys] of Object.entries(allowed)) {
      for (const line of set[situation]) {
        const used = [...line.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
        assert.ok(used.every((key) => keys.includes(key)), `${tone}: ${line}`);
        assert.doesNotMatch(line, /\{(menu|event|version)\}(은|는|이|가|을|를|야|이야|라|랑|와|과)/, `${tone}: ${line}`);
      }
    }
    for (const situation of ['idle', 'offline', 'loadFailed', 'noSchool']) {
      for (const line of set[situation]) assert.doesNotMatch(line, /[{}]/, `${tone}: ${line}`);
    }
  }
});

const event = (name, extra = {}) => ({ name, grades: [1, 2, 3], allGrades: true, offDay: false, ...extra });

test('행사 이름으로 시험, 방학, 쉬는 날을 구분한다', () => {
  assert.equal(classifyEvent(event('기말고사(3학년)')), 'exam');
  assert.equal(classifyEvent(event('1학기 지필평가')), 'exam');
  assert.equal(classifyEvent(event('방학식')), 'vacation');
  assert.equal(classifyEvent(event('종업식')), 'vacation');
  assert.equal(classifyEvent(event('재량휴업일', { offDay: true })), 'off');
  assert.equal(classifyEvent(event('대입 수학능력시험일', { offDay: true })), 'off');
  assert.equal(classifyEvent(event('대입 수학능력시험일')), null);
  assert.equal(classifyEvent(event('토요휴업일', { offDay: true })), null);
  assert.equal(classifyEvent(event('개학식')), null);
  assert.equal(classifyEvent(event('동아리활동(평가)')), null);
});

test('학년별 행사는 해당 학년에만 적용한다', () => {
  const third = event('기말고사(3학년)', { grades: [3], allGrades: false });
  assert.equal(eventApplies(third, 3), true);
  assert.equal(eventApplies(third, 1), false);
  assert.equal(eventApplies(third, 0), false);
  assert.equal(eventApplies(event('기말고사'), 0), true);
});

test('다가오는 시험과 방학을 찾고 주말 전날에는 쉬는 날을 말하지 않는다', () => {
  const schedule = {
    20261110: [event('기말고사')],
    20261111: [event('방학식')],
    20261114: [event('재량휴업일', { offDay: true })],
    20261120: [event('재량휴업일', { offDay: true })],
  };
  const context = scheduleContext(schedule, 1, new Date(2026, 10, 9, 8));
  assert.deepEqual(context.examSoon, { name: '기말고사', kind: 'exam', days: 1 });
  assert.equal(context.vacationSoon.days, 2);
  assert.equal(scheduleContext(schedule, 1, new Date(2026, 10, 13, 8)).dayOff, undefined); // 내일이 토요일
  assert.equal(scheduleContext(schedule, 1, new Date(2026, 10, 19, 8)).dayOff.name, '재량휴업일');
});

function speakWith(schedule, grade, dishes, extra = {}, now = new Date(2026, 10, 9, 12)) {
  const target = { code: '2', dishes };
  return buildSpeech({
    meal: target, dishes: analyze(target, extra), tone: 'tsundere', when: '오늘', now, date: ymd(now), schedule, grade,
  });
}

test('일정 대사 우선순위: 알레르기, 시험 당일, 취향, 다가오는 시험 순서다', () => {
  const dish = { name: '돈까스', allergens: [6] };
  const today = { 20261109: [event('기말고사(3학년)')] };
  assert.match(speakWith(today, 1, [dish], prefs({ allergies: [6] })).text, /표시/);
  assert.match(speakWith(today, 1, [dish], prefs({ favorites: ['돈까스'] })).text, /(기말고사|시험)/);
  const soon = { 20261111: [event('기말고사')] };
  assert.equal(speakWith(soon, 1, [dish], prefs({ favorites: ['돈까스'] })).mood, 'happy');
  assert.match(speakWith(soon, 1, [dish], prefs()).text, /(기말고사|2일)/);
});

test('다른 학년 시험은 말하지 않는다', () => {
  const schedule = { 20261109: [event('기말고사(3학년)', { grades: [3], allGrades: false })] };
  assert.doesNotMatch(speakWith(schedule, 1, [{ name: '돈까스', allergens: [] }], prefs()).text, /기말고사/);
  assert.match(speakWith(schedule, 3, [{ name: '돈까스', allergens: [] }], prefs()).text, /(기말고사|시험)/);
});

test('급식이 없는 날은 쉬는 이유를 말한다', () => {
  const now = new Date(2026, 10, 19, 12);
  const schedule = { 20261120: [event('재량휴업일', { offDay: true })] };
  const result = buildSpeech({ meal: null, dishes: [], tone: 'friendly', when: '내일', now, date: '20261120', schedule, grade: 1 });
  assert.match(result.text, /재량휴업일/);
});

test('설정값을 검증한다', () => {
  assert.deepEqual(sanitize({ opacity: 0.1 }), { opacity: 0.4 });
  assert.deepEqual(sanitize({ scale: 3 }), { scale: 1.5 });
  assert.deepEqual(sanitize({ scale: 0.2 }), { scale: 0.7 });
  assert.deepEqual(sanitize({ announcedUpdate: '0.2.7' }), { announcedUpdate: '0.2.7' });
  assert.deepEqual(sanitize({ tone: 'unknown' }), {});
  assert.deepEqual(sanitize({ allergies: [1, '2', 2, 99] }), { allergies: [1, 2] });
  assert.deepEqual(sanitize({ favorites: [' 치킨 ', '치킨', ''] }), { favorites: ['치킨'] });
  assert.deepEqual(sanitize({ school: null }), { school: null });
});

function jsonResponse(body) {
  return { ok: true, json: async () => body };
}

test('식단은 하루씩 나눠 요청한다', async () => {
  const urls = [];
  const client = createNeisClient({
    fetch: async (url) => {
      urls.push(url);
      return jsonResponse({ RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다.' } });
    },
  });
  const meals = await client.fetchMeals({ region: 'B10', code: '1' }, new Date(2026, 10, 6), 3);
  assert.equal(urls.length, 3);
  assert.deepEqual(meals, { 20261106: [], 20261107: [], 20261108: [] });
});

test('끼니를 조식, 중식, 석식 순서로 정렬한다', async () => {
  const row = (code) => ({ MLSV_YMD: '20261106', MMEAL_SC_CODE: code, MMEAL_SC_NM: 'x', DDISH_NM: '밥' });
  const client = createNeisClient({
    fetch: async () => jsonResponse({
      mealServiceDietInfo: [{ head: [{ list_total_count: 2 }, {}] }, { row: [row('3'), row('2')] }],
    }),
  });
  const meals = await client.fetchMeals({ region: 'B10', code: '1' }, new Date(2026, 10, 6), 1);
  assert.deepEqual(meals['20261106'].map((m) => m.code), ['2', '3']);
});

test('학사일정을 하루씩 받아 학년 정보를 정리한다', async () => {
  const row = {
    AA_YMD: '20261106', EVENT_NM: '기말고사(3학년)', SBTR_DD_SC_NM: '해당없음',
    ONE_GRADE_EVENT_YN: 'N', TW_GRADE_EVENT_YN: 'N', THREE_GRADE_EVENT_YN: 'Y', FR_GRADE_EVENT_YN: '*',
  };
  const urls = [];
  const client = createNeisClient({
    fetch: async (url) => {
      urls.push(url);
      return jsonResponse({ SchoolSchedule: [{ head: [{ list_total_count: 1 }, {}] }, { row: [row] }] });
    },
  });
  const schedule = await client.fetchSchedule({ region: 'B10', code: '1' }, new Date(2026, 10, 6), 1);
  assert.equal(urls.length, 1);
  assert.deepEqual(schedule['20261106'], [{
    date: '20261106', name: '기말고사(3학년)', grades: [3], allGrades: false, offDay: false,
  }]);
});

test('나이스 오류 코드는 예외로 전달한다', async () => {
  const client = createNeisClient({
    fetch: async () => jsonResponse({ RESULT: { CODE: 'ERROR-500', MESSAGE: '서버 오류입니다.' } }),
  });
  await assert.rejects(client.searchSchools('학교'), /서버 오류/);
});
