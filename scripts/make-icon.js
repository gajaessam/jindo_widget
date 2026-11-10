// assets/icon.svg를 앱 아이콘 PNG(256px)로 만든다. 실행: npx electron scripts/make-icon.js
// 화면 배율과 상관없이 같은 결과가 나오도록 화면 밖에서 512px로 그린 뒤 256px로 줄인다.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const SIZE = 512;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');
  const html = `<!doctype html><html><body style="margin:0;background:transparent">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${SIZE}" height="${SIZE}" style="display:block">
  </body></html>`;
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  const png = image.resize({ width: 256, height: 256, quality: 'best' }).toPNG();
  const output = path.join(root, 'assets', 'icon.png');
  fs.writeFileSync(output, png);
  console.log(`아이콘 생성: ${output} (${image.getSize().width}px에서 256px로 축소)`);
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
