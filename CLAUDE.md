# Finanças — contexto para o Claude

App de finanças pessoais **100% cliente**: HTML + CSS + JavaScript clássico, sem
build, sem dependência externa, sem backend. Roda abrindo `index.html` do disco
ou servido como site estático. Os dados ficam no IndexedDB do navegador.

Idioma de tudo — interface, comentários, commits, nomes de função novos: **português do Brasil**.

---

## Rodar e testar

Abrir: duplo clique em `index.html` (ou publicar, ver `PUBLICAR.md`).

Testar depois de qualquer alteração:

```bash
./testar.cmd
```

Roda `teste/fumaca.html` em Edge/Chrome headless: carrega os 12 módulos, monta um
conjunto de lançamentos sintético e renderiza as 9 telas. Duas linhas de saída,
ambas precisam começar com `OK`. Se der `FALHOU`, o nome da tela ou da checagem vem
entre colchetes.

Não existe suíte de teste unitário. O teste de fumaça é a rede de segurança — rode
sempre antes de dizer que terminou.

## Gmail (js/gmail.js)

Único módulo que fala com a rede. Tudo o mais é offline por princípio.

- OAuth implícito via Google Identity Services, escopo `gmail.readonly`.
  O token fica **só em variável de módulo** — nunca em `DB.data`, nunca no disco.
  Só o Client ID é persistido, em `settings.gmailClientId`.
- Exige `https://`. Em `file://` o módulo detecta e explica em vez de falhar.
- Ao mexer nos domínios do Google usados, **atualize a CSP no `_headers`** —
  ela bloqueia externo por padrão e é o que quebra primeiro.
- Anexo baixado vira `File` e entra em `UI.handleFiles`, o mesmo caminho do
  arrastar-e-soltar. Não existe caminho de importação paralelo.
- PDF entra na busca só para ser listado; `PARSE.parseFile` recusa com explicação.

## Publicar

O procedimento completo está na skill **`publicar`**
(`.claude/skills/publicar/SKILL.md`). Invoque-a ao terminar qualquer alteração
nos arquivos do app — ela cobre os passos que, esquecidos, fazem a alteração
não chegar ao navegador do usuário.

O resumo, para não depender de carregar a skill:

1. **Incremente `const VERSAO` no topo do `sw.js`.** Sem isso o service worker
   serve a versão antiga do cache e a alteração parece não ter funcionado.
   É a causa número um de "mudou nada".
2. Arquivo novo precisa entrar na lista `ARQUIVOS` do `sw.js`, senão o modo
   offline quebra.
3. Rode `testar.cmd`.
4. Commit em português, explicando o porquê.
5. **Não faça `git push`** — está bloqueado no `.claude/settings.json` de
   propósito. Avise que basta duplo clique em `publicar.cmd`.

---

## Regras invioláveis

Quebrar qualquer uma destas corrompe dados do usuário de forma silenciosa.

1. **Dinheiro é `BIGINT` de centavos, sempre.** Nunca float, nunca string. Todo
   campo monetário termina em `Cents`. Formatação só na borda, com `U.money()`.
2. **`categorySource === 'user'` é sagrado.** Nenhuma reclassificação automática
   pode sobrescrever o que a pessoa corrigiu à mão. Toda função que altera
   `categoryId` em lote precisa checar isso primeiro.
3. **A impressão digital de deduplicação não muda de fórmula.** `U.hash(conta|data|valor|descritorNorm#ordinal)`
   em `engine.js`. Se mudar, todo o histórico vira duplicata na próxima importação.
   Alteração aqui exige migração explícita em `store.js`.
4. **Todo texto vindo do banco passa por `U.esc()` antes de virar HTML.** Descritores
   de extrato são dados externos. A UI é construída com concatenação de string;
   um `<` não escapado quebra a tela ou pior.
5. **Compra no cartão é despesa na data da compra; o pagamento da fatura é
   transferência.** Nunca contar os dois como despesa. Ver `linkTransfers()`.
6. **Importar o mesmo arquivo duas vezes não pode mudar nada.** Idempotência é
   requisito, não otimização.
7. **Nada de dependência externa, CDN, fonte remota ou chamada de rede.** O app
   funciona offline e sem servidor por decisão de projeto. Se algo parece precisar
   de biblioteca, escrever à mão (foi assim com o leitor de ZIP e o gerador de XLSX).

---

## Mapa dos arquivos

Scripts clássicos, carregados **nesta ordem** em `index.html` — cada um pendura um
objeto em `window`. Não são módulos ES (não funcionariam em `file://`).

| Arquivo | Global | Responsabilidade |
|---|---|---|
| `js/util.js` | `U` | Dinheiro, datas, normalização de descritor, similaridade por trigramas, helpers de DOM |
| `js/store.js` | `DB` | IndexedDB (fallback localStorage), gravação adiada, backup/restauração |
| `js/rules.js` | `RULES` | 15 categorias-mãe + subcategorias, ~95 regras semeadas para o Brasil, assinaturas de instituições |
| `js/parse.js` | `PARSE` | Leitores de OFX, CSV e XLSX; detecção de codificação, delimitador, cabeçalho e instituição |
| `js/pdf.js` | `PDF` | Leitor de PDF do zero: varre objetos, infla streams (`DecompressionStream`), expande ObjStm, decodifica fontes via ToUnicode e emite texto com coordenadas |
| `js/pdftx.js` | `PDFTX` | Converte as linhas do PDF em lançamentos: data no começo, valor no fim, descrição no meio; filtra cabeçalho, total e rodapé |
| `js/engine.js` | `ENGINE` | Deduplicação, cascata de categorização, aprendizado, parcelamentos, ciclos de cartão, transferências, recorrências |
| `js/insights.js` | `INSIGHTS` | Previsão de caixa 90 dias, detectores de insight, séries do painel |
| `js/charts.js` | `CHARTS` | Gráficos em SVG escritos à mão |
| `js/xlsx.js` | `XLSXOUT` | Gerador de `.xlsx` (ZIP com entradas STORED + CRC32 próprio) |
| `js/ui.js` | `UI` | Casca, navegação, importação, modais, `UI.actions`, seletor de categoria |
| `js/views.js` | — | Telas Painel, Revisar, Lançamentos |
| `js/views2.js` | — | Telas Cartões, Calendário, Metas, Investimentos, Relatórios, Ajustes |
| `js/demo.js` | — | Gerador de dados fictícios |

