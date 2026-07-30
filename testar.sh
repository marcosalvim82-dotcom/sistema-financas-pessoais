#!/usr/bin/env bash
# Teste de fumaça em Linux/macOS — mesmo teste do testar.cmd, para rodar
# no GitHub Actions. Usa Chrome headless, sem instalar nada.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NAV=""
for c in "${CHROME_BIN:-}" google-chrome-stable google-chrome chromium-browser chromium \
         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
         "/c/Program Files/Google/Chrome/Application/chrome.exe"; do
  [ -z "$c" ] && continue
  if command -v "$c" >/dev/null 2>&1; then NAV="$c"; break; fi
  if [ -x "$c" ]; then NAV="$c"; break; fi
done

if [ -z "$NAV" ]; then
  echo "Nao encontrei Chrome nem Chromium. O teste precisa de um deles."
  exit 1
fi

# No Git Bash o navegador é um programa Windows e não entende o caminho
# estilo /c/Users. cygpath converte; em Linux ele não existe e o caminho
# já está certo.
if command -v cygpath >/dev/null 2>&1; then
  ALVO="file:///$(cygpath -m "$DIR")/teste/fumaca.html"
else
  ALVO="file://$DIR/teste/fumaca.html"
fi

PERFIL="$(mktemp -d)"
SAIDA="$(mktemp)"
trap 'rm -rf "$PERFIL" "$SAIDA"' EXIT

echo "Rodando teste de fumaca com: $NAV"

"$NAV" --headless=new --disable-gpu --no-sandbox --no-first-run \
  --no-default-browser-check --user-data-dir="$PERFIL" \
  --allow-file-access-from-files --virtual-time-budget=10000 \
  --dump-dom "$ALVO" > "$SAIDA" 2>/dev/null

if [ ! -s "$SAIDA" ]; then
  echo "O navegador nao gerou saida. Teste inconclusivo."
  exit 1
fi

TITULO="$(grep -o '<title>.*</title>' "$SAIDA" | head -1)"
echo
echo "$TITULO"
echo

# Procura FALHOU só na linha do título: o resto do arquivo contém o
# código-fonte do teste, onde essa palavra aparece como literal.
if printf '%s' "$TITULO" | grep -q "FALHOU"; then
  echo "RESULTADO: TESTE FALHOU - veja os colchetes acima"
  exit 1
fi

echo "RESULTADO: tudo certo"
exit 0
