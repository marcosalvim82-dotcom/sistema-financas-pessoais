/* ══════════════════════════════════════════════════════════════════
   parse.js — leitura de OFX, CSV e XLSX

   Tudo devolve a mesma forma canônica:
     { format, institution, statements: [ {
         kind: 'account' | 'card',
         acctId, bankId, acctType, currency,
         periodStart, periodEnd,
         balanceCents, balanceDate,
         creditLimitCents, dueDate, closingDate,
         records: [ { date, amountCents, descriptor, externalId, type, balanceCents } ]
     } ], warnings: [] }
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const P = {};

  /* ════════ Leitura de arquivo e detecção de codificação ════════ */

  P.readFile = function (file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(file);
    });
  };

  // Extratos brasileiros vêm em UTF-8 ou em windows-1252 sem aviso.
  // Decodifica em UTF-8 estrito; se falhar, cai para 1252.
  P.decode = function (buffer, forced) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    if (forced) {
      try { return new TextDecoder(forced).decode(bytes); } catch (e) { }
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
      try { return new TextDecoder('windows-1252').decode(bytes); }
      catch (e2) { return new TextDecoder('utf-8').decode(bytes); }
    }
  };

  P.detectFormat = function (filename, text) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (ext === 'ofx' || ext === 'ofc' || ext === 'qfx') return 'ofx';
    if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xls') return 'xlsx';
    if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return 'csv';
    if (ext === 'json') return 'json';
    if (ext === 'pdf') return 'pdf';
    if (text && /<OFX>|OFXHEADER/i.test(text.slice(0, 4000))) return 'ofx';
    if (text && text.indexOf(';') > -1) return 'csv';
    return 'csv';
  };

  /* ════════════════════════════ OFX ════════════════════════════ */

  // Em OFX SGML os agregados têm tag de fechamento e as folhas não.
  // Isso permite extrair blocos com segurança sem um parser completo.
  function ofxBlocks(text, tag) {
    const rx = new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'gi');
    const out = [];
    let m;
    while ((m = rx.exec(text))) out.push(m[1]);
    return out;
  }

  function ofxLeaf(block, tag) {
    const m = block.match(new RegExp('<' + tag + '>\\s*([^<\\r\\n]*)', 'i'));
    return m ? m[1].trim() : null;
  }

  function ofxDecodeEntities(s) {
    if (!s) return s;
    return s.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&nbsp;/gi, ' ')
      .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d));
  }

  function ofxTransactions(block) {
    return ofxBlocks(block, 'STMTTRN').map(t => {
      const memo = ofxDecodeEntities(ofxLeaf(t, 'MEMO') || '');
      const name = ofxDecodeEntities(ofxLeaf(t, 'NAME') || '');
      // Bancos usam NAME e MEMO de formas diferentes; junta sem repetir.
      let desc = name;
      if (memo && memo !== name) desc = desc ? (desc + ' ' + memo) : memo;
      const amt = U.parseMoney(ofxLeaf(t, 'TRNAMT'));
      return {
        date: U.parseDate(ofxLeaf(t, 'DTPOSTED')),
        amountCents: amt,
        descriptor: (desc || ofxLeaf(t, 'TRNTYPE') || 'Lançamento').trim(),
        externalId: ofxLeaf(t, 'FITID'),
        type: (ofxLeaf(t, 'TRNTYPE') || '').toLowerCase(),
        checkNum: ofxLeaf(t, 'CHECKNUM')
      };
    }).filter(r => r.date && r.amountCents !== null);
  }

  P.parseOFX = function (text, filename) {
    const warnings = [];
    const statements = [];

    const orgHint = (text.match(/<ORG>\s*([^<\r\n]*)/i) || [])[1] || '';
    const fiHint = (text.match(/<FI>[\s\S]{0,300}?<\/FI>/i) || [])[0] || '';

    // Conta corrente / poupança
    ofxBlocks(text, 'STMTRS').forEach(block => {
      const acct = ofxBlocks(block, 'BANKACCTFROM')[0] || block;
      const bal = ofxBlocks(block, 'LEDGERBAL')[0] || '';
      statements.push({
        kind: 'account',
        bankId: ofxLeaf(acct, 'BANKID'),
        acctId: ofxLeaf(acct, 'ACCTID'),
        branchId: ofxLeaf(acct, 'BRANCHID'),
        acctType: (ofxLeaf(acct, 'ACCTTYPE') || 'CHECKING').toLowerCase(),
        currency: ofxLeaf(block, 'CURDEF') || 'BRL',
        periodStart: U.parseDate(ofxLeaf(block, 'DTSTART')),
        periodEnd: U.parseDate(ofxLeaf(block, 'DTEND')),
        balanceCents: bal ? U.parseMoney(ofxLeaf(bal, 'BALAMT')) : null,
        balanceDate: bal ? U.parseDate(ofxLeaf(bal, 'DTASOF')) : null,
        records: ofxTransactions(block)
      });
    });

    // Cartão de crédito
    ofxBlocks(text, 'CCSTMTRS').forEach(block => {
      const acct = ofxBlocks(block, 'CCACCTFROM')[0] || block;
      const bal = ofxBlocks(block, 'LEDGERBAL')[0] || '';
      statements.push({
        kind: 'card',
        bankId: ofxLeaf(acct, 'BANKID'),
        acctId: ofxLeaf(acct, 'ACCTID'),
        acctType: 'creditcard',
        currency: ofxLeaf(block, 'CURDEF') || 'BRL',
        periodStart: U.parseDate(ofxLeaf(block, 'DTSTART')),
        periodEnd: U.parseDate(ofxLeaf(block, 'DTEND')),
        balanceCents: bal ? U.parseMoney(ofxLeaf(bal, 'BALAMT')) : null,
        balanceDate: bal ? U.parseDate(ofxLeaf(bal, 'DTASOF')) : null,
        records: ofxTransactions(block)
      });
    });

    if (!statements.length) {
      // Alguns emissores mandam STMTTRN soltos, fora do agregado.
      const loose = ofxTransactions(text);
      if (loose.length) {
        statements.push({
          kind: RULES.looksLikeCardFile(text, filename) ? 'card' : 'account',
          bankId: (text.match(/<BANKID>\s*([^<\r\n]*)/i) || [])[1] || null,
          acctId: (text.match(/<ACCTID>\s*([^<\r\n]*)/i) || [])[1] || null,
          acctType: 'checking', currency: 'BRL',
          periodStart: null, periodEnd: null,
          balanceCents: null, balanceDate: null,
          records: loose
        });
        warnings.push('O arquivo OFX não trazia o bloco de extrato padrão; os lançamentos foram lidos mesmo assim.');
      } else {
        warnings.push('Nenhum lançamento encontrado neste OFX.');
      }
    }

    const inst = RULES.detectInstitution(orgHint + ' ' + fiHint + ' ' + filename,
      statements.length ? statements[0].bankId : null);

    return { format: 'ofx', institution: inst, statements, warnings };
  };

  /* ════════════════════════════ CSV ════════════════════════════ */

  function detectDelimiter(text) {
    const sample = text.split(/\r?\n/).slice(0, 25).join('\n');
    const cands = [';', ',', '\t', '|'];
    let best = ';', bestScore = -1;
    cands.forEach(d => {
      const counts = sample.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(d).length);
      if (!counts.length) return;
      const med = U.median(counts);
      if (med < 2) return;
      // Prefere o delimitador com contagem de colunas estável.
      const variance = U.stdev(counts);
      const score = med * 10 - variance * 5;
      if (score > bestScore) { bestScore = score; best = d; }
    });
    return best;
  }

  P.parseCSVText = function (text, delim) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delim) {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else if (c === '\r') {
        // ignora
      } else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.map(r => r.map(c => c.trim()))
      .filter(r => r.some(c => c !== ''));
  };

  /* Sinônimos de cabeçalho encontrados nos bancos brasileiros */
  const HEAD = {
    date: ['data', 'data lancamento', 'data do lancamento', 'data movimentacao', 'data da compra',
      'data de compra', 'data operacao', 'data da operacao', 'dt', 'date', 'data efetiva',
      'data pagamento', 'data valor', 'competencia'],
    desc: ['descricao', 'historico', 'lancamento', 'lancamentos', 'detalhes', 'titulo',
      'estabelecimento', 'description', 'memo', 'operacao', 'transacao', 'movimentacao',
      'nome', 'beneficiario', 'title', 'descricao do lancamento'],
    amount: ['valor', 'valor r', 'valor (r$)', 'montante', 'quantia', 'amount', 'vlr',
      'value', 'valor da transacao', 'valor lancamento', 'valor em r$', 'valor brl'],
    debit: ['debito', 'saida', 'saidas', 'valor debito', 'debitos', 'pagamento'],
    credit: ['credito', 'entrada', 'entradas', 'valor credito', 'creditos', 'recebimento'],
    balance: ['saldo', 'saldo r', 'saldo (r$)', 'saldo apos', 'balance', 'saldo final'],
    category: ['categoria', 'category', 'classificacao'],
    id: ['identificador', 'id', 'fitid', 'documento', 'numero documento', 'num doc', 'doc'],
    installment: ['parcela', 'parcelas', 'installment']
  };

  function normHead(s) {
    return U.stripAccents(String(s || '')).toLowerCase()
      .replace(/[^a-z0-9$\s()]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function headerRole(cell) {
    const h = normHead(cell);
    if (!h) return null;
    for (const role in HEAD) {
      for (const syn of HEAD[role]) {
        if (h === syn) return role;
      }
    }
    for (const role in HEAD) {
      for (const syn of HEAD[role]) {
        if (h.startsWith(syn) || h.includes(syn)) return role;
      }
    }
    return null;
  }

  // Acha a linha de cabeçalho: aquela cujas células mapeiam para papéis
  // conhecidos e cuja linha seguinte parece dado.
  function findHeader(rows) {
    let best = -1, bestScore = 0, bestMap = null;
    const limit = Math.min(rows.length, 30);
    for (let i = 0; i < limit; i++) {
      const map = {};
      let score = 0;
      rows[i].forEach((cell, j) => {
        const role = headerRole(cell);
        if (role && !(role in map)) { map[role] = j; score++; }
      });
      const hasDate = 'date' in map;
      const hasValue = ('amount' in map) || ('debit' in map) || ('credit' in map);
      if (hasDate && hasValue && score > bestScore) { bestScore = score; best = i; bestMap = map; }
    }
    return best >= 0 ? { index: best, map: bestMap } : null;
  }

  // Sem cabeçalho reconhecível, infere pelo conteúdo das colunas.
  function inferColumns(rows) {
    const width = Math.max.apply(null, rows.map(r => r.length));
    const sample = rows.slice(0, Math.min(rows.length, 200));
    const stats = [];
    for (let j = 0; j < width; j++) {
      let dates = 0, money = 0, text = 0, len = 0, filled = 0;
      sample.forEach(r => {
        const v = r[j];
        if (v === undefined || v === '') return;
        filled++;
        if (U.parseDate(v) && /\d{2}[\/\-.]\d{2}|^\d{4}-\d{2}/.test(v)) dates++;
        else if (U.parseMoney(v) !== null && /\d/.test(v) && /[,.]\d{2}\b|^-?\d+$/.test(v)) money++;
        else { text++; len += String(v).length; }
      });
      stats.push({ j, dates, money, text, avgLen: text ? len / text : 0, filled });
    }
    const map = {};
    const dateCol = stats.slice().sort((a, b) => b.dates - a.dates)[0];
    if (dateCol && dateCol.dates > sample.length * 0.5) map.date = dateCol.j;
    const textCol = stats.slice().sort((a, b) => b.avgLen - a.avgLen)[0];
    if (textCol && textCol.avgLen > 4) map.desc = textCol.j;
    const moneyCols = stats.filter(s => s.money > sample.length * 0.5 && s.j !== map.date)
      .sort((a, b) => b.money - a.money);
    if (moneyCols.length === 1) map.amount = moneyCols[0].j;
    else if (moneyCols.length >= 2) {
      // A coluna de saldo costuma ser a última e nunca ter célula vazia.
      const byPos = moneyCols.slice().sort((a, b) => a.j - b.j);
      map.amount = byPos[0].j;
      map.balance = byPos[byPos.length - 1].j;
    }
    return Object.keys(map).length >= 2 ? map : null;
  }

  P.parseCSV = function (text, filename) {
    const warnings = [];
    const delim = detectDelimiter(text);
    const rows = P.parseCSVText(text, delim);
    if (!rows.length) return { format: 'csv', institution: null, statements: [], warnings: ['Arquivo vazio.'] };

    const hdr = findHeader(rows);
    let map, dataRows;
    if (hdr) {
      map = hdr.map;
      dataRows = rows.slice(hdr.index + 1);
    } else {
      map = inferColumns(rows);
      dataRows = rows;
      if (map) warnings.push('O arquivo não tinha cabeçalho reconhecível; as colunas foram inferidas pelo conteúdo.');
    }

    // Cabeçalho reconhecido mas sem coluna de descrição: pega a coluna
    // com mais texto, que é o histórico em praticamente todo extrato.
    if (map && !('desc' in map)) {
      const inferred = inferColumns(dataRows);
      if (inferred && 'desc' in inferred && inferred.desc !== map.date &&
        inferred.desc !== map.amount && inferred.desc !== map.balance) {
        map.desc = inferred.desc;
      }
    }

    if (!map || !('date' in map)) {
      return {
        format: 'csv', institution: null, statements: [],
        warnings: ['Não consegui identificar as colunas de data e valor neste CSV. ' +
          'Abra o arquivo e confira se ele tem cabeçalho com algo como Data, Descrição e Valor.']
      };
    }

    const records = [];
    let lastBalance = null, lastBalanceDate = null;
    dataRows.forEach(r => {
      const date = U.parseDate(r[map.date]);
      if (!date) return;

      let amount = null;
      if ('amount' in map) amount = U.parseMoney(r[map.amount]);
      if (amount === null && ('debit' in map || 'credit' in map)) {
        const d = 'debit' in map ? U.parseMoney(r[map.debit]) : null;
        const c = 'credit' in map ? U.parseMoney(r[map.credit]) : null;
        if (d) amount = -Math.abs(d);
        else if (c) amount = Math.abs(c);
      }
      if (amount === null) return;

      const desc = ('desc' in map ? r[map.desc] : '') ||
        (('category' in map) ? r[map.category] : '') || 'Lançamento';

      if ('balance' in map) {
        const b = U.parseMoney(r[map.balance]);
        if (b !== null) { lastBalance = b; lastBalanceDate = date; }
      }

      records.push({
        date,
        amountCents: amount,
        descriptor: String(desc).trim(),
        externalId: 'id' in map ? (r[map.id] || null) : null,
        hintCategory: 'category' in map ? (r[map.category] || null) : null,
        type: ''
      });
    });

    if (!records.length) {
      warnings.push('As colunas foram encontradas, mas nenhuma linha virou lançamento válido.');
    }

    const inst = RULES.detectInstitution(filename + ' ' + text.slice(0, 3000), null);
    const isCard = RULES.looksLikeCardFile(text.slice(0, 6000), filename);

    // Fatura de cartão em CSV costuma listar valores positivos para
    // compras. Se quase tudo é positivo num arquivo de cartão, inverte.
    if (isCard && records.length) {
      const pos = records.filter(r => r.amountCents > 0).length;
      if (pos / records.length > 0.8) {
        records.forEach(r => { r.amountCents = -r.amountCents; });
        warnings.push('Arquivo identificado como fatura de cartão: os valores foram lidos como despesas.');
      }
    } else if (records.length > 1 && records.every(r => r.amountCents > 0)) {
      // Extrato de conta sem nenhum valor negativo: o arquivo não marca
      // o sinal. Deduz pela descrição — deixar tudo como receita faria
      // o painel inteiro mentir, e em silêncio.
      let deduzidos = 0;
      records.forEach(r => {
        if (RULES.direcaoPorDescricao(r.descriptor) < 0) {
          r.amountCents = -Math.abs(r.amountCents);
          deduzidos++;
        }
      });
      if (deduzidos) {
        warnings.push('Este arquivo não marca o sinal dos valores. Deduzi pela descrição que ' +
          deduzidos + ' lançamento(s) são saídas. <b>Confira se entradas e saídas ficaram ' +
          'trocadas no painel.</b>');
      } else {
        warnings.push('<b>Atenção:</b> todos os lançamentos entraram como receita, o que é ' +
          'improvável num extrato de conta. Confira antes de confiar nos números.');
      }
    }

    const dates = records.map(r => r.date).sort();
    return {
      format: 'csv',
      institution: inst,
      statements: records.length ? [{
        kind: isCard ? 'card' : 'account',
        bankId: null, acctId: null,
        acctType: isCard ? 'creditcard' : 'checking',
        currency: 'BRL',
        periodStart: dates[0], periodEnd: dates[dates.length - 1],
        balanceCents: lastBalance, balanceDate: lastBalanceDate,
        records
      }] : [],
      warnings
    };
  };

  /* ═══════════════════════════ XLSX ════════════════════════════ */
  // Leitor de ZIP mínimo + DecompressionStream. Sem dependências.

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Seu navegador não descompacta XLSX. Salve a planilha como CSV e importe de novo.');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer, wanted) {
    const dv = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    // End of central directory
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Arquivo XLSX inválido (não é um pacote ZIP).');

    const count = dv.getUint16(eocd + 10, true);
    let ptr = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder('utf-8');

    for (let i = 0; i < count; i++) {
      if (dv.getUint32(ptr, true) !== 0x02014b50) break;
      const method = dv.getUint16(ptr + 10, true);
      const compSize = dv.getUint32(ptr + 20, true);
      const nameLen = dv.getUint16(ptr + 28, true);
      const extraLen = dv.getUint16(ptr + 30, true);
      const commentLen = dv.getUint16(ptr + 32, true);
      const localOff = dv.getUint32(ptr + 42, true);
      const name = dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
      if (!wanted || wanted(name)) files[name] = { method, compSize, localOff };
      ptr += 46 + nameLen + extraLen + commentLen;
    }

    const out = {};
    for (const name in files) {
      const f = files[name];
      const lnLen = dv.getUint16(f.localOff + 26, true);
      const leLen = dv.getUint16(f.localOff + 28, true);
      const start = f.localOff + 30 + lnLen + leLen;
      const raw = bytes.subarray(start, start + f.compSize);
      out[name] = f.method === 0 ? raw : await inflateRaw(raw);
    }
    return out;
  }

  function xmlDoc(bytes) {
    const text = new TextDecoder('utf-8').decode(bytes);
    return new DOMParser().parseFromString(text, 'application/xml');
  }

  function colIndex(ref) {
    const m = String(ref).match(/^([A-Z]+)/);
    if (!m) return 0;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  P.parseXLSX = async function (buffer, filename) {
    const want = n => /^xl\/(workbook\.xml|sharedStrings\.xml|worksheets\/.*\.xml)$/.test(n);
    const files = await unzip(buffer, want);

    // Strings compartilhadas
    let shared = [];
    if (files['xl/sharedStrings.xml']) {
      const doc = xmlDoc(files['xl/sharedStrings.xml']);
      shared = Array.from(doc.getElementsByTagName('si')).map(si => {
        const ts = si.getElementsByTagName('t');
        let s = '';
        for (let i = 0; i < ts.length; i++) s += ts[i].textContent;
        return s;
      });
    }

    const sheetNames = Object.keys(files)
      .filter(n => n.startsWith('xl/worksheets/'))
      .sort();
    if (!sheetNames.length) throw new Error('A planilha não tem abas legíveis.');

    // Usa a aba com mais linhas — costuma ser a do extrato.
    let bestRows = [], bestName = '';
    for (const sn of sheetNames) {
      const doc = xmlDoc(files[sn]);
      const rowsEl = doc.getElementsByTagName('row');
      const rows = [];
      for (let i = 0; i < rowsEl.length; i++) {
        const cells = rowsEl[i].getElementsByTagName('c');
        const row = [];
        for (let j = 0; j < cells.length; j++) {
          const c = cells[j];
          const idx = colIndex(c.getAttribute('r') || '');
          const t = c.getAttribute('t');
          let v = '';
          if (t === 's') {
            const vEl = c.getElementsByTagName('v')[0];
            v = vEl ? (shared[+vEl.textContent] || '') : '';
          } else if (t === 'inlineStr') {
            const ts = c.getElementsByTagName('t');
            for (let k = 0; k < ts.length; k++) v += ts[k].textContent;
          } else {
            const vEl = c.getElementsByTagName('v')[0];
            v = vEl ? vEl.textContent : '';
          }
          while (row.length < idx) row.push('');
          row[idx] = v;
        }
        if (row.some(x => x !== '')) rows.push(row);
      }
      if (rows.length > bestRows.length) { bestRows = rows; bestName = sn; }
    }

    // Reaproveita toda a lógica de mapeamento do CSV.
    const asText = bestRows.map(r => r.map(c => String(c).replace(/;/g, ',')).join(';')).join('\n');
    const res = P.parseCSV(asText, filename);
    res.format = 'xlsx';
    if (bestName) res.warnings.push('Aba lida: ' + bestName.replace('xl/worksheets/', ''));
    return res;
  };

  /* ═══════════════════════ Ponto de entrada ════════════════════ */

  P.parseFile = async function (file) {
    const buffer = await P.readFile(file);
    const name = file.name || 'arquivo';
    const head = P.decode(buffer.slice(0, 8192));
    const format = P.detectFormat(name, head);

    if (format === 'pdf') {
      try {
        return await PDFTX.parse(buffer, name);
      } catch (e) {
        return {
          format: 'pdf', institution: null, statements: [],
          warnings: [e.message || String(e)],
          _codigo: e.codigo || null,
          _linhas: e.linhas || null
        };
      }
    }
    if (format === 'json') {
      return { format: 'json', institution: null, statements: [], warnings: ['__BACKUP__'], rawText: P.decode(buffer) };
    }
    if (format === 'xlsx') {
      try {
        return await P.parseXLSX(buffer, name);
      } catch (e) {
        return { format: 'xlsx', institution: null, statements: [], warnings: [e.message || String(e)] };
      }
    }

    const text = P.decode(buffer);
    if (format === 'ofx') return P.parseOFX(text, name);
    return P.parseCSV(text, name);
  };

  global.PARSE = P;
})(window);
