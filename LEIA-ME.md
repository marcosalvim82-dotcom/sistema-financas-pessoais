# Finanças — controle pessoal

Sistema de gestão financeira que roda **no seu computador, dentro do navegador**.
Sem instalação, sem conta, sem servidor, sem internet. Nenhum dado sai da sua máquina.

---

## Como abrir

Dê **duplo clique em `index.html`**.

Recomendo fixar na barra de tarefas: abra o arquivo no Chrome ou Edge,
menu `⋮` → *Salvar e compartilhar* → *Criar atalho* → marque *Abrir como janela*.
Fica com cara de aplicativo, sem barra de endereço.

> Se você tinha um atalho antigo para `Financas.html`, ele continua funcionando —
> aquele arquivo agora só redireciona para `index.html`.

**Para usar no celular**, publique numa hospedagem gratuita: veja
[PUBLICAR.md](PUBLICAR.md). Publicado, o app pode ser instalado na tela inicial
e funciona offline. Lembre que os dados **não** sincronizam entre dispositivos —
cada navegador tem o seu banco local; use o backup `.json` para levar de um para outro.

---

## A rotina do dia a dia

Uma vez por mês (ou por semana, se preferir):

1. Baixe o extrato da conta e a fatura do cartão no app do banco.
2. **Arraste os arquivos para dentro da tela.** Pode soltar vários de uma vez.
3. Se aparecer algo na aba **Revisar**, responda. Costuma levar menos de um minuto.

Só isso. O resto — categorizar, detectar cartão e conta, achar parcelas,
reconhecer contas fixas, projetar o saldo, calcular metas — é automático.

### Onde baixar cada arquivo

| Banco | Conta corrente | Fatura do cartão |
|---|---|---|
| Nubank | App › Conta › ⋯ › Exportar extrato (OFX ou CSV) | App › Cartão › Faturas › Exportar (CSV) |
| Itaú | Internet banking › Extrato › Salvar em OFX | Fatura › Salvar em OFX |
| Bradesco | Extrato › Exportar › OFX (Money 2000) | Fatura digital › OFX |
| Banco do Brasil | Extrato › Salvar › OFX | Fatura Ourocard › OFX |
| Santander | Extrato › Exportar › OFX | Fatura › OFX |
| Inter | App › Extrato › Compartilhar › OFX/CSV | App › Cartão › Fatura › CSV |
| C6 Bank | App › Extrato › Exportar › OFX | App › Cartão › Fatura › CSV |
| Caixa | Internet banking › Extrato › Salvar OFX | — |

**Prefira sempre OFX.** Ele traz um identificador único por lançamento, o que torna
a deduplicação perfeita: você pode reimportar o mesmo período quantas vezes quiser
que nada duplica. CSV e XLSX também funcionam bem.

---

## O que o sistema faz sozinho

- **Detecta o banco, a conta e o cartão** a partir do próprio arquivo. Você não cadastra nada.
- **Nunca duplica lançamento.** Quatro camadas de proteção: hash do arquivo, identificador
  do banco, impressão digital determinística e verificação difusa. Reimportar o mesmo
  extrato dez vezes dá exatamente o mesmo resultado.
- **Classifica cada lançamento** com cerca de 250 regras feitas para descritores brasileiros
  (PIX, boleto, débito automático, adquirentes, as principais redes e prestadoras),
  mais o que aprende com você. Na prática fica acima de 95% automático depois do primeiro mês.
- **Aprende com cada correção.** Corrigir uma vez cria a regra; a mesma pergunta não volta.
- **Separa cartão de conta corrente.** A compra é despesa na data da compra; o dinheiro
  sai no vencimento da fatura. O pagamento da fatura é conciliado e **não** conta como
  despesa nova — sem contagem dobrada.
- **Reconhece parcelas** (`3/12`, `PARC 03/12`), monta o plano de parcelamento e projeta
  o que ainda vai cair nos próximos meses.
- **Deduz o ciclo do cartão** (dia de fechamento e de vencimento) pelo comportamento dos
  lançamentos, e calcula limite disponível e previsão das próximas seis faturas.
