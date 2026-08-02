/* ══════════════════════════════════════════════════════════════════
   pdftx.js — reconhece lançamentos nas linhas extraídas de um PDF.

   Faturas e extratos brasileiros variam muito no layout, mas quase
   todos compartilham a mesma anatomia de linha:

       <data>  <descrição>  <valor>

   Em vez de um template por banco (que quebra a cada redesenho), a
   estratégia é reconhecer esse padrão por forma: data no começo,
   valor no fim, descrição no meio. Cobre a maioria dos emissores sem
   precisar conhecê-los.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const T = {};

  // dd/mm, dd/mm/aa, dd/mm/aaaa, dd-mm, "12 JAN", "12 de janeiro"
  const RX_DATA_INICIO = new RegExp(
    '^\\s*(' +
    '\\d{1,2}[\\/\\-.]\\d{1,2}(?:[\\/\\-.]\\d{2,4})?' +
    '|\\d{1,2}\\s+(?:de\\s+)?[A-Za-zç]{3,9}\\.?(?:\\s+(?:de\\s+)?\\d{2,4})?' +
    ')\\s+', 'i');

  // Valor no fim da linha: 1.234,56 · -45,90 · 45,90- · R$ 12,00 · (30,00)
  const RX_VALOR_FIM = new RegExp(
    '(?:R\\$\\s*)?' +
    '(\\(?-?\\s*\\d{1,3}(?:\\.\\d{3})*,\\d{2}\\s*-?\\)?)' +
    '\\s*(?:[CD]|CR|DB)?\\s*$', 'i');

  // Linhas que são cabeçalho, rodapé ou totalização — nunca lançamento.
  const RX_RUIDO = new RegExp(
    'saldo\\s+(anterior|do\\s+dia|em|atual|final|disponivel)' +
    '|total\\s+(da\\s+fatura|de|geral|a\\s+pagar)' +
    '|limite\\s+(de\\s+credito|disponivel|total)' +
    '|vencimento|fechamento|proxima\\s+fatura' +
    '|^extrato|^fatura|^demonstrativo|^periodo|^pagina|^page' +
    '|^data\\b.*\\b(descricao|historico|lancamento|valor)' +
    '|central\\s+de\\s+atendimento|ouvidoria|sac\\b|www\\.|@' +
    '|cnpj|agencia\\s*:|conta\\s*:|^cpf' +
    '|^subtotal|^resumo|encargos\\s+e\\s+juros' +
    '|pagamento\\s+minimo|^juros\\s+de\\s+mora',
    'i');

  function limpar(s) {
    return U.stripAccents(String(s || '')).toLowerCase();
  }

  T.ehRuido = function (linha) {
    const l = limpar(linha);
    if (l.length < 4) return true;
    return RX_RUIDO.test(l);
  };

  // Tenta transformar uma linha de texto em lançamento.
  T.parseLinha = function (texto, anoPadrao) {
    if (!texto || T.ehRuido(texto)) return null;

    const mData = RX_DATA_INICIO.exec(texto);
    if (!mData) return null;

    const resto = texto.slice(mData[0].length);
    const mValor = RX_VALOR_FIM.exec(resto);
    if (!mValor) return null;

    let descricao = resto.slice(0, mValor.index).trim();
    // Sobra comum: segunda data (data de processamento) grudada na frente.
    descricao = descricao.replace(/^\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\s+/, '');
    // Código de autorização isolado no fim da descrição.
    descricao = descricao.replace(/\s+\d{6,}$/, '').trim();
    if (!descricao || descricao.length < 2) return null;

    let bruta = mData[1];
    // Sem ano na linha (comum em fatura), usa o ano de referência.
    if (!/\d{2,4}\s*$/.test(bruta.replace(/^\d{1,2}[\/\-.]\d{1,2}/, '')) &&
      /^\d{1,2}[\/\-.]\d{1,2}$/.test(bruta.trim())) {
      bruta = bruta.trim() + '/' + (anoPadrao || new Date().getFullYear());
    }
    const data = U.parseDate(bruta);
    if (!data) return null;

    const cents = U.parseMoney(mValor[1]);
    if (cents === null || cents === 0) return null;

    return { date: data, amountCents: cents, descriptor: descricao, externalId: null, type: '' };
  };

  /* ═══════════════ Contexto do documento ═══════════════════════ */

  // Ano de referência: o mais frequente entre datas completas do texto.
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

  /* ═══════════════════ Entrada principal ═══════════════════════ */

  T.parse = async function (buffer, filename) {
    const paginas = await PDF.extrairTexto(buffer);

    const todasLinhas = [];
    paginas.forEach(itens => {
      PDF.linhas(itens).forEach(l => todasLinhas.push(l.texto));
    });
    const textoCompleto = todasLinhas.join('\n');

    const ano = T.detectarAno(textoCompleto);
    const registros = [];
    const naoLidas = [];

    todasLinhas.forEach(linha => {
      const r = T.parseLinha(linha, ano);
      if (r) registros.push(r);
      else if (!T.ehRuido(linha) && /\d{1,2}[\/\-.]\d{1,2}/.test(linha)) naoLidas.push(linha);
    });

    const ehCartao = RULES.looksLikeCardFile(textoCompleto, filename);
    const avisos = [];

    // Em fatura de cartão os valores costumam vir positivos (é tudo
    // gasto). Se quase nada é negativo, inverte o sinal.
    if (ehCartao && registros.length) {
      const positivos = registros.filter(r => r.amountCents > 0).length;
      if (positivos / registros.length > 0.8) {
        registros.forEach(r => { r.amountCents = -r.amountCents; });
        avisos.push('Reconhecido como fatura de cartão: os valores foram lidos como despesas.');
      }
    }

    if (!registros.length) {
      const err = new Error(
        'Li o texto do PDF, mas não reconheci nenhum lançamento.\n\n' +
        'O layout deste emissor deve ser diferente do esperado. ' +
        'Use o botão "ver texto extraído" para me mostrar como as linhas saíram — ' +
        'com isso eu ajusto o reconhecimento.');
      err.codigo = 'PDF_SEM_LANCAMENTOS';
      err.linhas = todasLinhas;
      throw err;
    }

    if (naoLidas.length > registros.length * 0.35) {
      avisos.push('Atenção: ' + naoLidas.length + ' linhas com data não viraram lançamento. ' +
        'Confira se o total bate com a fatura; se faltar coisa, me avise.');
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
      _linhas: todasLinhas,
      _naoLidas: naoLidas
    };
  };

  global.PDFTX = T;
})(window);
