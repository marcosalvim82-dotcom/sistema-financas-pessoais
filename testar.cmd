@echo off
setlocal

set "NAV="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "NAV=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined NAV if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "NAV=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined NAV if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "NAV=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined NAV if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "NAV=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined NAV if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "NAV=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not defined NAV (
  echo Nao encontrei Edge nem Chrome. O teste precisa de um deles.
  exit /b 1
)

set "DIR=%~dp0"
set "DIR=%DIR:\=/%"
set "OUT=%TEMP%\financas-fumaca.html"
if exist "%OUT%" del "%OUT%"

echo Rodando teste de fumaca...
"%NAV%" --headless=new --disable-gpu --no-first-run --no-default-browser-check --user-data-dir="%TEMP%\financas-perfil-teste" --allow-file-access-from-files --virtual-time-budget=10000 --dump-dom "file:///%DIR%teste/fumaca.html" > "%OUT%" 2>nul

if not exist "%OUT%" (
  echo O navegador nao gerou saida. Teste inconclusivo.
  exit /b 1
)

echo.
findstr /C:"<title>" "%OUT%"
echo.

rem Procura FALHOU apenas na linha do titulo: o resto do arquivo contem
rem o codigo-fonte do teste, que tem essa palavra como literal.
findstr /C:"<title>" "%OUT%" | findstr /C:"FALHOU" >nul
if errorlevel 1 (
  echo RESULTADO: tudo certo
  exit /b 0
)
echo RESULTADO: TESTE FALHOU - veja os colchetes acima
exit /b 1
