// 설치 안내 PDF를 만든다. 실행: npx electron scripts/make-guide.js <출력 PDF 경로>
// docs/images/smartscreen-1.png, smartscreen-2.png가 있으면 실제 캡처를 넣고, 없으면 예시 그림을 넣는다.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.resolve(process.argv[process.argv.length - 1]);
const images = path.join(root, 'docs', 'images');

const SHOTS = [
  { file: 'smartscreen-1.png', caption: '① 추가 정보 누르기', button: '실행 안 함', targetText: true },
  { file: 'smartscreen-2.png', caption: '② 실행 누르기', button: '실행', targetText: false },
];

function shotHtml({ file, caption, button, targetText }) {
  const full = path.join(images, file);
  if (fs.existsSync(full)) {
    const data = fs.readFileSync(full).toString('base64');
    return `<figure class="shot"><img src="data:image/png;base64,${data}" alt=""><figcaption>${caption}</figcaption></figure>`;
  }
  return `<figure class="shot">
    <div class="sketch">
      <span class="label">예시 그림</span>
      <strong>Windows의 PC 보호</strong>
      <div class="fake-line"></div><div class="fake-line short"></div>
      <span class="${targetText ? 'target' : ''}">추가 정보</span>
      <span class="button ${targetText ? '' : 'target'}">${button}</span>
    </div>
    <figcaption>${caption}</figcaption>
  </figure>`;
}

app.whenReady().then(async () => {
  const template = fs.readFileSync(path.join(root, 'docs', 'install-guide.html'), 'utf8');
  const html = template.replace('<!--SMARTSCREEN_SHOTS-->', SHOTS.map(shotHtml).join('\n'));
  const temp = path.join(app.getPath('temp'), 'geupsik-install-guide.html');
  fs.writeFileSync(temp, html);

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await win.loadFile(temp);
  const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, pdf);
  fs.rmSync(temp, { force: true });
  const usedShots = SHOTS.filter((shot) => fs.existsSync(path.join(images, shot.file))).length;
  console.log(`PDF 생성: ${output} (실제 캡처 ${usedShots}/${SHOTS.length}장)`);
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
