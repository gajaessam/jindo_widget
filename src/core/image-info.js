'use strict';
// 이미지 파일의 앞부분만 읽어서 형식과 가로·세로 크기를 알아냅니다. (전체를 풀지 않음)

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 24000000;
const EXTENSIONS = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp', '.bmp': 'bmp', '.gif': 'gif' };
const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif' };

function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    // SOF0~SOF15 (DHT=C4, JPG=C8, DAC=CC 제외)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function webpSize(buf) {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  return null;
}

// 결과: { format, mime, width, height } 또는 null(모르는 형식)
function sniffImage(buf) {
  if (!buf || buf.length < 26) return null;
  let format = null;
  let size = null;
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
    format = 'png';
    size = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } else if (buf[0] === 0xff && buf[1] === 0xd8) {
    format = 'jpeg';
    size = jpegSize(buf);
  } else if (buf.toString('ascii', 0, 3) === 'GIF') {
    format = 'gif';
    size = { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  } else if (buf.toString('ascii', 0, 2) === 'BM') {
    format = 'bmp';
    size = { width: Math.abs(buf.readInt32LE(18)), height: Math.abs(buf.readInt32LE(22)) };
  } else if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' && buf.length >= 30) {
    format = 'webp';
    size = webpSize(buf);
  }
  if (!format || !size || !size.width || !size.height) return null;
  return { format, mime: MIME[format], width: size.width, height: size.height };
}

// 고른 이미지 검사. 문제가 있으면 선생님께 보여 줄 문장을 담은 Error
function checkImage({ name, byteLength, head }) {
  const ext = (name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  if (!EXTENSIONS[ext]) throw new Error('PNG, JPG, WEBP, BMP 또는 GIF 파일을 선택해 주세요.');
  if (byteLength > MAX_IMAGE_BYTES) throw new Error('이미지 파일은 20MB 이하만 사용할 수 있어요.');
  const info = sniffImage(head);
  if (!info) throw new Error('이미지를 읽을 수 없어요. 파일 형식을 확인해 주세요.');
  if (info.width * info.height > MAX_IMAGE_PIXELS) throw new Error('이미지가 너무 커요. 가로·세로 크기를 줄인 뒤 다시 선택해 주세요.');
  return info;
}

module.exports = { sniffImage, checkImage, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MIME };
