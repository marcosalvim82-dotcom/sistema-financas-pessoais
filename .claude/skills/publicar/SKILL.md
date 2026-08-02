---
name: publicar
description: Fluxo completo de publicação do app de finanças pessoais — subir a versão do service worker, rodar o teste de fumaça, escrever o commit e deixar pronto para envio. Use sempre que o usuário pedir para publicar, subir, mandar para o ar, atualizar o site, fazer deploy, "colocar no GitHub", ou disser que quer ver uma alteração funcionando no celular ou no endereço publicado. Use também logo depois de qualquer alteração em arquivos do app (js/, css/, index.html, manifest, sw.js), mesmo que o usuário não use a palavra "publicar" — sem os passos daqui a alteração não chega ao navegador dele.
---

# Publicar o app de finanças

## Por que esta skill existe

Publicar aqui não é `git push`. Existe um passo invisível que, se esquecido,
faz a alteração **não chegar ao usuário** — e o sintoma é o pior possível: tudo
parece ter funcionado, o site está no ar, mas o navegador continua servindo a
versão antiga. Isso já aconteceu neste projeto e custou uma sessão inteira de
diagnóstico errado.

O passo é subir `const VERSAO` no `sw.js`. O service worker guarda o app inteiro
em cache; sem uma versão nova, ele não busca nada.

## Como o app chega ao ar

```
alteração local → commit → git push → Cloudflare detecta → publica (~30s)
```

A Cloudflare Pages está conectada ao repositório
`marcosalvim82-dotcom/sistema-financas-pessoais`. Não há etapa de build: são
arquivos estáticos servidos direto.

O endereço publicado é `https://sistema-financas-pessoais.marcosalvim822.workers.dev`.

## O procedimento

Siga na ordem. Os passos 1 e 2 são os que costumam ser esquecidos.

### 1. Subir a versão do service worker

Se qualquer arquivo do app mudou — `js/*`, `css/*`, `index.html`,
`manifest.webmanifest` — incremente `const VERSAO` no topo do `sw.js`:

```
const VERSAO = 'v1.3.0';   →   const VERSAO = 'v1.3.1';
```

Use o terceiro número para correções e ajustes; o segundo para funcionalidade
nova. O valor exato não importa para o sistema — o que importa é que **mude**,
porque é a mudança que dispara o download da versão nova.

Alteração só em documentação (`*.md`) não precisa de bump: nada disso é servido
ao navegador.

### 2. Registrar arquivos novos no cache offline

Se você **criou** um arquivo `.js` ou `.css`, acrescente-o à lista `ARQUIVOS` no
`sw.js`. Esquecer isso não quebra o site online, mas quebra o modo offline — e
o usuário só descobre no avião.

Confira: todo `<script src>` do `index.html` precisa ter uma linha
correspondente em `ARQUIVOS`.

### 3. Rodar o teste de fumaça

```bash
cd C:\Users\marco\Financas && cmd /c testar.cmd
```

Ele abre o app num navegador headless, monta dados de demonstração, renderiza as
nove telas e confere os cálculos, os leitores de arquivo e as regras invioláveis.
A saída termina em `RESULTADO: tudo certo` ou `RESULTADO: TESTE FALHOU`.

**Se falhar, pare.** Os colchetes na linha do título dizem o que quebrou. Conserte
antes de commitar — publicar código quebrado num app que o usuário consulta para
decidir gastos é pior do que não publicar.

O comando devolve muito HTML. Filtre para ler só o que interessa:

```powershell
$r = & ".\testar.cmd" 2>&1; $r | Select-String -Pattern "^<title>|RESULTADO"
```

### 4. Atualizar a documentação, se o comportamento mudou

- `LEIA-ME.md` — o que o app faz e não faz, do ponto de vista do usuário. Tem
  uma seção "O que esta versão **não** faz"; se você acabou de implementar algo
  que está listado ali, tire de lá.
- `CLAUDE.md` — tabela de módulos, se você criou arquivo novo.

Documentação que mente é pior que documentação ausente: o usuário toma decisão
com base nela.

### 5. Commitar

Estilo dos commits deste projeto: **português, explicando o porquê, não o quê**.
O diff já mostra o quê. A mensagem existe para quem daqui a seis meses precisa
entender a decisão.

```
Assunto no imperativo, uma linha, sem ponto final

Qual era o problema e por que a solução escolhida. Se houve alternativa
descartada, diga qual e por quê.

Se algo foi verificado, diga como foi verificado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

O `git` local não tem `user.name` configurado; passe a identidade na chamada:

```bash
git -c user.name="Marco" -c user.email="marcosalvim822@gmail.com" commit -m "..."
```

### 6. Parar aqui — não dar push

`git push` está bloqueado no `.claude/settings.json`, de propósito. Publicar é
ação que sai da máquina e o usuário quer decidir quando isso acontece.

Deixe o commit pronto e diga a ele:

> Pronto. Dê duplo clique em **`publicar.cmd`** e confirme com `s`.

O `publicar.cmd` mostra o que está pendente, roda o teste de novo, integra
alterações que tenham vindo do GitHub, pede confirmação e envia.

## Depois de publicar

Se o usuário disser que não vê a alteração, a causa quase certa é cache. Peça:

> Atualize com **Ctrl+Shift+R** (recarga forçada).

Se ele estiver com o app aberto, deve aparecer o aviso *"Nova versão disponível"*
com botão de atualizar. Esse aviso só funciona se o passo 1 foi feito.

## Problemas que já aconteceram aqui

| Sintoma | Causa | Conserto |
|---|---|---|
| Alteração publicada mas o usuário vê a versão antiga | `VERSAO` não foi incrementada | Passo 1, publicar de novo |
| `git push` recusado com "fetch first" | Alguém mexeu no repositório pelo site do GitHub | `git fetch origin` e `git rebase origin/main`, depois testar de novo |
| App quebra sem internet | Arquivo novo fora de `ARQUIVOS` | Passo 2 |
| Teste passa local mas o site quebra | Script novo sem `<script src>` no `index.html` | Conferir os dois lugares |

## Verificar o que está de fato no ar

Quando houver dúvida sobre qual versão o usuário está recebendo, busque o
arquivo publicado em vez de supor:

```
https://sistema-financas-pessoais.marcosalvim822.workers.dev/sw.js
```

A linha `const VERSAO` diz exatamente qual versão a Cloudflare está servindo.
Comparar isso com o local resolve em segundos uma discussão que por suposição
levaria vários turnos.
