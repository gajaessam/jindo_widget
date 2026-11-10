// 나이스 교육정보 개방 포털 Open API 호출.
// 인증키 없이 쓰면 요청당 5건만 오고 다음 페이지도 같은 내용이 오기 때문에 하루씩 나눠서 받는다.
const { parseDishes, parseNutrition, ymd, addDays } = require('../shared/logic.js');

const BASE_URL = 'https://open.neis.go.kr/hub';
const NO_DATA = 'INFO-200';
const GRADE_FLAGS = ['ONE', 'TW', 'THREE', 'FR', 'FIV', 'SIX'];

function createNeisClient({ fetch: fetchFn }) {
  async function call(service, params) {
    const query = new URLSearchParams({ Type: 'json', pIndex: '1', pSize: '100', ...params });
    const response = await fetchFn(`${BASE_URL}/${service}?${query}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`나이스 서버 응답 오류 (${response.status})`);
    const data = await response.json();
    if (data.RESULT) {
      if (data.RESULT.CODE === NO_DATA) return { rows: [], total: 0 };
      throw new Error(data.RESULT.MESSAGE);
    }
    const [{ head }, { row }] = data[service];
    return { rows: row, total: head[0].list_total_count };
  }

  async function searchSchools(name, region) {
    const { rows, total } = await call('schoolInfo', {
      SCHUL_NM: name,
      ...(region ? { ATPT_OFCDC_SC_CODE: region } : {}),
    });
    return {
      total,
      schools: rows.map((row) => ({
        code: row.SD_SCHUL_CODE,
        region: row.ATPT_OFCDC_SC_CODE,
        name: row.SCHUL_NM,
        kind: row.SCHUL_KND_SC_NM,
        address: row.ORG_RDNMA,
      })),
    };
  }

  function toMeal(row) {
    return {
      date: row.MLSV_YMD,
      code: row.MMEAL_SC_CODE,
      name: row.MMEAL_SC_NM,
      dishes: parseDishes(row.DDISH_NM),
      calories: row.CAL_INFO || '',
      nutrition: parseNutrition(row.NTR_INFO),
    };
  }

  async function fetchDay(school, date) {
    const { rows } = await call('mealServiceDietInfo', {
      ATPT_OFCDC_SC_CODE: school.region,
      SD_SCHUL_CODE: school.code,
      MLSV_FROM_YMD: date,
      MLSV_TO_YMD: date,
    });
    return rows.map(toMeal);
  }

  function toEvent(row) {
    const flags = GRADE_FLAGS.map((prefix) => row[`${prefix}_GRADE_EVENT_YN`]);
    return {
      date: row.AA_YMD,
      name: row.EVENT_NM,
      grades: flags.flatMap((flag, i) => (flag === 'Y' ? [i + 1] : [])),
      allGrades: !flags.includes('N'),
      offDay: Boolean(row.SBTR_DD_SC_NM) && row.SBTR_DD_SC_NM !== '해당없음',
    };
  }

  // 시작일부터 days일치 학사일정을 { 날짜: [행사...] } 형태로 돌려준다.
  async function fetchSchedule(school, start, days) {
    const result = {};
    for (let i = 0; i < days; i++) {
      const date = ymd(addDays(start, i));
      const { rows } = await call('SchoolSchedule', {
        ATPT_OFCDC_SC_CODE: school.region,
        SD_SCHUL_CODE: school.code,
        AA_FROM_YMD: date,
        AA_TO_YMD: date,
      });
      result[date] = rows.map(toEvent);
    }
    return result;
  }

  // 시작일부터 days일치 식단을 { 날짜: [끼니...] } 형태로 돌려준다. 급식이 없는 날은 빈 배열이다.
  async function fetchMeals(school, start, days) {
    const dates = Array.from({ length: days }, (_, i) => ymd(addDays(start, i)));
    const result = Object.fromEntries(dates.map((date) => [date, []]));
    for (const date of dates) {
      for (const meal of await fetchDay(school, date)) result[date].push(meal);
    }
    for (const date of dates) result[date].sort((a, b) => Number(a.code) - Number(b.code));
    return result;
  }

  return { searchSchools, fetchMeals, fetchSchedule };
}

module.exports = { createNeisClient };
