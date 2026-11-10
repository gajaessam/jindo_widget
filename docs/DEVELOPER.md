# 진도 위젯 개발자 문서

진도 위젯(v1.x)은 Electron + HTML/CSS로 만든 Windows 위젯입니다. 이 문서는 고치고, 빌드하고, 배포하는 방법을 정리합니다.

## 1. 준비물

- Windows 10/11 (64비트)
- [Node.js](https://nodejs.org/) 20 이상 (LTS 권장)
- (내 PC에서 설치 파일까지 만들 때만) [Inno Setup 6](https://jrsoftware.org/isinfo.php)

처음 한 번 패키지를 설치합니다.

```bash
npm install
```

> npm 11에서 "install-scripts" 경고가 뜨고 Electron 실행 파일이 받아지지 않으면 `node node_modules/electron/install.js`를 한 번 실행하세요.

## 2. 자주 쓰는 명령

| 명령 | 하는 일 |
|---|---|
| `npm run try` (또는 `시험실행.bat` 더블클릭) | 진짜 데이터를 임시 폴더로 **복사**해서 그 복사본으로 실행. 시험할 때 이걸 쓰세요. |
| `npm start` | 진짜 데이터(`%APPDATA%\UsagiJindo`)로 실행 |
| `npm test` | 자동 테스트 (진도율 계산, 저장, 백업, 복원, 데이터 이어받기, 계획 합치기, 업데이트 판단 등) |
| `npm run check-data` | 이 PC의 진도 데이터를 새 버전이 읽을 수 있는지 **읽기만** 해서 확인 |
| `npm run icon` | 앱 아이콘(`assets/icon.ico`, `icon.png`) 다시 그리기 |
| `npm run guide-pdf` | 사용 설명서 PDF 만들기 (`docs/guide/index.html` → `docs/JindoWidget-Guide.pdf`) |
| `npm run pack` | 앱 폴더 만들기 (`dist/win-unpacked/JindoWidget.exe`) |
| `npm run release` | 테스트 → 설명서 PDF → 앱 묶기 → 설치 파일 (`release/JindoWidget-Setup-v버전.exe`) |
| `powershell -File scripts\measure-idle.ps1` | 켜져 있는 진도 위젯의 대기 CPU·메모리 재기 |

개발용 환경 변수:

| 변수 | 뜻 |
|---|---|
| `JINDO_DATA_DIR` | 데이터 폴더를 바꿈 (기본 `%APPDATA%\UsagiJindo`) |
| `JINDO_OPEN_WINDOW` | 시작하자마자 창 열기: `class-settings`, `plan-settings`, `restore`, `update-check`, `manual`, `autostart` |
| `JINDO_OPEN_PROGRESS` | 시작하자마자 그 반(0부터) 진도창 열기 |
| `JINDO_UPDATE_TEST` | 개발 실행에서도 시작 후 자동 업데이트 확인 |
| `JINDO_DEBUG` | 설정 창이 뜰 때 로그 출력 |

### 내 PC에서 `npm run pack`이 "Cannot create symbolic link" 오류를 낼 때

electron-builder가 받는 도구 묶음(winCodeSign) 안의 macOS 파일 때문에 생기는 Windows 권한 문제입니다. 한 번만 아래처럼 풀어 두면 됩니다. (GitHub Actions에서는 생기지 않음)

```powershell
$c = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$z = Get-ChildItem $c -Filter *.7z | Select-Object -First 1
& node_modules\7zip-bin\win\x64\7za.exe x -y $z.FullName "-o$c\winCodeSign-2.6.0" "-xr!darwin"
```

## 3. 폴더 구조

```
src/
  core/        화면과 무관한 핵심 로직 (자동 테스트 대상)
    data.js            데이터 모양 검사·기본값·옛 형식 변환·진도율
    storage.js         저장(임시 파일→바꿔치기), .bak, 날짜별 백업, 깨진 파일 복구, 복원
    actions.js         진도창 동작(체크, 활동/차시 추가·수정·이동·삭제, 되돌리기)
    plan-merge.js      수업 계획 설정 저장 시 체크 합치기
    class-settings.js  반·캐릭터 설정 적용
    save-scheduler.js  메모 0.5초 자동 저장 / 즉시 저장
    image-info.js      이미지 형식·크기 검사
    update.js          업데이트 판단(버전 비교, 설치 파일 고르기, SHA-256 값)
  shared/race-layout.js  진도율 → 트랙 위치 (main과 화면 공용)
  main/        Electron main 프로세스 (창, 메뉴, Windows 기능)
  renderer/    화면(HTML/CSS/JS). theme.css가 공통 디자인(살구 크림)
docs/guide/    교사용 사용 설명서(HTML) → PDF로도 만들어 설치 파일에 넣음
installer/     Inno Setup 설치 스크립트
scripts/       빌드·시험용 스크립트
test/          자동 테스트
```

## 4. 기존 버전과의 호환 (꼭 지킬 것)

- **데이터 폴더와 형식을 바꾸지 않습니다.** `%APPDATA%\UsagiJindo\progress.json`을 v0.2.x와 똑같은 형식으로 읽고 씁니다. 모르는 항목(예: `image`)은 지우지 않습니다. 메모리에서만 쓰는 `_uid` 꼬리표는 저장할 때 빠집니다.
- 설치 위치 `%LOCALAPPDATA%\Programs\JindoWidget\JindoWidget.exe`, Inno Setup **AppId `{B96128C4-53BB-48FE-A357-A87F7B09D641}`**, 자동 실행 값 `HKCU\...\Run\JindoWidget`, 뮤텍스 `Local\JindoWidget-SingleInstance`는 기존과 같아야 합니다. 바꾸면 진도 위젯이 두 개 설치되거나 두 개가 동시에 켜질 수 있습니다.
- 저장 형식을 꼭 바꿔야 한다면: 처음 실행할 때 기존 파일을 백업한 뒤 변환하고, 변환이 실패하면 원본을 건드리지 말아야 합니다. 반드시 자동 테스트를 함께 추가하세요.

## 5. 배포 순서

1. 고친 내용을 확인합니다: `npm test`, `npm run try`로 직접 써 보기.
2. **버전 올리기**: `package.json`의 `"version"`을 올립니다. 예) `1.0.0` → `1.0.1`(작은 수정), `1.1.0`(기능 추가). 기존 사용자의 앱은 이 번호가 더 클 때만 업데이트를 안내합니다.
3. `release-notes.md`에 바뀐 점을 적습니다. (앱의 업데이트 안내 창에 이 내용이 보입니다)
4. 커밋하고 `main` 브랜치에 올립니다(push).
5. GitHub Actions(`.github/workflows/release.yml`)가 자동으로 테스트 → 설치 파일 빌드 → Release `v버전` 생성 → `JindoWidget-Setup-v버전.exe` **하나만** 올립니다.
   - 같은 버전의 Release가 이미 있으면 빌드만 하고 올리지 않습니다. 버전을 안 올리고 push해도 안전합니다.
   - 진행 상황: GitHub 저장소 → **Actions** 탭. 빌드된 파일은 실행 결과의 Artifacts에서도 받을 수 있습니다.
6. Release 페이지에서 설치 파일 하나만 있는지 확인합니다. **다른 .exe를 Release에 추가로 올리지 마세요.** (앱이 정해진 이름 파일을 찾고, 없으면 .exe가 딱 하나일 때만 그 파일을 씁니다)

## 6. GitHub에 올릴 파일 / 올리면 안 되는 파일

**올릴 것**: `src/`, `test/`, `scripts/`, `installer/`, `docs/`(가이드 HTML, 이 문서), `assets/icon.*`, `assets/fonts/`(Pretendard와 라이선스), `.github/`, `package.json`, `package-lock.json`, `release-notes.md`, `README.md`, `.gitignore`, `시험실행.bat`, `design/`(디자인 시안)

**올리면 안 되는 것** (`.gitignore`에 들어 있음):
- `node_modules/`, `dist/`, `release/` — 만들어지는 파일
- `docs/JindoWidget-Guide.pdf` — 빌드할 때 새로 만듦
- `progress.json`, `progress.json.bak`, `progress.recovery-*.json`, `backups/`, `characters/` — **선생님 개인 진도 데이터와 캐릭터 이미지**
- 저작권이 있는 캐릭터 그림. 진도 위젯에는 캐릭터 그림을 넣지 않습니다(설명서 그림도 직접 그린 예시만 사용).

## 7. 코드 서명

코드 서명 인증서가 없어서 설치할 때 Windows SmartScreen("PC 보호") 경고가 뜰 수 있습니다. 사용 설명서 1장과 업데이트 안내 창에 "추가 정보 → 실행" 안내가 들어 있습니다. 나중에 인증서를 구하면 `scripts/build-release.ps1`에서 설치 파일에 서명하는 단계를 추가하면 됩니다.

## 8. 성능 확인 기준

- 가만히 있을 때(멈춤) CPU가 거의 0에 가까워야 합니다. 애니메이션 루프는 움직일 때만 돌고, "살짝 둥둥"은 1픽셀이 바뀔 때만 다시 그립니다.
- 캐릭터마다 창을 띄우지 않고 투명 창 하나에 그립니다.
- 설정 창은 내용을 다 그린 뒤 크기를 맞춰 보여 줍니다(빈 창 방지).