- **Concilia transferências** entre suas contas: elas somem dos relatórios de receita e
  despesa, mas continuam no fluxo de caixa.
- **Detecta contas fixas, assinaturas e salário** depois de três ocorrências, e monta o
  calendário do mês sem você cadastrar nada.
- **Projeta o saldo dos próximos 90 dias**, com faixa de incerteza, e avisa antes de você
  ficar no vermelho.
- **Confere o saldo declarado pelo banco** contra a soma dos lançamentos e avisa se houver
  período faltando.

---

## Backup — leia esta parte

Os dados ficam **só neste navegador, neste computador**. Se você limpar os dados de
navegação, trocar de máquina ou reinstalar o sistema operacional, eles vão embora.

Em **Ajustes › Baixar backup** você gera um arquivo `.json` com tudo.
Guarde no Drive, no OneDrive ou onde preferir. Para restaurar, é só arrastar
esse `.json` de volta para dentro do app.

O sistema lembra você se passar mais de 30 dias sem backup.

---

## Atalhos de teclado

| Tecla | O que faz |
|---|---|
| `1` a `9` | Muda de tela |
| `I` | Importar extrato |
| `Ctrl+K` | Buscar lançamentos |
| `Esc` | Fecha a janela aberta |

---

## O que esta versão **não** faz

Coisas que precisam de um servidor ou de conexão externa, e que ficaram de fora:

- **Leitura de PDF.** Baixe OFX ou CSV no banco — praticamente todos oferecem.
- **Cotações automáticas de investimentos.** Na aba Investimentos você informa o valor
  atual de cada posição; atualizar uma vez por mês já deixa a evolução correta.
- **Open Finance.** Exige credenciamento de agregador e servidor próprio.
- **Sincronização entre dispositivos.** Use o backup para levar os dados de uma máquina
  para outra.

Quando você instalar o **Node.js**, dá para gerar a versão com servidor local e banco
SQLite, que resolve todos esses pontos. O arquivo de backup `.json` é justamente o
formato de migração — nada se perde.

---

## Estrutura dos arquivos

```
index.html         abre o sistema
Financas.html      redirecionamento, para atalhos antigos
manifest.webmanifest  identidade do app instalável (PWA)
sw.js              service worker: cache offline e aviso de atualização
_headers           cabeçalhos de segurança e cache para a hospedagem
icons/             ícones do app em vários tamanhos
css/app.css        identidade visual, tema claro e escuro
js/util.js         formatos brasileiros: dinheiro, datas, texto, similaridade
js/store.js        armazenamento local (IndexedDB) e backup
js/rules.js        categorias e as regras semeadas para o Brasil
js/parse.js        leitores de OFX, CSV e XLSX
js/engine.js       deduplicação, categorização, cartões, parcelas, recorrências
js/insights.js     previsão de caixa e detectores de insight
js/charts.js       gráficos em SVG
js/xlsx.js         gerador de planilha Excel
js/ui.js           navegação, importação, modais
js/views.js        Painel, Revisar, Lançamentos
js/views2.js       Cartões, Calendário, Metas, Investimentos, Relatórios, Ajustes
js/demo.js         dados fictícios de demonstração
```

Tudo é JavaScript comum, sem dependência externa e sem etapa de build.
Se eu atualizar algum arquivo, abra o app e pressione `Ctrl+F5` para o navegador
recarregar os scripts em vez de usar a versão em cache. Na versão publicada,
mude também a linha `const VERSAO` no topo do `sw.js` — é ela que avisa o
navegador de que existe uma versão nova.

---

## Se algo der errado

- **A tela quebra em uma aba específica:** as outras continuam funcionando e seus dados
  estão salvos. Baixe um backup em Ajustes e me mande o arquivo.
- **Um extrato não é lido:** o app diz o motivo. Quase sempre é CSV com cabeçalho fora do
  padrão — tente baixar em OFX.
- **Categorias erradas em massa:** Ajustes › *Reprocessar categorização de tudo*.
  Suas correções manuais nunca são sobrescritas.
