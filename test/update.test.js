'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../src/core/update');

const SHA = 'a'.repeat(64);
function release(tag, assets, extra = {}) {
  return { tag_name: tag, body: '고친 점', assets, ...extra };
}
function asset(name, more = {}) {
  return { name, size: 90_000_000, digest: `sha256:${SHA}`, browser_download_url: `https://github.com/gajaessam/jindo_widget/releases/download/x/${name}`, ...more };
}

test('버전 비교', () => {
  assert.ok(U.compareVersions('v1.0.0', '0.2.9') > 0);
  assert.ok(U.compareVersions('1.0.10', '1.0.9') > 0);
  assert.equal(U.compareVersions('v1.2.3', '1.2.3'), 0);
  assert.ok(U.compareVersions('1.0.0', '1.1.0') < 0);
  assert.equal(U.compareVersions('abc', '1.0.0'), 0);
});

test('새 버전이 없으면 null', () => {
  assert.equal(U.pickUpdate(release('v1.0.0', [asset('JindoWidget-Setup-v1.0.0.exe')]), '1.0.0'), null);
  assert.equal(U.pickUpdate(release('v0.9.0', []), '1.0.0'), null);
  assert.equal(U.pickUpdate(release('v2.0.0', [], { prerelease: true }), '1.0.0'), null);
});

test('정해진 이름의 설치 파일을 고른다', () => {
  const r = U.pickUpdate(release('v1.1.0', [asset('notes.txt'), asset('other.exe'), asset('JindoWidget-Setup-v1.1.0.exe')]), '1.0.0');
  assert.equal(r.version, '1.1.0');
  assert.equal(r.asset.name, 'JindoWidget-Setup-v1.1.0.exe');
  assert.equal(r.asset.sha256, SHA);
  assert.equal(r.notes, '고친 점');
});

test('이름이 다르면 .exe가 딱 하나일 때만 쓴다', () => {
  assert.equal(U.pickUpdate(release('v1.1.0', [asset('setup.exe'), asset('a.zip')]), '1.0.0').asset.name, 'setup.exe');
  assert.throws(() => U.pickUpdate(release('v1.1.0', [asset('a.exe'), asset('b.exe')]), '1.0.0'), /찾지 못했어요/);
});

test('SHA-256이 없거나 주소·크기가 이상하면 내려받지 않는다', () => {
  const n = 'JindoWidget-Setup-v1.1.0.exe';
  assert.throws(() => U.pickUpdate(release('v1.1.0', [asset(n, { digest: null })]), '1.0.0'), /SHA-256/);
  assert.throws(() => U.pickUpdate(release('v1.1.0', [asset(n, { digest: 'sha256:1234' })]), '1.0.0'), /SHA-256/);
  assert.throws(() => U.pickUpdate(release('v1.1.0', [asset(n, { browser_download_url: 'http://evil.example/x.exe' })]), '1.0.0'), /주소/);
  assert.throws(() => U.pickUpdate(release('v1.1.0', [asset(n, { size: 0 })]), '1.0.0'), /크기/);
  assert.throws(() => U.pickUpdate(release('v1.1.0', [asset(n, { size: 600 * 1024 * 1024 })]), '1.0.0'), /크기/);
});

test('설치 파일 이름 규칙', () => {
  assert.equal(U.assetName('1.0.0'), 'JindoWidget-Setup-v1.0.0.exe');
});
