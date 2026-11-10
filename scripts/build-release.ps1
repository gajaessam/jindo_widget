# 진도 위젯 설치 파일 만들기: release\JindoWidget-Setup-v{버전}.exe
# 순서: 테스트 → 설명서 PDF → 앱 묶기(electron-builder) → 설치 파일(Inno Setup)
#   사용법: npm run release      (Inno Setup 6이 설치되어 있어야 합니다)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath (Join-Path $PSScriptRoot "..")

$Version = (Get-Content package.json -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "package.json의 version은 1.2.3 같은 모양이어야 해요: $Version" }
Write-Output "진도 위젯 v$Version 설치 파일을 만들어요."

npm test
if ($LASTEXITCODE -ne 0) { throw "자동 테스트가 실패해서 멈췄어요." }

npm run guide-pdf
if ($LASTEXITCODE -ne 0 -or -not (Test-Path "docs\JindoWidget-Guide.pdf")) { throw "설명서 PDF를 만들지 못했어요." }

if (Test-Path dist) { Remove-Item dist -Recurse -Force }
npm run pack
if ($LASTEXITCODE -ne 0 -or -not (Test-Path "dist\win-unpacked\JindoWidget.exe")) { throw "앱 묶기에 실패했어요." }

$Iscc = @(
  (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
  (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe"),
  (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $Iscc) {
  $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($cmd) { $Iscc = $cmd.Source }
}
if (-not $Iscc) { throw "Inno Setup 6(ISCC.exe)을 찾지 못했어요. 설치하거나 GitHub Actions에서 만들어 주세요." }

New-Item -ItemType Directory -Force release | Out-Null
Get-ChildItem release -Filter "JindoWidget-Setup-v*.exe" -ErrorAction SilentlyContinue | Remove-Item -Force
$Bundle = (Resolve-Path "dist\win-unpacked").Path
& $Iscc "/DAppVersion=$Version" "/DAppBundle=$Bundle" "installer\installer.iss"
if ($LASTEXITCODE -ne 0) { throw "설치 파일 만들기에 실패했어요." }

$Installer = "release\JindoWidget-Setup-v$Version.exe"
if (-not (Test-Path $Installer)) { throw "설치 파일을 찾지 못했어요: $Installer" }
$Hash = (Get-FileHash $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
$Size = [math]::Round((Get-Item $Installer).Length / 1MB, 1)
Write-Output "완료: $Installer ($Size MB)"
Write-Output "SHA-256: $Hash"
