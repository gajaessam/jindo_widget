// 메인 프로세스, 화면, 테스트가 함께 쓰는 순수 로직. Electron이나 DOM에 의존하지 않는다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lines.js'));
  else root.MealLogic = factory(root.MealLines);
})(typeof self !== 'undefined' ? self : this, function (LINES) {
  const ALLERGENS = {
    1: '난류', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두', 6: '밀', 7: '고등어',
    8: '게', 9: '새우', 10: '돼지고기', 11: '복숭아', 12: '토마토', 13: '아황산류',
    14: '호두', 15: '닭고기', 16: '쇠고기', 17: '오징어', 18: '조개류', 19: '잣',
  };
  // 학교가 번호를 빠뜨려도 놓치지 않도록 메뉴 이름에서도 찾는다.
  // 아황산류처럼 이름으로 알 수 없는 항목은 번호로만 확인한다.
  const ALLERGEN_WORDS = {
    1: ['난류', '계란', '달걀', '메추리알'],
    2: ['우유', '치즈', '요구르트', '요거트', '버터', '생크림', '연유'],
    3: ['메밀'],
    4: ['땅콩'],
    5: ['대두', '두부', '두유', '된장', '콩나물', '콩자반', '콩밥'],
    6: ['밀가루', '국수', '빵', '파스타', '스파게티', '라면', '우동', '수제비'],
    7: ['고등어'],
    8: ['꽃게', '게살', '대게', '게장', '게맛살'],
    9: ['새우'],
    10: ['돼지', '돈까스', '삼겹', '제육', '목살', '베이컨', '햄'],
    11: ['복숭아'],
    12: ['토마토'],
    14: ['호두'],
    15: ['닭', '치킨'],
    16: ['쇠고기', '소고기', '한우'],
    17: ['오징어'],
    18: ['조개', '굴국', '굴전', '굴밥', '생굴', '전복', '홍합', '바지락'],
    19: ['잣'],
  };
  const MEAL_WORDS = { 1: '아침', 2: '점심', 3: '저녁' };
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const EXAM_EVENT = /고사|지필|시험|학력평가/;
  const OTHER_EXAM_EVENT = /대입|수능|수학능력/;
  const SOON_DAYS = 5;
  const SIDE_DISH = /밥$|죽$|김치|깍두기|겉절이|단무지|무침$|장아찌|샐러드$|우유|주스|쥬스|요구르트|요거트|(국|탕|찌개|스프|수프)$/;
  const ONE_DISH_RICE = /(덮|볶음|비빔|국|김|주먹|컵|초|카레|짜장)밥$/;

  function ymd(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  }

  function parseYmd(text) {
    return new Date(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8)));
  }

  function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  function dayLabel(dateText, now) {
    if (dateText === ymd(now)) return '오늘';
    if (dateText === ymd(addDays(now, 1))) return '내일';
    const d = parseYmd(dateText);
    return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  }

  function decode(text) {
    return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
  }

  function parseDish(line) {
    let name = decode(line).trim();
    let numbers = '';
    const bracket = name.match(/\(\s*(\d[\d.\s]*)\)\s*$/);
    const bare = name.match(/[^\d.\s]\s*((?:\d{1,2}\.)+\d{0,2})\s*$/);
    if (bracket) {
      numbers = bracket[1];
      name = name.slice(0, bracket.index);
    } else if (bare) {
      numbers = bare[1];
      name = name.slice(0, name.length - bare[0].length + 1);
    }
    name = name.replace(/^[*#@&\s]+/, '').trim();
    const allergens = numbers
      .split('.')
      .map(Number)
      .filter((n) => ALLERGENS[n]);
    return { name, allergens };
  }

  function parseDishes(raw) {
    return String(raw || '')
      .split(/<br\s*\/?>/i)
      .map(parseDish)
      .filter((dish) => dish.name);
  }

  function parseNutrition(raw) {
    return String(raw || '')
      .split(/<br\s*\/?>/i)
      .map((line) => line.split(' : '))
      .filter((parts) => parts.length === 2)
      .map(([label, value]) => ({ label: label.trim(), value: value.trim() }));
  }

  // 돈까스와 돈가스처럼 흔히 다르게 쓰는 표기를 같은 단어로 본다.
  function normalize(text) {
    return String(text).replace(/\s+/g, '').replace(/까스/g, '가스').toLowerCase();
  }

  function includesWord(dishName, words) {
    const names = [normalize(dishName), normalize(plainName(dishName))];
    return words.some((word) => normalize(word) && names.some((name) => name.includes(normalize(word))));
  }

  function findAllergyHits(dish, allergies) {
    return allergies
      .filter((n) => dish.allergens.includes(n) || includesWord(dish.name, ALLERGEN_WORDS[n] || []))
      .sort((a, b) => a - b)
      .map((n) => ALLERGENS[n]);
  }

  function analyze(meal, prefs) {
    return meal.dishes.map((dish) => ({
      ...dish,
      allergyHits: findAllergyHits(dish, prefs.allergies),
      favorite: includesWord(dish.name, prefs.favorites),
      disliked: includesWord(dish.name, prefs.dislikes),
    }));
  }

  // 학교별 메모인 괄호를 뗀다. 예: 찜닭(과), 미역국-(조), 샐러드(과)&키위, 장국-[팽이,두부]
  function plainName(name) {
    return name.replace(/\([^()]*\)|\[[^\]]*\]/g, '').replace(/[-\s]+$/, '').trim() || name;
  }

  // 메뉴를 찜하거나 해제한다. 한쪽에 넣으면 반대쪽 목록에서는 뺀다.
  function toggleTaste(prefs, dishName, kind) {
    const other = kind === 'favorites' ? 'dislikes' : 'favorites';
    const matches = (word) => includesWord(dishName, [word]);
    const active = prefs[kind].some(matches);
    return {
      [kind]: active ? prefs[kind].filter((word) => !matches(word)) : [...prefs[kind], plainName(dishName)],
      [other]: prefs[other].filter((word) => !matches(word)),
    };
  }

  function isMain(dish) {
    const name = plainName(dish.name);
    return ONE_DISH_RICE.test(name) || !SIDE_DISH.test(name);
  }

  function mainDish(dishes) {
    return plainName((dishes.find(isMain) || dishes[0]).name);
  }

  function mealSlot(now) {
    const hour = now.getHours();
    if (hour < 9) return 1;
    if (hour < 14) return 2;
    if (hour < 19) return 3;
    return 4; // 저녁 시간이 지나면 다음 날 식단을 보여준다.
  }

  // 지금 시각에 가장 궁금할 끼니를 고른다.
  function chooseDefault(now, mealsByDate, lookAhead = 7) {
    const today = ymd(now);
    const slot = mealSlot(now);
    const remaining = (mealsByDate[today] || []).find((meal) => Number(meal.code) >= slot);
    if (remaining) return { date: today, code: remaining.code };
    for (let i = 1; i < lookAhead; i++) {
      const date = ymd(addDays(now, i));
      const meals = mealsByDate[date] || [];
      if (meals.length) return { date, code: meals[0].code };
    }
    const fallback = mealsByDate[today] || [];
    return { date: today, code: fallback.length ? fallback[fallback.length - 1].code : null };
  }

  // 학사일정 행사를 시험, 방학, 쉬는 날로 나눈다. 대사에 쓰지 않는 행사는 null이다.
  function classifyEvent(event) {
    if (/토요휴업일|개학/.test(event.name)) return null;
    if (/방학|종업식/.test(event.name)) return 'vacation';
    if (EXAM_EVENT.test(event.name) && !OTHER_EXAM_EVENT.test(event.name)) return 'exam';
    return event.offDay ? 'off' : null;
  }

  // 학년을 고르지 않았으면 전 학년 행사만 해당된다.
  function eventApplies(event, grade) {
    return grade ? event.grades.includes(grade) : event.allGrades;
  }

  function eventsOn(schedule, date, grade) {
    return (schedule[date] || [])
      .filter((event) => eventApplies(event, grade))
      .map((event) => ({ name: plainName(event.name), kind: classifyEvent(event) }))
      .filter((event) => event.kind);
  }

  // 오늘을 기준으로 다가오는 일정을 찾는다.
  function scheduleContext(schedule, grade, now) {
    const context = {};
    context.examToday = eventsOn(schedule, ymd(now), grade).find((event) => event.kind === 'exam');
    const tomorrow = addDays(now, 1);
    const isWeekend = tomorrow.getDay() === 0 || tomorrow.getDay() === 6;
    if (!isWeekend) context.dayOff = eventsOn(schedule, ymd(tomorrow), grade).find((event) => event.kind === 'off');
    for (let days = 1; days <= SOON_DAYS; days++) {
      const events = eventsOn(schedule, ymd(addDays(now, days)), grade);
      const exam = events.find((event) => event.kind === 'exam');
      const vacation = events.find((event) => event.kind === 'vacation');
      if (exam && !context.examSoon) context.examSoon = { ...exam, days };
      if (vacation && !context.vacationSoon) context.vacationSoon = { ...vacation, days };
    }
    return context;
  }

  function hash(text) {
    let h = 0;
    for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) | 0;
    return Math.abs(h);
  }

  function pickLine(tone, situation, seed, vars = {}) {
    const set = LINES[tone] || LINES.friendly;
    const lines = set[situation];
    const line = lines[hash(seed) % lines.length];
    return line.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? vars[key] : whole));
  }

  // 식단과 취향을 보고 캐릭터의 대사와 표정을 정한다. 알레르기가 항상 먼저다.
  function buildSpeech({ meal, dishes, tone, when, now, date, schedule = {}, grade = 0 }) {
    const seed = `${date}-${meal ? meal.code : 'none'}`;
    if (!meal || !meal.dishes.length) {
      const event = eventsOn(schedule, date, grade).find(({ kind }) => kind !== 'exam');
      if (event) return { mood: 'sleepy', text: pickLine(tone, 'noMealEvent', seed, { when, event: event.name }) };
      return { mood: 'sleepy', text: pickLine(tone, 'noMeal', seed, { when }) };
    }
    const vars = { when, meal: MEAL_WORDS[meal.code] || '급식', menu: mainDish(dishes) };
    const allergic = dishes.find((dish) => dish.allergyHits.length);
    if (allergic) {
      const text = pickLine(tone, 'allergy', seed, {
        ...vars, dish: allergic.name, allergen: allergic.allergyHits.join(', '),
      });
      return { mood: 'sad', text };
    }
    const context = date === ymd(now) ? scheduleContext(schedule, grade, now) : {};
    if (context.examToday) {
      return { mood: 'default', text: pickLine(tone, 'examToday', seed, { ...vars, event: context.examToday.name }) };
    }
    const favorite = dishes.find((dish) => dish.favorite);
    if (favorite) {
      return { mood: 'happy', text: pickLine(tone, 'favorite', seed, { ...vars, menu: favorite.name }) };
    }
    const disliked = dishes.find((dish) => dish.disliked);
    if (disliked) {
      return { mood: 'sad', text: pickLine(tone, 'disliked', seed, { ...vars, menu: disliked.name }) };
    }
    if (context.examSoon) {
      const { name, days } = context.examSoon;
      return { mood: 'default', text: pickLine(tone, 'examSoon', seed, { ...vars, event: name, days }) };
    }
    if (context.dayOff) {
      return { mood: 'happy', text: pickLine(tone, 'dayOff', seed, { ...vars, event: context.dayOff.name }) };
    }
    if (context.vacationSoon) {
      const { name, days } = context.vacationSoon;
      return { mood: 'happy', text: pickLine(tone, 'vacationSoon', seed, { ...vars, event: name, days }) };
    }
    if (date === ymd(now) && now.getDay() === 5) {
      return { mood: 'happy', text: pickLine(tone, 'friday', seed, vars) };
    }
    return { mood: 'default', text: pickLine(tone, 'normal', seed, vars) };
  }

  return {
    ALLERGENS, ymd, parseYmd, addDays, dayLabel, parseDishes, parseNutrition, normalize,
    analyze, mainDish, plainName, toggleTaste, chooseDefault, pickLine, buildSpeech,
    classifyEvent, eventApplies, scheduleContext,
    tones: Object.fromEntries(Object.entries(LINES).map(([id, set]) => [id, set.label])),
  };
});
