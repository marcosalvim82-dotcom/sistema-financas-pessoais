@echo off
setlocal
cd /d "%~dp0"

echo ===========================================
echo   Publicar o app
echo ===========================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Esta pasta nao e um repositorio git.
  echo.
  pause
  exit /b 1
)

echo Alteracoes que ainda nao foram publicadas:
echo.
git log --oneline origin/main..HEAD 2>nul || git log --oneline -5
echo.

echo Rodando o teste antes de publicar...
call "%~dp0testar.cmd"
if errorlevel 1 (
  echo.
  echo O teste FALHOU. Nao vou publicar assim.
  echo Peca ao Claude para corrigir antes de tentar de novo.
  echo.
  pause
  exit /b 1
)

echo.
set "RESP="
set /p RESP="Publicar agora? (s = sim, qualquer outra tecla cancela): "
if /i not "%RESP%"=="s" (
  echo.
  echo Cancelado. Nada foi enviado.
  echo.
  pause
  exit /b 0
)

echo.
git rev-parse --abbrev-ref --symbolic-full-name @{u} >nul 2>&1
if errorlevel 1 (
  echo Primeiro envio. Vai abrir uma janela do GitHub pedindo login.
  echo Autorize e volte para esta janela.
  echo.
  git push -u origin main
) else (
  git push
)

if errorlevel 1 (
  echo.
  echo Algo deu errado no envio. Leia a mensagem acima.
  echo Se falar em autenticacao, e so tentar de novo e fazer o login.
) else (
  echo.
  echo Enviado com sucesso.
  echo A Cloudflare publica sozinha em cerca de 30 segundos.
)

echo.
pause
