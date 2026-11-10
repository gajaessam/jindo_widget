// 설정과 식단 캐시를 사용자 데이터 폴더의 JSON 파일로 보관한다.
const fs = require('node:fs');
const path = require('node:path');
const { tones } = require('../shared/logic.js');

const DEFAULTS = {
  school: null,
  grade: 0,
  tone: 'friendly',
  favorites: [],
  dislikes: [],
  allergies: [],
  alwaysOnTop: false,
  opacity: 1,
  scale: 1,
  autoStart: false,
  position: null,
};

function wordList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((word) => String(word).trim()).filter(Boolean))].slice(0, 200);
}

function sanitize(patch) {
  const clean = {};
  if ('school' in patch) {
    const s = patch.school;
    clean.school = s && s.code && s.region
      ? {
        code: String(s.code), region: String(s.region), name: String(s.name || ''),
        kind: String(s.kind || ''), address: String(s.address || ''),
      }
      : null;
  }
  if (Number.isInteger(patch.grade) && patch.grade >= 0 && patch.grade <= 6) clean.grade = patch.grade;
  if (patch.tone in tones) clean.tone = patch.tone;
  if ('favorites' in patch) clean.favorites = wordList(patch.favorites);
  if ('dislikes' in patch) clean.dislikes = wordList(patch.dislikes);
  if (Array.isArray(patch.allergies)) {
    clean.allergies = [...new Set(patch.allergies.map(Number))].filter((n) => n >= 1 && n <= 19);
  }
  if (typeof patch.alwaysOnTop === 'boolean') clean.alwaysOnTop = patch.alwaysOnTop;
  if (typeof patch.autoStart === 'boolean') clean.autoStart = patch.autoStart;
  if (typeof patch.opacity === 'number') clean.opacity = Math.min(1, Math.max(0.4, patch.opacity));
  if (typeof patch.scale === 'number') clean.scale = Math.min(1.5, Math.max(0.7, patch.scale));
  if (typeof patch.announcedUpdate === 'string') clean.announcedUpdate = patch.announcedUpdate.slice(0, 20);
  if (patch.position && Number.isFinite(patch.position.x) && Number.isFinite(patch.position.y)) {
    clean.position = { x: Math.round(patch.position.x), y: Math.round(patch.position.y) };
  }
  return clean;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// 쓰다가 꺼져도 기존 파일이 깨지지 않도록 임시 파일을 거쳐 교체한다.
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

function createStore(dir) {
  const settingsFile = path.join(dir, 'settings.json');
  const cacheFile = path.join(dir, 'meals-cache.json');
  let settings = { ...DEFAULTS, ...sanitize(readJson(settingsFile, {})) };

  return {
    getSettings: () => settings,
    updateSettings(patch) {
      settings = { ...settings, ...sanitize(patch) };
      writeJson(settingsFile, settings);
      return settings;
    },
    readCache: () => readJson(cacheFile, { schoolKey: null, meals: {}, updatedAt: null }),
    writeCache: (cache) => writeJson(cacheFile, cache),
  };
}

module.exports = { createStore, DEFAULTS, sanitize };
