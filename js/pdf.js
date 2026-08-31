/* ══════════════════════════════════════════════════════════════════
   pdf.js — leitor de PDF escrito do zero, sem biblioteca externa.

   Extrai texto com posição (x, y) de PDFs gerados por computador,
   que é o caso de toda fatura e extrato de banco. Usa a descompressão
   nativa do navegador (DecompressionStream), a mesma já usada no XLSX.

   O que NÃO faz, por decisão de escopo:
     · PDF escaneado (é imagem — exigiria OCR)
     · PDF protegido por senha (detecta e avisa, não decifra)

   Referência da estrutura: PDF 32000-1:2008, seções 7 (sintaxe) e 9
   (texto). A leitura é tolerante: em vez de seguir a tabela xref, que
   varia muito entre geradores, varre o arquivo inteiro atrás de
   objetos. É mais lento e muito mais robusto.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const P = {};

  /* ═══════════════════ Utilidades de bytes ═════════════════════ */

  // Decodifica como Latin-1: preserva o byte original em cada posição,
  // o que é essencial para depois fatiar streams binários por índice.
  function bytesParaLatin1(bytes) {
    let s = '';
    const passo = 8192;
    for (let i = 0; i < bytes.length; i += passo) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + passo, bytes.length)));
    }
    return s;
  }

  function latin1ParaBytes(s) {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xFF;
    return b;
  }

  async function inflate(bytes, formato) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador não descomprime PDF. Tente pelo Chrome ou Edge.');
    }
    const ds = new DecompressionStream(formato || 'deflate');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // Alguns geradores erram o cabeçalho zlib. Tenta os dois formatos.
  async function inflateTolerante(bytes) {
    try { return await inflate(bytes, 'deflate'); }
    catch (e) {
      try { return await inflate(bytes, 'deflate-raw'); }
      catch (e2) {
        // Lixo antes do fluxo é comum; tenta pular bytes iniciais.
        for (let salto = 1; salto <= 2; salto++) {
          try { return await inflate(bytes.subarray(salto), 'deflate'); } catch (e3) { }
        }
        throw e;
      }
    }
  }

  /* ═════════════════ Dicionários e primitivas ══════════════════ */

  // Extrai o valor bruto de uma chave num dicionário em texto.
  // Devolve string: "12 0 R", "/FlateDecode", "[/FlateDecode]", "842"…
  function pegaChave(dict, chave) {
    const rx = new RegExp('\\/' + chave + '(?![A-Za-z0-9])\\s*');
    const m = rx.exec(dict);
    if (!m) return null;
    let i = m.index + m[0].length;
    if (i >= dict.length) return null;

    const c = dict[i];
    if (c === '[') {
      let nivel = 0;
      for (let j = i; j < dict.length; j++) {
        if (dict[j] === '[') nivel++;
        else if (dict[j] === ']') { nivel--; if (!nivel) return dict.slice(i, j + 1); }
      }
      return dict.slice(i);
    }
    if (c === '<' && dict[i + 1] === '<') {
      let nivel = 0;
      for (let j = i; j < dict.length - 1; j++) {
        if (dict[j] === '<' && dict[j + 1] === '<') { nivel++; j++; }
        else if (dict[j] === '>' && dict[j + 1] === '>') { nivel--; j++; if (!nivel) return dict.slice(i, j + 1); }
      }
      return dict.slice(i);
    }
    // Valor simples: vai até o próximo delimitador.
    const resto = dict.slice(i);
    const fim = /[\/\[\]<>()\r\n]/.exec(resto.slice(1));
    const bruto = fim ? resto.slice(0, fim.index + 1) : resto;
    return bruto.trim();
  }

  function refNumero(valor) {
    if (!valor) return null;
    const m = /^(\d+)\s+\d+\s+R$/.exec(String(valor).trim());
    return m ? +m[1] : null;
  }

  /* ═══════════════════ Varredura de objetos ════════════════════ */

  function varrerObjetos(texto) {
    const objs = new Map();
    const rx = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = rx.exec(texto))) {
      const num = +m[1];
      const inicio = m.index + m[0].length;
      // O fim é o próximo "endobj"; se faltar, vai até o próximo "obj".
      let fim = texto.indexOf('endobj', inicio);
      if (fim < 0) fim = texto.length;

      const corpo = texto.slice(inicio, fim);
      const posStream = corpo.indexOf('stream');
      let dict, dadosInicio = -1, dadosFim = -1;

      if (posStream >= 0) {
        dict = corpo.slice(0, posStream);
        let d = inicio + posStream + 6;
        if (texto[d] === '\r') d++;
        if (texto[d] === '\n') d++;
        dadosInicio = d;
        const marcaFim = texto.indexOf('endstream', d);
        dadosFim = marcaFim < 0 ? fim : marcaFim;
      } else {
        dict = corpo;
      }

      // Objetos repetidos: a última definição vence (atualização incremental).
      objs.set(num, { num, dict, dadosInicio, dadosFim });
    }
    return objs;
  }

  async function lerStream(doc, obj) {
    if (obj.dadosInicio < 0) return null;
    if (obj._cache) return obj._cache;

    let bytes = doc.bytes.subarray(obj.dadosInicio, obj.dadosFim);

    // /Length pode ser referência indireta; o corte por "endstream" já
    // resolve na prática, então só se usa para aparar sobra.
    const lenBruto = pegaChave(obj.dict, 'Length');
    const lenRef = refNumero(lenBruto);
    let len = lenRef !== null ? null : parseInt(lenBruto, 10);
    if (lenRef !== null) {
      const alvo = doc.objs.get(lenRef);
      if (alvo) len = parseInt(alvo.dict.trim(), 10);
    }
    if (len > 0 && len <= bytes.length) bytes = bytes.subarray(0, len);

    const filtro = pegaChave(obj.dict, 'Filter') || '';
    if (filtro.includes('FlateDecode')) {
      try { bytes = await inflateTolerante(bytes); }
      catch (e) { obj._cache = new Uint8Array(0); return obj._cache; }

      const parms = pegaChave(obj.dict, 'DecodeParms') || '';
      const preditor = parseInt(pegaChave(parms, 'Predictor') || '1', 10);
      if (preditor >= 10) {
        const colunas = parseInt(pegaChave(parms, 'Columns') || '1', 10);
        const cores = parseInt(pegaChave(parms, 'Colors') || '1', 10);
        const bpc = parseInt(pegaChave(parms, 'BitsPerComponent') || '8', 10);
        bytes = desfazerPreditorPNG(bytes, colunas, cores, bpc);
      }
    } else if (filtro.includes('ASCIIHexDecode')) {
      bytes = hexParaBytes(bytesParaLatin1(bytes));
    }
    // Outros filtros (DCTDecode, CCITTFax) são imagem — não interessam.

    obj._cache = bytes;
    return bytes;
  }

  function hexParaBytes(s) {
    const limpo = s.replace(/[^0-9A-Fa-f]/g, '');
    const out = new Uint8Array(limpo.length >> 1);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(limpo.substr(i * 2, 2), 16);
    return out;
  }

  function desfazerPreditorPNG(dados, colunas, cores, bpc) {
    const bpp = Math.max(1, (cores * bpc) >> 3);
    const linhaBytes = ((colunas * cores * bpc) + 7) >> 3;
    const linhas = Math.floor(dados.length / (linhaBytes + 1));
    const out = new Uint8Array(linhas * linhaBytes);
    let anterior = new Uint8Array(linhaBytes);

    for (let r = 0; r < linhas; r++) {
      const tipo = dados[r * (linhaBytes + 1)];
      const linha = dados.subarray(r * (linhaBytes + 1) + 1, (r + 1) * (linhaBytes + 1));
      const atual = new Uint8Array(linhaBytes);
      for (let i = 0; i < linhaBytes; i++) {
        const a = i >= bpp ? atual[i - bpp] : 0;
        const b = anterior[i];
        const c = i >= bpp ? anterior[i - bpp] : 0;
        const x = linha[i];
        let v;
        switch (tipo) {
          case 0: v = x; break;
          case 1: v = x + a; break;
          case 2: v = x + b; break;
          case 3: v = x + ((a + b) >> 1); break;
          case 4: {
            const p = a + b - c;
            const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            v = x + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c));
            break;
          }
          default: v = x;
        }
        atual[i] = v & 0xFF;
      }
      out.set(atual, r * linhaBytes);
      anterior = atual;
    }
    return out;
  }

  /* ══════════════ Objetos dentro de object streams ═════════════ */

  async function expandirObjStm(doc) {
    const pendentes = [];
    doc.objs.forEach(obj => {
      if (/\/Type\s*\/ObjStm/.test(obj.dict)) pendentes.push(obj);
    });

    for (const obj of pendentes) {
      let dados;
      try { dados = await lerStream(doc, obj); } catch (e) { continue; }
      if (!dados || !dados.length) continue;

      const texto = bytesParaLatin1(dados);
      const n = parseInt(pegaChave(obj.dict, 'N') || '0', 10);
      const primeiro = parseInt(pegaChave(obj.dict, 'First') || '0', 10);
      if (!n || !primeiro) continue;

      const cabecalho = texto.slice(0, primeiro).trim().split(/\s+/).map(Number);
      for (let i = 0; i < n; i++) {
        const num = cabecalho[i * 2];
        const desloc = cabecalho[i * 2 + 1];
        if (num === undefined || desloc === undefined) break;
        const fim = (i + 1 < n && cabecalho[(i + 1) * 2 + 1] !== undefined)
          ? primeiro + cabecalho[(i + 1) * 2 + 1]
          : texto.length;
        // Não sobrescreve objeto solto no arquivo, que é mais recente.
        if (!doc.objs.has(num)) {
          doc.objs.set(num, { num, dict: texto.slice(primeiro + desloc, fim), dadosInicio: -1, dadosFim: -1 });
        }
      }
    }
  }

  /* ═══════════════════════ Abertura ════════════════════════════ */

  P.abrir = async function (buffer) {
    const bytes = new Uint8Array(buffer);
    const texto = bytesParaLatin1(bytes);

    if (texto.slice(0, 1024).indexOf('%PDF') < 0) {
      throw new Error('Este arquivo não é um PDF válido.');
    }

    const doc = { bytes, texto, objs: varrerObjetos(texto) };

    // Criptografia: sem isso, todo texto extraído sai como lixo.
    if (/\/Encrypt\b/.test(texto)) {
      const err = new Error(
        'Este PDF está protegido por senha.\n\n' +
        'Bancos costumam proteger a fatura com os primeiros dígitos do CPF ou a data de nascimento. ' +
        'Abra o arquivo no leitor de PDF, use "Imprimir → Salvar como PDF" para gerar uma cópia sem senha, ' +
        'e importe essa cópia.');
      err.codigo = 'PDF_PROTEGIDO';
      throw err;
    }

    await expandirObjStm(doc);
    return doc;
  };

  /* ═════════════════════ Fontes e ToUnicode ════════════════════ */

  // Fontes de subconjunto usam códigos de glifo arbitrários. Sem o mapa
  // ToUnicode, o texto extraído sai embaralhado. É o passo que separa um
  // leitor que funciona de um que devolve lixo.
  function parseCMapToUnicode(texto) {
    const mapa = new Map();

    // <0041> <0042> — código único para caractere
    const rxChar = /beginbfchar([\s\S]*?)endbfchar/g;
    let m;
    while ((m = rxChar.exec(texto))) {
      const rxPar = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g;
      let p;
      while ((p = rxPar.exec(m[1]))) {
        mapa.set(parseInt(p[1], 16), hexParaTexto(p[2]));
      }
    }

    // <0041> <005A> <0061> — faixa contígua
    const rxRange = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = rxRange.exec(texto))) {
      const corpo = m[1];
      const rxSimples = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g;
      let p;
      while ((p = rxSimples.exec(corpo))) {
        const de = parseInt(p[1], 16), ate = parseInt(p[2], 16);
        const base = p[3];
        if (ate - de > 65535) continue;
        for (let c = de; c <= ate; c++) {
          // Incrementa o último par hexadecimal do destino.
          const prefixo = base.slice(0, -4);
          const ultimo = parseInt(base.slice(-4) || '0', 16) + (c - de);
          mapa.set(c, hexParaTexto(prefixo + ultimo.toString(16).padStart(4, '0')));
        }
      }
      // <0041> <0043> [<0061> <0062> <0063>] — lista explícita
      const rxLista = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g;
      while ((p = rxLista.exec(corpo))) {
        const de = parseInt(p[1], 16);
        const itens = p[3].match(/<([0-9A-Fa-f]*)>/g) || [];
        itens.forEach((it, i) => {
          mapa.set(de + i, hexParaTexto(it.replace(/[<>]/g, '')));
        });
      }
    }
    return mapa;
  }

  function hexParaTexto(hex) {
    if (!hex) return '';
    let s = '';
    for (let i = 0; i + 3 < hex.length + 1; i += 4) {
      const cp = parseInt(hex.substr(i, 4), 16);
      if (!isNaN(cp)) s += cp > 0xFFFF ? String.fromCodePoint(cp) : String.fromCharCode(cp);
    }
    if (!s && hex.length <= 2) s = String.fromCharCode(parseInt(hex, 16));
    return s;
  }

  // WinAnsiEncoding difere de Latin-1 na faixa 0x80–0x9F. Sem isso,
  // travessões e aspas curvas viram caixas.
  const WIN_ANSI = {
    0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
    0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š',
    0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’',
    0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
    0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ',
    0x9E: 'ž', 0x9F: 'Ÿ'
  };

  async function carregarFontes(doc, dictRecursos) {
    const fontes = new Map();
    if (!dictRecursos) return fontes;

    let fontDict = pegaChave(dictRecursos, 'Font');
    const ref = refNumero(fontDict);
    if (ref !== null) {
      const alvo = doc.objs.get(ref);
      fontDict = alvo ? alvo.dict : null;
    }
    if (!fontDict) return fontes;

    const rx = /\/([A-Za-z0-9_.\-+]+)\s+(\d+)\s+\d+\s+R/g;
    let m;
    while ((m = rx.exec(fontDict))) {
      const nome = m[1];
      const objFonte = doc.objs.get(+m[2]);
      if (!objFonte) continue;

      const info = { doisBytes: false, toUnicode: null };

      const subtipo = pegaChave(objFonte.dict, 'Subtype') || '';
      // Type0 usa Identity-H na prática: códigos de 2 bytes.
      if (subtipo.includes('Type0')) info.doisBytes = true;

      const tuRef = refNumero(pegaChave(objFonte.dict, 'ToUnicode'));
      if (tuRef !== null) {
        const objTU = doc.objs.get(tuRef);
        if (objTU) {
          try {
            const dados = await lerStream(doc, objTU);
            if (dados && dados.length) {
              info.toUnicode = parseCMapToUnicode(bytesParaLatin1(dados));
            }
          } catch (e) { /* segue sem mapa */ }
        }
      }

      const enc = pegaChave(objFonte.dict, 'Encoding') || '';
      info.winAnsi = enc.includes('WinAnsi');
      fontes.set(nome, info);
    }
    return fontes;
  }

  function decodificar(bruto, fonte) {
    if (!fonte) return bruto;

    if (fonte.doisBytes) {
      let s = '';
      for (let i = 0; i + 1 < bruto.length; i += 2) {
        const codigo = (bruto.charCodeAt(i) << 8) | bruto.charCodeAt(i + 1);
        if (fonte.toUnicode && fonte.toUnicode.has(codigo)) s += fonte.toUnicode.get(codigo);
        else s += String.fromCharCode(codigo);
      }
      return s;
    }

    let s = '';
    for (let i = 0; i < bruto.length; i++) {
      const codigo = bruto.charCodeAt(i);
      if (fonte.toUnicode && fonte.toUnicode.has(codigo)) s += fonte.toUnicode.get(codigo);
      else if (fonte.winAnsi && WIN_ANSI[codigo]) s += WIN_ANSI[codigo];
      else s += String.fromCharCode(codigo);
    }
    return s;
  }

  /* ══════════════ Tokenizador de content stream ════════════════ */

  function lerStringLiteral(s, i) {
    // i aponta para o '('. Devolve [conteudo, proximoIndice].
    let nivel = 1, out = '';
    i++;
    while (i < s.length && nivel > 0) {
      const c = s[i];
      if (c === '\\') {
        const p = s[i + 1];
        if (p === 'n') { out += '\n'; i += 2; }
        else if (p === 'r') { out += '\r'; i += 2; }
        else if (p === 't') { out += '\t'; i += 2; }
        else if (p === 'b') { out += '\b'; i += 2; }
        else if (p === 'f') { out += '\f'; i += 2; }
        else if (p >= '0' && p <= '7') {
          let oct = '';
          let j = i + 1;
          while (j < s.length && oct.length < 3 && s[j] >= '0' && s[j] <= '7') { oct += s[j]; j++; }
          out += String.fromCharCode(parseInt(oct, 8));
          i = j;
        }
        else if (p === '\n') { i += 2; }
        else if (p === '\r') { i += (s[i + 2] === '\n' ? 3 : 2); }
        else { out += p; i += 2; }
      } else if (c === '(') { nivel++; out += c; i++; }
      else if (c === ')') { nivel--; if (nivel) out += c; i++; }
      else { out += c; i++; }
    }
    return [out, i];
  }

  // Percorre o content stream mantendo a matriz de texto, e emite cada
  // trecho com a posição onde foi desenhado.
  function extrairItens(conteudo, fontes, altura) {
    const itens = [];
    let tm = [1, 0, 0, 1, 0, 0];
    let tlm = [1, 0, 0, 1, 0, 0];
    let liderança = 0;
    let fonteAtual = null;
    let tamanho = 12;
    const pilha = [];
    let i = 0;

    function mult(a, b) {
      return [
        a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]
      ];
    }

    function emitir(texto) {
      if (!texto) return;
      const escala = Math.hypot(tm[0], tm[1]) || 1;
      itens.push({
        texto,
        x: tm[4],
        y: altura ? altura - tm[5] : -tm[5],   // y cresce para baixo
        tamanho: tamanho * escala
      });
    }

    while (i < conteudo.length) {
      const c = conteudo[i];

      if (c === '(') {
        const [txt, prox] = lerStringLiteral(conteudo, i);
        pilha.push({ tipo: 'str', valor: txt });
        i = prox;
        continue;
      }
      if (c === '<' && conteudo[i + 1] !== '<') {
        const fim = conteudo.indexOf('>', i);
        if (fim < 0) break;
        const hex = conteudo.slice(i + 1, fim).replace(/\s/g, '');
        let bruto = '';
        const par = hex.length % 2 ? hex + '0' : hex;
        for (let k = 0; k < par.length; k += 2) bruto += String.fromCharCode(parseInt(par.substr(k, 2), 16));
        pilha.push({ tipo: 'str', valor: bruto });
        i = fim + 1;
        continue;
      }
      if (c === '<' && conteudo[i + 1] === '<') {
        // Dicionário inline (BDC etc.): pula.
        let nivel = 0, j = i;
        while (j < conteudo.length - 1) {
          if (conteudo[j] === '<' && conteudo[j + 1] === '<') { nivel++; j += 2; }
          else if (conteudo[j] === '>' && conteudo[j + 1] === '>') { nivel--; j += 2; if (!nivel) break; }
          else j++;
        }
        i = j;
        continue;
      }
      if (c === '[') { pilha.push({ tipo: 'abre' }); i++; continue; }
      if (c === ']') {
        const arr = [];
        while (pilha.length && pilha[pilha.length - 1].tipo !== 'abre') arr.unshift(pilha.pop());
        pilha.pop();
        pilha.push({ tipo: 'arr', valor: arr });
        i++;
        continue;
      }
      if (c === '/') {
        let j = i + 1;
        while (j < conteudo.length && !/[\s\/\[\]<>(){}]/.test(conteudo[j])) j++;
        pilha.push({ tipo: 'nome', valor: conteudo.slice(i + 1, j) });
        i = j;
        continue;
      }
      if (/[\d+\-.]/.test(c)) {
        let j = i;
        while (j < conteudo.length && /[\d+\-.eE]/.test(conteudo[j])) j++;
        pilha.push({ tipo: 'num', valor: parseFloat(conteudo.slice(i, j)) });
        i = j;
        continue;
      }
      if (/\s/.test(c)) { i++; continue; }

      // Operador
      let j = i;
      while (j < conteudo.length && /[A-Za-z*'"]/.test(conteudo[j])) j++;
      const op = conteudo.slice(i, j) || conteudo[i];
      i = j > i ? j : i + 1;

      const num = k => {
        const it = pilha[pilha.length - k];
        return it && it.tipo === 'num' ? it.valor : 0;
      };

      switch (op) {
        case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); break;
        case 'ET': break;
        case 'Tf': {
          tamanho = num(1);
          const nomeItem = pilha[pilha.length - 2];
          if (nomeItem && nomeItem.tipo === 'nome') fonteAtual = fontes.get(nomeItem.valor) || null;
          break;
        }
        case 'TL': liderança = num(1); break;
        case 'Td': tlm = mult([1, 0, 0, 1, num(2), num(1)], tlm); tm = tlm.slice(); break;
        case 'TD':
          liderança = -num(1);
          tlm = mult([1, 0, 0, 1, num(2), num(1)], tlm); tm = tlm.slice();
          break;
        case 'Tm':
          tlm = [num(6), num(5), num(4), num(3), num(2), num(1)];
          tm = tlm.slice();
          break;
        case 'T*': tlm = mult([1, 0, 0, 1, 0, -liderança], tlm); tm = tlm.slice(); break;
        case 'Tj': case "'": case '"': {
          if (op !== 'Tj') { tlm = mult([1, 0, 0, 1, 0, -liderança], tlm); tm = tlm.slice(); }
          const it = pilha[pilha.length - 1];
          if (it && it.tipo === 'str') emitir(decodificar(it.valor, fonteAtual));
          break;
        }
        case 'TJ': {
          const it = pilha[pilha.length - 1];
          if (it && it.tipo === 'arr') {
            let junto = '';
            it.valor.forEach(el => {
              if (el.tipo === 'str') junto += decodificar(el.valor, fonteAtual);
              else if (el.tipo === 'num' && el.valor < -180) junto += ' '; // espaçamento largo
            });
            emitir(junto);
          }
          break;
        }
      }
      pilha.length = 0;
    }
    return itens;
  }

  /* ═════════════════════ Páginas e texto ═══════════════════════ */

  P.extrairTexto = async function (buffer) {
    const doc = await P.abrir(buffer);
    const paginas = [];

    const objsPagina = [];
    doc.objs.forEach(obj => {
      if (/\/Type\s*\/Page(?![sA-Za-z])/.test(obj.dict)) objsPagina.push(obj);
    });

    // Sem /Type /Page (raro, mas acontece), processa todo content stream.
    if (!objsPagina.length) {
      doc.objs.forEach(obj => {
        if (obj.dadosInicio >= 0 && !/\/Type\s*\/(ObjStm|XRef|Metadata|Font|XObject)/.test(obj.dict)) {
          objsPagina.push({ dict: '', _conteudoDireto: obj });
        }
      });
    }

    for (const pag of objsPagina) {
      let conteudoBytes = null;
      const fontes = await carregarFontes(doc, pegaChaveRecursos(doc, pag.dict));

      if (pag._conteudoDireto) {
        try { conteudoBytes = await lerStream(doc, pag._conteudoDireto); } catch (e) { continue; }
      } else {
        const contBruto = pegaChave(pag.dict, 'Contents') || '';
        const refs = [];
        const um = refNumero(contBruto);
        if (um !== null) refs.push(um);
        else {
          const rx = /(\d+)\s+\d+\s+R/g;
          let m;
          while ((m = rx.exec(contBruto))) refs.push(+m[1]);
        }
        const partes = [];
        for (const r of refs) {
          const o = doc.objs.get(r);
          if (!o) continue;
          try {
            const b = await lerStream(doc, o);
            if (b && b.length) partes.push(bytesParaLatin1(b));
          } catch (e) { }
        }
        if (!partes.length) continue;
        conteudoBytes = partes.join('\n');
      }

      const conteudo = typeof conteudoBytes === 'string' ? conteudoBytes : bytesParaLatin1(conteudoBytes);
      if (!conteudo) continue;

      const caixa = pegaChave(pag.dict || '', 'MediaBox') || '';
      const nums = (caixa.match(/-?[\d.]+/g) || []).map(Number);
      const altura = nums.length >= 4 ? nums[3] : 842;

      const itens = extrairItens(conteudo, fontes, altura);
      if (itens.length) paginas.push(itens);
    }

    if (!paginas.length) {
      const err = new Error(
        'Não encontrei texto neste PDF.\n\n' +
        'Se ele foi escaneado ou fotografado, o conteúdo é imagem, não texto — ' +
        'e isso exigiria reconhecimento óptico, que este app não faz. ' +
        'Baixe o extrato em OFX ou CSV no site do banco.');
      err.codigo = 'PDF_SEM_TEXTO';
      throw err;
    }
    return paginas;
  };

  function pegaChaveRecursos(doc, dict) {
    if (!dict) return null;
    let rec = pegaChave(dict, 'Resources');
    const ref = refNumero(rec);
    if (ref !== null) {
      const alvo = doc.objs.get(ref);
      rec = alvo ? alvo.dict : null;
    }
    return rec;
  }

  /* ═══════════ Agrupamento de itens em linhas de texto ═════════ */

  // Itens vêm soltos, na ordem em que o gerador desenhou. Agrupa por
  // coordenada Y (mesma linha visual) e ordena por X.
  P.linhas = function (itensPagina, tolerancia) {
    const tol = tolerancia || 3;
    const grupos = [];

    itensPagina.forEach(item => {
      if (!item.texto || !item.texto.trim()) return;
      let alvo = null;
      for (const g of grupos) {
        if (Math.abs(g.y - item.y) <= tol) { alvo = g; break; }
      }
      if (!alvo) { alvo = { y: item.y, itens: [] }; grupos.push(alvo); }
      alvo.itens.push(item);
    });

    grupos.sort((a, b) => a.y - b.y);
    return grupos.map(g => {
      g.itens.sort((a, b) => a.x - b.x);
      let texto = '';
      let ultimoFim = null;
      g.itens.forEach(it => {
        const larguraAprox = it.tamanho * 0.5;
        if (ultimoFim !== null && it.x - ultimoFim > larguraAprox * 0.6) texto += ' ';
        texto += it.texto;
        ultimoFim = it.x + it.texto.length * larguraAprox;
      });
      return { y: g.y, texto: texto.replace(/\s{2,}/g, ' ').trim(), itens: g.itens };
    }).filter(l => l.texto);
  };

  // Agrupa os pedaços de uma linha em "células", separando onde há um
  // vão horizontal grande. É isso que reconstrói as colunas da tabela —
  // e só com as colunas dá para saber que o último número de
  // "12/07  IFOOD  64,80  4.512,30" é saldo, não o valor da compra.
  P.celulas = function (linha) {
    const itens = linha.itens || [];
    if (!itens.length) return [];
    const cels = [];
    let atual = null;
    let fimAnterior = null;

    itens.forEach(it => {
      const larguraChar = it.tamanho * 0.5;
      const vao = fimAnterior === null ? 0 : it.x - fimAnterior;
      // Um vão maior que ~1,4 caractere separa colunas; menor que isso
      // é só o espaçamento normal entre palavras.
      if (!atual || vao > larguraChar * 1.4) {
        atual = { x: it.x, texto: '', fim: 0 };
        cels.push(atual);
      } else if (vao > larguraChar * 0.4) {
        atual.texto += ' ';
      }
      atual.texto += it.texto;
      fimAnterior = it.x + it.texto.length * larguraChar;
      atual.fim = fimAnterior;
    });

    return cels.map(c => ({ x: c.x, fim: c.fim, texto: c.texto.replace(/\s{2,}/g, ' ').trim() }))
      .filter(c => c.texto);
  };

  P.textoCompleto = async function (buffer) {
    const paginas = await P.extrairTexto(buffer);
    return paginas.map(p => P.linhas(p).map(l => l.texto).join('\n')).join('\n\n');
  };

  global.PDF = P;
  P._interno = { bytesParaLatin1, latin1ParaBytes, pegaChave, refNumero, lerStream, inflateTolerante, parseCMapToUnicode };
})(window);
