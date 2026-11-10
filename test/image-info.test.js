'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sniffImage, checkImage } = require('../src/core/image-info');

function png(w, h) {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}
function gif(w, h) {
  const b = Buffer.alloc(30);
  b.write('GIF89a', 0, 'ascii');
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
}
function bmp(w, h) {
  const b = Buffer.alloc(30);
  b.write('BM', 0, 'ascii');
  b.writeInt32LE(w, 18);
  b.writeInt32LE(-h, 22); // 위에서 아래로 저장된 BMP는 높이가 음수
  return b;
}
function jpeg(w, h) {
  // SOI, APP0(길이 16), SOF0
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.alloc(14)]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, ...Buffer.alloc(9)]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}
function webpVp8x(w, h) {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

test('형식과 크기 알아내기: PNG, GIF, BMP, JPG, WEBP', () => {
  assert.deepEqual(sniffImage(png(300, 200)), { format: 'png', mime: 'image/png', width: 300, height: 200 });
  assert.equal(sniffImage(gif(10, 20)).width, 10);
  assert.deepEqual([sniffImage(bmp(64, 48)).width, sniffImage(bmp(64, 48)).height], [64, 48]);
  assert.deepEqual([sniffImage(jpeg(640, 480)).width, sniffImage(jpeg(640, 480)).height], [640, 480]);
  assert.deepEqual([sniffImage(webpVp8x(1000, 800)).width, sniffImage(webpVp8x(1000, 800)).height], [1000, 800]);
  assert.equal(sniffImage(Buffer.from('hello world, not an image at all')), null);
});

test('이미지 검사: 확장자, 20MB, 너무 큰 해상도', () => {
  assert.equal(checkImage({ name: '캐릭터.PNG', byteLength: 1000, head: png(500, 500) }).format, 'png');
  assert.throws(() => checkImage({ name: 'a.tiff', byteLength: 10, head: png(1, 1) }), /PNG, JPG/);
  assert.throws(() => checkImage({ name: 'a.png', byteLength: 21 * 1024 * 1024, head: png(1, 1) }), /20MB/);
  assert.throws(() => checkImage({ name: 'a.png', byteLength: 10, head: png(6000, 5000) }), /너무 커요/);
  assert.throws(() => checkImage({ name: 'a.png', byteLength: 10, head: Buffer.alloc(40) }), /읽을 수 없어요/);
});
