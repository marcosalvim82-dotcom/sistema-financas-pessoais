/* ══════════════════════════════════════════════════════════════════
   pdftx.js — reconhece lançamentos nas linhas extraídas de um PDF.

   A leitura é feita sobre as COLUNAS, não sobre o texto corrido. Isso
   resolve quatro casos que quebram um leitor ingênuo:

   1. Coluna de saldo. Em "12/07  IFOOD  64,80  4.512,30" o último
      número é o saldo, não o valor. Quem lê o texto de trás para a
      frente importa o extrato inteiro errado, e o erro passa
      despercebido porque os números "parecem" plausíveis.
   2. Data em cabeçalho de grupo. Muitos apps escrevem a data uma vez
      e listam as transações do dia abaixo, sem repeti-la.
   3. Descrição em duas linhas. O nome do estabelecimento quebra e a
      continuação vira uma linha órfã.
   4. Valor com sinal em coluna separada (D/C), comum em extratos
      de banco tradicional.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const T = {};

  const RX_DATA = new RegExp(
    '^(' +
    '\\d{1,2}[\\/\\-.]\\d{1,2}(?:[\\/\\-.]\\d{2,4})?' +
    '|\\d{1,2}\\s+(?:de\\s+)?[A-Za-zç]{3,9}\\.?(?:\\s+(?:de\\s+)?\\d{2,4})?' +
    ')$', 'i');

  const RX_DATA_PREFIXO = new RegExp(
    '^(' +
    '\\d{1,2}[\\/\\-.]\\d{1,2}(?:[\\/\\-.]\\d{2,4})?' +
    '|\\d{1,2}\\s+(?:de\\s+)?[A-Za-zç]{3,9}\\.?(?:\\s+(?:de\\s+)?\\d{2,4})?' +
    ')\\s+', 'i');

  // Um valor monetário isolado numa célula.
  const RX_VALOR = new RegExp(
    '^(?:R\\$\\s*)?\\(?[-+]?\\s*\\d{1,3}(?:\\.\\d{3})*,\\d{2}\\s*\\)?[-+]?\\s*(?:[CD]|CR|DB)?$', 'i');

  const RX_RUIDO = new RegExp(
    'saldo\\s+(anterior|do\\s+dia|em|atual|final|disponivel|inicial)' +
    '|total\\s+(da\\s+fatura|de|geral|a\\s+pagar|dos\\s+lancamentos)' +
    '|limite\\s+(de\\s+credito|disponivel|total|utilizado)' +
    '|vencimento|fechamento|proxima\\s+fatura|melhor\\s+dia' +
    '|^extrato|^fatura|^demonstrativo|^periodo|^pagina|^page|^folha' +
    '|^data\\b.*\\b(descricao|historico|lancamento|valor|documento)' +
    '|central\\s+de\\s+atendimento|ouvidoria|^sac\\b|www\\.|@' +
    '|cnpj|^agencia|^conta\\b|^cpf|^titular' +
    '|^subtotal|^resumo|encargos\\s+e\\s+juros' +
    '|pagamento\\s+minimo|^juros\\s+de\\s+mora|^iof\\s+total' +
    '|^lancamentos\\b|^compras\\s+do\\s+periodo' +
    '|banco\\s+central|codigo\\s+de\\s+barras|autenticacao',
    'i');

  function limpar(s) { return U.stripAccents(String(s || '')).toLowerCase(); }

  T.ehRuido = function (linha) {
    const l = limpar(linha);
    if (l.length < 4) return true;
    return RX_RUIDO.test(l);
  };

  function ehValor(txt) { return RX_VALOR.test(String(txt).trim()); }

  /* ═══════════ Classificação das linhas por coluna ═════════════ */

  // Transforma cada linha visual num registro estruturado, dizendo o
  // que ela é: cabeçalho de data, lançamento, continuação ou ruído.
  function classificar(linhas) {
    return linhas.map(l => {
      const cels = PDF.celulas(l);
      const texto = l.texto;
      const valores = [];
      let dataCel = null;
      const descPartes = [];

      cels.forEach((c, i) => {
        if (dataCel === null && i <= 1 && RX_DATA.test(c.texto)) { dataCel = c; return; }
        if (ehValor(c.texto)) { valores.push(c); return; }
        descPartes.push(c);
      });

      // Data grudada na descrição, sem coluna própria.
      let dataEmbutida = null;
      if (!dataCel && descPartes.length) {
        const m = RX_DATA_PREFIXO.exec(descPartes[0].texto);
        if (m) {
          dataEmbutida = m[1];
          descPartes[0] = { x: descPartes[0].x, texto: descPartes[0].texto.slice(m[0].length) };
        }
      }

      return {
        texto,
        y: l.y,
        data: dataCel ? dataCel.texto : dataEmbutida,
        valores,
        descricao: descPartes.map(c => c.texto).join(' ').trim(),
        descX: descPartes.length ? descPartes[0].x : null,
        ruido: T.ehRuido(texto)
      };
    });
  }

  // Descobre qual coluna de números é saldo. A prova é aritmética:
  // num extrato de conta, saldo[i] = saldo[i-1] + valor[i]. Se essa
  // conta fecha na maioria das linhas, achamos a coluna certa.
  function acharColunaSaldo(regs) {
    const comDois = regs.filter(r => !r.ruido && r.valores.length >= 2);
    if (comDois.length < 3) return null;

    // Testa: última coluna é saldo e a penúltima é o valor?
    let acertos = 0, testes = 0, saldoAnterior = null;
    comDois.forEach(r => {
      const valor = U.parseMoney(r.valores[r.valores.length - 2].texto);
      const saldo = U.parseMoney(r.valores[r.valores.length - 1].texto);
      if (valor === null || saldo === null) return;
      if (saldoAnterior !== null) {
        testes++;
        // Tolera 1 centavo de arredondamento, e testa os dois sinais
        // porque nem todo extrato marca saída com menos.
        if (Math.abs(saldoAnterior + valor - saldo) <= 1 ||
          Math.abs(saldoAnterior - Math.abs(valor) - saldo) <= 1) acertos++;
      }
      saldoAnterior = saldo;
    });

    if (testes >= 2 && acertos / testes >= 0.6) return 'ultima';
    // Sem prova aritmética, a heurística de posição: a coluna mais à
    // direita costuma ser saldo quando quase toda linha tem duas.
    if (comDois.length >= regs.filter(r => !r.ruido && r.valores.length).length * 0.8) return 'ultima';
    return null;
  }

  function escolherValor(reg, colunaSaldo) {
    if (!reg.valores.length) return null;
    if (reg.valores.length === 1) return U.parseMoney(reg.valores[0].texto);
    if (colunaSaldo === 'ultima') return U.parseMoney(reg.valores[reg.valores.length - 2].texto);
    return U.parseMoney(reg.valores[reg.valores.length - 1].texto);
  }

  function normalizarData(bruta, anoPadrao) {
    if (!bruta) return null;
    let s = String(bruta).trim();
    if (/^\d{1,2}[\/\-.]\d{1,2}$/.test(s)) s = s + '/' + anoPadrao;
    return U.parseDate(s);
  }

  /* ═══════════════════ Montagem dos lançamentos ════════════════ */

  T.montar = function (linhas, anoPadrao) {
    const regs = classificar(linhas);
    const colunaSaldo = acharColunaSaldo(regs);
    const saida = [];
    const naoLidas = [];
    let dataCorrente = null;
    let ultimo = null;

    regs.forEach(reg => {
      if (reg.ruido) { ultimo = null; return; }

      const temValor = reg.valores.length > 0;

      // Cabeçalho de grupo: só a data, sem valor. Vale para as
      // próximas linhas até aparecer outra data.
      if (reg.data && !temValor && reg.descricao.length < 24) {
        const d = normalizarData(reg.data, anoPadrao);
        if (d) { dataCorrente = d; ultimo = null; return; }
      }

      if (!temValor) {
        // Continuação da descrição anterior: sem data, sem valor,
        // alinhada com a coluna de descrição e logo abaixo.
        if (ultimo && reg.descricao && !reg.data &&
          reg.descricao.length <= 60 &&
          (reg.descX === null || ultimo.descX === null ||
            Math.abs(reg.descX - ultimo.descX) < 12)) {
          ultimo.reg.descricao += ' ' + reg.descricao;
          saida[saida.length - 1].descriptor = ultimo.reg.descricao.trim();
          return;
        }
        if (reg.descricao && /\d{1,2}[\/\-.]\d{1,2}/.test(reg.texto)) naoLidas.push(reg.texto);
        ultimo = null;
        return;
      }

      const data = normalizarData(reg.data, anoPadrao) || dataCorrente;
      if (!data) { naoLidas.push(reg.texto); ultimo = null; return; }

      const cents = escolherValor(reg, colunaSaldo);
      if (cents === null || cents === 0) { naoLidas.push(reg.texto); ultimo = null; return; }

      let desc = reg.descricao
        .replace(/^\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\s+/, '')
        .replace(/\s+\d{8,}$/, '')
        .trim();
      if (!desc || desc.length < 2) { naoLidas.push(reg.texto); ultimo = null; return; }

      // Sufixo D/C do extrato tradicional define o sinal.
      let valor = cents;
      const bruto = reg.valores[reg.valores.length - (colunaSaldo === 'ultima' ? 2 : 1)].texto;
      if (/\bD$|\bDB$/i.test(bruto.trim())) valor = -Math.abs(cents);
      else if (/\bC$|\bCR$/i.test(bruto.trim())) valor = Math.abs(cents);

      saida.push({ date: data, amountCents: valor, descriptor: desc, externalId: null, type: '' });
      ultimo = { reg, descX: reg.descX };
    });

    return { registros: saida, naoLidas, colunaSaldo };
  };

  /* ═══════════════ Contexto do documento ═══════════════════════ */

  T.detectarAno = function (texto) {
    const anos = (texto.match(/\b20\d{2}\b/g) || []).map(Number)
      .filter(a => a >= 2000 && a <= new Date().getFullYear() + 1);
    if (!anos.length) return new Date().getFullYear();
    const cont = new Map();
    anos.forEach(a => cont.set(a, (cont.get(a) || 0) + 1));
    return Array.from(cont.entries()).sort((a, b) => b[1] - a[1])[0][0];
  };

  T.detectarSaldo = function (texto) {
    const rx = /saldo\s+(?:final|atual|em|do\s+dia|disponivel)[^\d\-]{0,20}(-?\s*R?\$?\s*[\d.]+,\d{2})/i;
    const m = rx.exec(U.stripAccents(texto));
    return m ? U.parseMoney(m[1]) : null;
  };

  T.detectarLimite = function (texto) {
    const rx = /limite\s+(?:total|de\s+credito)[^\d]{0,20}(R?\$?\s*[\d.]+,\d{2})/i;
    const m = rx.exec(U.stripAccents(texto));
    return m ? Math.abs(U.parseMoney(m[1])) : null;
  };

  T.detectarVencimento = function (texto) {
    const rx = /vencimento[^\d]{0,20}(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)/i;
    const m = rx.exec(U.stripAccents(texto));
    return m ? U.parseDate(m[1]) : null;
  };

  // Compatibilidade: a versão anterior expunha o parser de uma linha só.
  T.parseLinha = function (texto, anoPadrao) {
    const r = T.montar([{ texto, y: 0, itens: texto.split(/\s{2,}/).map((t, i) => ({
      texto: t, x: i * 100, y: 0, tamanho: 10
    })) }], anoPadrao);
    return r.registros[0] || null;
  };

  /* ═══════════════════ Entrada principal ═══════════════════════ */

  T.parse = async function (buffer, filename) {
    const paginas = await PDF.extrairTexto(buffer);

    const linhas = [];
    paginas.forEach(itens => { PDF.linhas(itens).forEach(l => linhas.push(l)); });
    const textoCompleto = linhas.map(l => l.texto).join('\n');

    const ano = T.detectarAno(textoCompleto);
    const { registros, naoLidas, colunaSaldo } = T.montar(linhas, ano);

    const ehCartao = RULES.looksLikeCardFile(textoCompleto, filename);
    const avisos = [];

    if (ehCartao && registros.length) {
      const positivos = registros.filter(r => r.amountCents > 0).length;
      if (positivos / registros.length > 0.8) {
        registros.forEach(r => { r.amountCents = -r.amountCents; });
        avisos.push('Reconhecido como fatura de cartão: os valores foram lidos como despesas.');
      }
    }

    if (colunaSaldo) {
      avisos.push('O extrato tem coluna de saldo; usei a coluna anterior como valor do lançamento.');
    }

    if (!registros.length) {
      const err = new Error(
        'Li o texto do PDF, mas não reconheci nenhum lançamento.\n\n' +
        'O layout deste emissor deve ser diferente do esperado. ' +
        'Use o botão "ver texto extraído" para me mostrar como as linhas saíram — ' +
        'com isso eu ajusto o reconhecimento.');
      err.codigo = 'PDF_SEM_LANCAMENTOS';
      err.linhas = linhas.map(l => l.texto);
      throw err;
    }

    if (naoLidas.length > registros.length * 0.35) {
      avisos.push('Atenção: ' + naoLidas.length + ' linhas com data não viraram lançamento. ' +
        'Confira se o total bate com o do documento; se faltar coisa, me avise.');
    }

    const datas = registros.map(r => r.date).sort();
    const inst = RULES.detectInstitution(filename + ' ' + textoCompleto.slice(0, 4000), null);
    const saldo = ehCartao ? null : T.detectarSaldo(textoCompleto);

    return {
      format: 'pdf',
      institution: inst,
      statements: [{
        kind: ehCartao ? 'card' : 'account',
        bankId: null, acctId: null,
        acctType: ehCartao ? 'creditcard' : 'checking',
        currency: 'BRL',
        periodStart: datas[0], periodEnd: datas[datas.length - 1],
        balanceCents: saldo, balanceDate: saldo !== null ? datas[datas.length - 1] : null,
        creditLimitCents: ehCartao ? T.detectarLimite(textoCompleto) : null,
        dueDate: ehCartao ? T.detectarVencimento(textoCompleto) : null,
        records: registros
      }],
      warnings: avisos,
      _linhas: linhas.map(l => l.texto),
      _naoLidas: naoLidas
    };
  };

  global.PDFTX = T;
})(window);
