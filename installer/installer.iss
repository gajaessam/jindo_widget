; 진도 위젯 설치 스크립트 (Inno Setup 6)
; 빌드: scripts\build-release.ps1 이 버전과 앱 폴더를 넘겨 줍니다.
; 기존 v0.2.x(Python) 설치본과 같은 AppId·설치 위치를 써서 그 위에 덮어씁니다(두 개 설치되지 않음).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef AppBundle
  #define AppBundle "..\dist\win-unpacked"
#endif

[Setup]
AppId={{B96128C4-53BB-48FE-A357-A87F7B09D641}
AppName=진도 위젯
AppVersion={#AppVersion}
AppVerName=진도 위젯 {#AppVersion}
AppPublisher=가정재연쌤 (@gajae_ssam)
AppPublisherURL=https://github.com/gajaessam/jindo_widget
DefaultDirName={localappdata}\Programs\JindoWidget
DefaultGroupName=진도 위젯
UninstallDisplayName=진도 위젯
UninstallDisplayIcon={app}\JindoWidget.exe
SetupIconFile=..\assets\icon.ico
OutputDir=..\release
OutputBaseFilename=JindoWidget-Setup-v{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
; 관리자 권한 없이 현재 사용자에게 설치 (학교 PC)
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
DisableDirPage=yes
DisableProgramGroupPage=yes
UsePreviousAppDir=no
; 앱과 같은 이름의 뮤텍스. 진도 위젯(옛 버전 포함)이 켜져 있으면 끄라고 안내합니다.
AppMutex=JindoWidget-SingleInstance
CloseApplications=yes
RestartApplications=no

[Languages]
#if FileExists(AddBackslash(CompilerPath) + "Languages\Korean.isl")
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
#else
Name: "korean"; MessagesFile: "compiler:Default.isl"
#endif

[Tasks]
Name: "desktopicon"; Description: "바탕 화면에 바로 가기 만들기"; GroupDescription: "추가 아이콘:"; Flags: unchecked

[InstallDelete]
; 옛 Python 버전 파일 정리
Type: filesandordirs; Name: "{app}\_internal"
Type: files; Name: "{app}\UsagiJindoUpdater.exe"
; 이전 Electron 버전에서 남은 파일 정리 (새로 다시 깔림)
Type: filesandordirs; Name: "{app}\resources"
Type: filesandordirs; Name: "{app}\locales"

[Files]
Source: "{#AppBundle}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\docs\JindoWidget-Guide.pdf"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\진도 위젯"; Filename: "{app}\JindoWidget.exe"; WorkingDir: "{app}"
Name: "{autoprograms}\진도 위젯 사용 설명서"; Filename: "{app}\JindoWidget-Guide.pdf"
Name: "{autodesktop}\진도 위젯"; Filename: "{app}\JindoWidget.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
; 자동 실행이 켜져 있던 사용자는 새 실행 파일을 가리키도록 고쳐 둡니다(옛 값 덮어쓰기).
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "JindoWidget"; ValueData: """{app}\JindoWidget.exe"""; Check: AutoStartRegistered

[Run]
Filename: "{app}\JindoWidget.exe"; Description: "진도 위젯 실행"; Flags: nowait postinstall skipifsilent
Filename: "{app}\JindoWidget-Guide.pdf"; Description: "사용 설명서 열기"; Flags: shellexec nowait postinstall skipifsilent unchecked

[Code]
function AutoStartRegistered: Boolean;
begin
  Result := RegValueExists(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'JindoWidget');
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  // 프로그램을 지우면 자동 실행 등록도 지웁니다. 진도 데이터(%APPDATA%\UsagiJindo)는 남겨 둡니다.
  if CurUninstallStep = usUninstall then
    RegDeleteValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'JindoWidget');
end;