`css/app.css` tem os tokens de cor (tema claro e escuro) no topo. Cor nova entra
como variável, nunca hex solto no componente.

**Ao criar um arquivo JS novo**, incluir em três lugares: `index.html`,
`sw.js` (lista `ARQUIVOS`) e `teste/fumaca.html`.

---

## Modelo de dados

Tudo vive em `DB.data`, um objeto único serializado como JSON.

```js
transaction = {
  id, accountId | cardId,        // exatamente um dos dois
  date,                          // competência: quando o gasto aconteceu
  cashDate,                      // caixa: quando o dinheiro sai (vencimento, no cartão)
  amountCents,                   // negativo = saída
  descriptorRaw,                 // exatamente como veio do banco, nunca alterado
  descriptorNorm,                // limpo, usado para regra, busca e similaridade
  merchantKey, merchantName,
  categoryId, categorySource, categoryConfidence,
  method,                        // pix | boleto | ted | doc | cash | fee | yield
  status,                        // posted | projected | pending
  isTransfer, hidden, needsReview,
  installmentPlanId, installmentNo, installmentTotal,
  linkId, linkedCardId, linkedStatementKey,
  fingerprint, externalId, importId, tags, notes
}
```

Coleções: `accounts`, `cards`, `categories`, `merchants`, `rules`, `transactions`,
`installmentPlans`, `recurrences`, `links`, `goals`, `budgets`, `investPositions`,
`imports`, `savedViews`, `dismissedInsights`, `settings`.

**Não existem** as coleções `statements` nem as parcelas futuras: faturas de cartão
e lançamentos projetados são **calculados na hora** (`ENGINE.statementsForCard`,
`ENGINE.projectedInstallments`, `ENGINE.projectedRecurrences`). Isso evita
dessincronização — e evita que uma parcela projetada colida com a real quando ela
chega no extrato.

Campo novo em `transaction`: adicionar o padrão em `DB.emptyDataset()` e conferir
que `migrate()` preenche a chave em bases antigas.

---

## Cascata de categorização

Em `ENGINE.classify()`, nesta ordem, parando na primeira que responde:

1. `categorySource === 'user'` — decisão manual, encerra
2. Regras do usuário (`DB.data.rules`), por prioridade
3. Memória de estabelecimento (`DB.data.merchants`) — aprendida com as correções
4. Regras semeadas (`RULES.SEED_RULES`) — confiança 0,88
5. Vizinho mais próximo por trigramas sobre os próprios lançamentos
6. Heurísticas por meio de pagamento

Abaixo de `settings.reviewThreshold` (0,62) o lançamento vai para a fila de revisão.
`ENGINE.learn()` é o ponto de entrada de toda correção: atualiza o lançamento, a
memória de estabelecimento e, opcionalmente, cria regra e aplica aos semelhantes.

---

## Tarefas comuns

**Categoria errada para um estabelecimento** → `js/rules.js`, array `SEED_RULES`.
O termo é comparado com `descriptorNorm` (maiúsculas, sem acento, sem prefixo de
adquirente). Confira com `U.normalizeDescriptor('...')` antes de escrever a regra.

**Banco novo ou CSV não reconhecido** → `js/parse.js`. Sinônimos de cabeçalho no
objeto `HEAD`; instituições em `RULES.INSTITUTIONS`. Se o cabeçalho não for
reconhecido, `inferColumns()` tenta pelo conteúdo.

**Tela nova** → criar o renderizador em `UI.viewRenderers.nome`, adicionar em
`VIEWS` (`js/ui.js`) e, se for de uso frequente, em `MOBILE_VIEWS`.

**Botão novo** → `data-act="algo"` no HTML e `UI.actions.algo = function (el, e)`.
A delegação de eventos já está montada em `ui.js`; não adicione listeners avulsos
em elementos que a re-renderização destrói.

**Depois de mexer em regra, parser ou motor**, oferecer ao usuário
*Ajustes › Reprocessar categorização de tudo* — `ENGINE.reclassifyAll()`
renormaliza os descritores e reclassifica, preservando as correções manuais.

---

## Armadilhas conhecidas

- `U.normalizeDescriptor` remove o marcador de parcela. **Detecte parcela a partir
  de `descriptorRaw`**, não do normalizado.
- Prefixos de adquirente (`PG *`, `IFD*`) são removidos; nomes que são o próprio
  estabelecimento (`UBER *`, `AMZN *`) **não** — já quebrou uma vez.
- `UI.render()` reconstrói a árvore inteira. Estado de UI vive em `UI.state`, não no DOM.
- `UI.toast(msg, kind, {persist:true})` para avisos com botão; sem `persist` ele
  some em 4,5 s e o botão vai junto.
- Saldo da conta é o **declarado pelo banco** (`account.balanceCents`) mais o que
  veio depois dessa data — não a soma de todos os lançamentos.
- Ao publicar versão nova, incrementar `VERSAO` em `sw.js`, senão o navegador
  continua servindo o app antigo do cache.
- `teste/` é só desenvolvimento; não precisa subir para a hospedagem.
