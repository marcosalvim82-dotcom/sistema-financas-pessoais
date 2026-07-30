/* ══════════════════════════════════════════════════════════════════
   util.js — formatos brasileiros, datas, dinheiro e similaridade
   Tudo em centavos inteiros. Nunca float para dinheiro.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const U = {};

  /* ── Identificadores ─────────────────────────────────────────── */
  U.uid = function () {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  };

  // FNV-1a de 32 bits em hexadecimal. Determinístico entre sessões.
  U.hash = function (str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };

  U.hashBuffer = async function (buf) {
    if (global.crypto && global.crypto.subtle) {
      try {
        const d = await global.crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { /* file:// em alguns navegadores bloqueia subtle */ }
    }
    const bytes = new Uint8Array(buf);
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'fnv' + h.toString(16) + '-' + bytes.length;
  };

  /* ── Dinheiro ────────────────────────────────────────────────── */

  // Converte texto de valor em centavos. Lida com os formatos que
  // realmente aparecem em extratos brasileiros:
  //   "1.234,56"  "-1234.56"  "R$ 1.234,56"  "1234,56 D"  "(45,90)"
  U.parseMoney = function (raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Math.round(raw * 100);
    let s = String(raw).trim();
    if (!s) return null;

    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/\bD$/i.test(s.trim())) { neg = true; s = s.replace(/\bD$/i, ''); }   // débito
    if (/\bC$/i.test(s.trim())) { s = s.replace(/\bC$/i, ''); }               // crédito
    s = s.replace(/R\$/gi, '').replace(/\s/g, '').replace(/ /g, '');
    if (s.startsWith('-') || s.endsWith('-')) { neg = true; s = s.replace(/-/g, ''); }
    if (s.startsWith('+')) s = s.slice(1);
    if (!s) return null;

    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      // O separador decimal é o que aparece por último.
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma > -1) {
      // Vírgula: decimal se tiver 1 ou 2 dígitos depois; senão é milhar.
      const dec = s.length - lastComma - 1;
      s = (dec <= 2) ? s.replace(',', '.') : s.replace(/,/g, '');
    } else if (lastDot > -1) {
      const dec = s.length - lastDot - 1;
      if (dec === 3 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    }

    const n = parseFloat(s);
    if (!isFinite(n)) return null;
    return Math.round(n * 100) * (neg ? -1 : 1);
  };

  U.money = function (cents, opts) {
    opts = opts || {};
    if (cents === null || cents === undefined || isNaN(cents)) return '—';
    const neg = cents < 0;
    const v = Math.abs(cents) / 100;
    let s = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (opts.noCents) s = Math.round(v).toLocaleString('pt-BR');
    const sign = neg ? '−' : (opts.signed ? '+' : '');
    return sign + (opts.bare ? '' : 'R$ ') + s;
  };

  // Forma compacta para eixos e cartões: R$ 12,4 mil / R$ 1,2 mi
  U.moneyShort = function (cents) {
    if (cents === null || cents === undefined || isNaN(cents)) return '—';
    const neg = cents < 0;
    const v = Math.abs(cents) / 100;
    let s;
    if (v >= 1e6) s = (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    else if (v >= 1000) s = (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    else s = v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    return (neg ? '−' : '') + 'R$ ' + s;
  };

  U.pct = function (x, digits) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    return (x * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: digits === undefined ? 1 : digits,
      maximumFractionDigits: digits === undefined ? 1 : digits
    }) + '%';
  };

  /* ── Datas ───────────────────────────────────────────────────── */
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  U.MESES = MESES;
  U.MESES_LONGO = MESES_LONGO;

  const MES_TXT = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
    august: 8, september: 9, october: 10, november: 11, december: 12
  };

  function iso(y, m, d) {
    if (!y || !m || !d) return null;
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // Devolve sempre 'YYYY-MM-DD' ou null. Assume dd/mm/aaaa (padrão BR)
  // quando há ambiguidade, exceto se o primeiro campo for > 12.
  U.parseDate = function (raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    if (raw instanceof Date && !isNaN(raw)) return iso(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());

    // Serial do Excel (1900-based, com o bug histórico do ano bissexto).
    if (typeof raw === 'number' && raw > 20000 && raw < 60000) {
      const ms = Math.round((raw - 25569) * 86400000);
      const d = new Date(ms);
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }

    const s = String(raw).trim();
    if (!s) return null;

    let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return iso(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/))) return iso(+m[1], +m[2], +m[3]);   // OFX
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) {
      let a = +m[1], b = +m[2];
      if (a > 12 && b <= 12) return iso(+m[3], b, a);
      if (b > 12 && a <= 12) return iso(+m[3], a, b);
      return iso(+m[3], b, a);                                                      // dd/mm/aaaa
    }
    if ((m = s.match(/^(\d{1,2})[\s\-\/]*(?:de\s+)?([a-zç]{3,})[\s\-\/]*(?:de\s+)?(\d{2,4})/i))) {
      const mes = MES_TXT[m[2].toLowerCase().slice(0, 3)] || MES_TXT[m[2].toLowerCase()];
      if (mes) return iso(+m[3], mes, +m[1]);
    }
    const d = new Date(s);
    if (!isNaN(d)) return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return null;
  };

  U.today = function () {
    const d = new Date();
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  };

  U.fmtDate = function (isoStr, style) {
    if (!isoStr) return '—';
    const p = isoStr.split('-');
    if (p.length < 3) return isoStr;
    if (style === 'short') return p[2] + '/' + p[1];
    if (style === 'medium') return p[2] + ' ' + MESES[+p[1] - 1];
    if (style === 'long') return +p[2] + ' de ' + MESES_LONGO[+p[1] - 1] + ' de ' + p[0];
    return p[2] + '/' + p[1] + '/' + p[0];
  };

  U.monthKey = function (isoStr) { return isoStr ? isoStr.slice(0, 7) : null; };

  U.fmtMonth = function (key, long) {
    if (!key) return '—';
    const [y, m] = key.split('-');
    return (long ? MESES_LONGO[+m - 1] : MESES[+m - 1]) + (long ? ' de ' + y : '/' + y.slice(2));
  };

  U.addDays = function (isoStr, n) {
    const d = new Date(isoStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  };

  U.addMonths = function (isoStr, n) {
    const [y, m, dd] = isoStr.split('-').map(Number);
    const total = (y * 12 + (m - 1)) + n;
    const ny = Math.floor(total / 12), nm = (total % 12) + 1;
    const last = new Date(ny, nm, 0).getDate();
    return iso(ny, nm, Math.min(dd, last));
  };

  U.daysBetween = function (a, b) {
    return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  };

  U.endOfMonth = function (key) {
    const [y, m] = key.split('-').map(Number);
    return iso(y, m, new Date(y, m, 0).getDate());
  };

  U.startOfMonth = function (key) { return key + '-01'; };

  U.daysInMonth = function (key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  };

  U.weekday = function (isoStr) { return new Date(isoStr + 'T12:00:00').getDay(); };

  // Data segura mesmo quando o dia não existe no mês (31 em fevereiro).
  U.clampDay = function (year, month, day) {
    const last = new Date(year, month, 0).getDate();
    return iso(year, month, Math.min(day, last));
  };

  U.monthsRange = function (fromKey, toKey) {
    const out = [];
    let [y, m] = fromKey.split('-').map(Number);
    const [ty, tm] = toKey.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      out.push(String(y) + '-' + String(m).padStart(2, '0'));
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  };

  /* ── Texto ───────────────────────────────────────────────────── */

  const RE_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
  const RE_SPACES = new RegExp('[\\s\\u00a0]', 'g');

  U.stripAccents = function (s) {
    return s.normalize('NFD').replace(RE_DIACRITICS, '');
  };

  // Ruído que os adquirentes e a rede colam no descritor e que
  // atrapalha qualquer agrupamento por estabelecimento.
  // Só prefixos de adquirente/intermediário. Nomes que são o próprio
  // estabelecimento (UBER*, AMZN*) ficam, senão o comerciante se perde.
  const PREFIXOS = /^(PG\s*\*|PAG\s*\*|PAGTO\s*\*|MP\s*\*|MERPAGO\s*\*|EBW\s*\*|PP\s*\*|PAYPAL\s*\*|SUMUP\s*\*|STONE\s*\*|CIELO\s*\*|REDE\s*\*|GETNET\s*\*|PAGSEGURO\s*\*|PAGS\s*\*|DM\s*\*|IFD\s*\*)/i;

  const LIXO = [
    /\bPARC(ELA)?\s*\d{1,2}\s*\/\s*\d{1,2}\b/gi,
    /\b\d{1,2}\s*\/\s*\d{1,2}\b/g,
    /\bNSU\s*\d+/gi, /\bAUT\s*\d+/gi, /\bDOC\s*\d{4,}/gi,
    /\bTERM(INAL)?\s*\d+/gi, /\bCV\s*\d{4,}/gi,
    /\b\d{2}\/\d{2}(\/\d{2,4})?\b/g,
    /\bREF\s*\.?\s*\d+/gi,
    /\s+-\s+[A-Z]{2}$/,
    /\b(BRA|BR|BRASIL)\b\s*$/i
  ];

  const UFS = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';

  U.normalizeDescriptor = function (raw) {
    if (!raw) return '';
    let s = U.stripAccents(String(raw)).toUpperCase();
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(PREFIXOS, '');
    LIXO.forEach(rx => { s = s.replace(rx, ' '); });
    s = s.replace(new RegExp('\\s+(' + UFS + ')\\s*$', 'i'), '');
    s = s.replace(/[^\wÀ-ÿ\s\.\-&\/\*]/g, ' ');
    s = s.replace(/\s{2,}/g, ' ').trim();
    return s;
  };

  // Chave de agrupamento por estabelecimento: primeiras palavras
  // significativas, sem números soltos.
  const STOP = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'LTDA', 'ME', 'SA', 'S', 'A', 'EIRELI',
    'COMERCIO', 'COM', 'IND', 'INDUSTRIA', 'EPP', 'BR', 'BRASIL', 'LTD', 'INC', 'CO']);

  // Ruído de meio de pagamento que vem antes do nome real do
  // estabelecimento em extratos brasileiros.
  const RUIDO_INICIAL = /^(PAGAMENTO\s+(DE\s+)?(BOLETO|TITULO|CONTA|FATURA(?!\s*CARTAO))|PAGTO\s+(BOLETO|CONTA)|DEBITO\s+AUTOMATICO(\s+DE)?|DEB\s+AUTOM(ATICO)?|COMPRA\s+(COM\s+)?CARTAO(\s+DE)?(\s+DEBITO|\s+CREDITO)?|COMPRA\s+DEBITO|COMPRA|LIQUIDACAO\s+(DE\s+)?(BOLETO|TITULO)|RECEBIMENTO\s+(DE\s+)?|CREDITO\s+(DE\s+)?|TRANSFERENCIA\s+(PARA|DE)?|BOLETO\s+DE?)\s+/;

  U.merchantSource = function (norm) {
    if (!norm) return '';
    let s = norm;
    for (let i = 0; i < 2; i++) {
      const next = s.replace(RUIDO_INICIAL, '');
      if (next === s) break;
      s = next;
    }
    return s.trim() || norm;
  };

  U.merchantKey = function (norm) {
    if (!norm) return '';
    const raw = norm.split(/[\s\.\-\/\*]+/).filter(Boolean);
    const toks = [];
    raw.forEach((t, i) => {
      // "99" em "99 TECNOLOGIA" é o nome da empresa, não ruído.
      const numeric = /^\d+$/.test(t);
      if (numeric && !(i === 0 && t.length <= 3)) return;
      if (STOP.has(t)) return;
      toks.push(t);
    });
    return toks.slice(0, 3).join(' ') || norm.slice(0, 24);
  };

  U.titleCase = function (s) {
    if (!s) return '';
    return s.toLowerCase().replace(/(^|[\s\-\/])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
  };

  /* ── Similaridade (trigramas, coeficiente de Dice) ───────────── */
  function trigrams(s) {
    const t = '  ' + s + ' ';
    const set = new Set();
    for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
    return set;
  }
  U.trigrams = trigrams;

  U.similarity = function (a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const A = trigrams(a), B = trigrams(b);
    let inter = 0;
    A.forEach(x => { if (B.has(x)) inter++; });
    return (2 * inter) / (A.size + B.size);
  };

  /* ── Estatística ─────────────────────────────────────────────── */
  U.median = function (arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  };
  U.mean = function (arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };
  U.stdev = function (arr) {
    if (arr.length < 2) return 0;
    const m = U.mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1));
  };
  U.percentile = function (arr, p) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    const i = (s.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? s[lo] : Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo));
  };

  /* ── DOM ─────────────────────────────────────────────────────── */
  U.el = function (tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(e.style, attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(c => {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };

  U.esc = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.debounce = function (fn, ms) {
    let t;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms);
    };
  };

  U.download = function (filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  };

  U.groupBy = function (arr, fn) {
    const m = new Map();
    arr.forEach(x => {
      const k = fn(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    });
    return m;
  };

  U.sum = function (arr, fn) {
    return arr.reduce((a, x) => a + (fn ? fn(x) : x), 0);
  };

  global.U = U;
})(window);
