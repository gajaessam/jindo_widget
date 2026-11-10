'use strict';
// 업데이트 판단 규칙 (네트워크와 무관한 순수 함수)

const GITHUB_REPOSITORY = 'gajaessam/jindo_widget';
const ASSET_TEMPLATE = 'JindoWidget-Setup-v{version}.exe';
const MAX_UPDATE_BYTES = 512 * 1024 * 1024;

function parseVersion(v) {
  const m = String(v || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// a가 b보다 새 버전이면 양수
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function assetName(version) {
  return ASSET_TEMPLATE.replace('{version}', version);
}

// GitHub releases/latest 응답에서 받을 설치 파일 고르기
// 결과: null(새 버전 없음) 또는 { version, notes, asset:{name,url,size,sha256} } / 문제가 있으면 Error
function pickUpdate(release, currentVersion) {
  if (!release || typeof release !== 'object') throw new Error('업데이트 정보를 읽지 못했어요.');
  if (release.draft || release.prerelease) return null;
  const tag = String(release.tag_name || '');
  const version = (parseVersion(tag) || []).join('.');
  if (!version) throw new Error('업데이트 버전 정보를 읽지 못했어요.');
  if (compareVersions(version, currentVersion) <= 0) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  let asset = assets.find((a) => a && a.name === assetName(version));
  if (!asset) {
    const exes = assets.filter((a) => a && String(a.name || '').toLowerCase().endsWith('.exe'));
    if (exes.length === 1) asset = exes[0];
  }
  if (!asset) throw new Error('새 버전의 설치 파일을 찾지 못했어요.');
  const digest = String(asset.digest || '');
  const sha256 = digest.toLowerCase().startsWith('sha256:') ? digest.slice(7).toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('설치 파일의 검증 정보(SHA-256)가 없어 내려받지 않았어요.');
  const size = Number(asset.size) || 0;
  if (size <= 0 || size > MAX_UPDATE_BYTES) throw new Error('설치 파일 크기가 올바르지 않아요.');
  const url = String(asset.browser_download_url || '');
  if (!/^https:\/\/github\.com\//.test(url)) throw new Error('설치 파일 주소가 올바르지 않아요.');
  return {
    version,
    notes: String(release.body || '').trim().slice(0, 4000),
    asset: { name: String(asset.name), url, size, sha256 },
  };
}

module.exports = { GITHUB_REPOSITORY, MAX_UPDATE_BYTES, parseVersion, compareVersions, assetName, pickUpdate };
