'use strict';
// 사용 설명서 PDF 만들기: docs/guide/index.html → docs/JindoWidget-Guide.pdf
//   사용법: npm run guide-pdf

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const SRC = path.join(__dirname, '..', 'docs', 'guide', 'index.html');
const OUT = path.join(__dirname, '..', 'docs', 'JindoWidget-Guide.pdf');

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, width: 900, height: 1200 });
    await win.loadFile(SRC);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#8E7264"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    fs.writeFileSync(OUT, pdf);
    console.log(`사용 설명서 PDF를 만들었어요: ${path.relative(process.cwd(), OUT)} (${Math.round(pdf.length / 1024)}KB)`);
    app.exit(0);
  } catch (err) {
    console.error('PDF를 만들지 못했어요:', err);
    app.exit(1);
  }
});
