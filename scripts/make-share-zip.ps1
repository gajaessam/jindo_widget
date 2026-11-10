# 공유용 zip을 만든다: 설치 안내 PDF + 설치 파일.
# 실행: powershell -ExecutionPolicy Bypass -File scripts\make-share-zip.ps1
# 먼저 설치 파일을 빌드해서 dist\<버전> 폴더에 넣어 두어야 한다.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$releaseDir = Join-Path $root "dist\$version"
$setup = Join-Path $releaseDir "geupsik-alimi-setup-$version.exe"
if (-not (Test-Path $setup)) { throw "설치 파일이 없어요: $setup" }

$staging = Join-Path $env:TEMP "geupsik-share-$version"
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $staging | Out-Null

# 한글 경로는 cmd를 거치며 깨질 수 있어 영문 이름으로 만든 뒤 바꾼다.
$tempPdf = Join-Path $staging 'guide.pdf'
& (Join-Path $root 'node_modules\.bin\electron.cmd') (Join-Path $root 'scripts\make-guide.js') $tempPdf
if (-not (Test-Path $tempPdf)) { throw '설치 안내 PDF를 만들지 못했어요.' }
Rename-Item $tempPdf '1_먼저읽어주세요.pdf'
Copy-Item $setup $staging

# GitHub는 첨부 파일 이름의 한글을 바꾸므로 zip 이름은 영문으로 둔다.
$zip = Join-Path $releaseDir "geupsik-alimi-$version.zip"
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false, [System.Text.Encoding]::UTF8)
Remove-Item $staging -Recurse -Force
Write-Output "zip 생성: $zip"
