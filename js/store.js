/* ══════════════════════════════════════════════════════════════════
   store.js — persistência local (IndexedDB) + backup em arquivo

   O conjunto de dados inteiro vive em memória e é gravado como um
   único registro JSON, com escrita adiada. Para o volume de finanças
   pessoais (dezenas de milhares de lançamentos) isso é mais rápido e
   muito menos sujeito a bug do que espalhar em vários object stores —
   e torna o backup e a futura migração para SQLite triviais.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const DB_NAME = 'financas-pessoais';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const KEY = 'dataset';
  const SCHEMA_VERSION = 1;

  const DB = {
    data: null,
    ready: false,
    _idb: null,
    _saveTimer: null,
    _listeners: [],
    lastSavedAt: null,
    saveError: null
  };

  function emptyDataset() {
    return {
      schemaVersion: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: {
        theme: 'auto',
        density: 'confortavel',
        household: 'Minhas finanças',
        reviewThreshold: 0.62,   // abaixo disto vai para a fila
        autoThreshold: 0.90,     // acima disto aplica em silêncio
        firstRun: true
      },
      accounts: [],
      cards: [],
      categories: [],
      merchants: [],
      rules: [],
      transactions: [],
      installmentPlans: [],
      statements: [],
      recurrences: [],
      links: [],
      goals: [],
      budgets: [],
      tags: [],
      investAccounts: [],
      investPositions: [],
      investTxs: [],
      imports: [],
      dismissedInsights: []
    };
  }
  DB.emptyDataset = emptyDataset;

  /* ── IndexedDB ───────────────────────────────────────────────── */

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('IndexedDB indisponível'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbGet(db, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbPut(db, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('transação abortada'));
    });
  }

  /* ── Ciclo de vida ───────────────────────────────────────────── */

  DB.load = async function () {
    let stored = null;
    try {
      DB._idb = await openIDB();
      stored = await idbGet(DB._idb, KEY);
    } catch (e) {
      console.warn('IndexedDB indisponível, usando localStorage:', e);
      DB._idb = null;
      try {
        const raw = localStorage.getItem(DB_NAME);
        if (raw) stored = JSON.parse(raw);
      } catch (e2) { /* começa vazio */ }
    }

    DB.data = stored ? migrate(stored) : emptyDataset();
    DB.ready = true;
    return DB.data;
  };

  function migrate(d) {
    const base = emptyDataset();
    // Preenche chaves novas sem apagar as existentes.
    for (const k in base) if (!(k in d)) d[k] = base[k];
    for (const k in base.settings) if (!(k in d.settings)) d.settings[k] = base.settings[k];
    d.schemaVersion = SCHEMA_VERSION;
    return d;
  }

  DB.save = function () {
    if (!DB.ready) return;
    DB.data.updatedAt = new Date().toISOString();
    clearTimeout(DB._saveTimer);
    DB._saveTimer = setTimeout(() => { DB.flush(); }, 400);
  };

  DB.flush = async function () {
    if (!DB.ready) return;
    clearTimeout(DB._saveTimer);
    try {
      if (DB._idb) {
        await idbPut(DB._idb, KEY, DB.data);
      } else {
        localStorage.setItem(DB_NAME, JSON.stringify(DB.data));
      }
      DB.lastSavedAt = new Date();
      DB.saveError = null;
    } catch (e) {
      DB.saveError = e;
      console.error('Falha ao gravar:', e);
    }
    DB._listeners.forEach(fn => { try { fn(); } catch (e) { } });
  };

  DB.onSave = function (fn) { DB._listeners.push(fn); };

  /* ── Backup ──────────────────────────────────────────────────── */

  DB.exportJSON = function () {
    const payload = {
      _formato: 'financas-pessoais/backup',
      _versao: SCHEMA_VERSION,
      _exportadoEm: new Date().toISOString(),
      dados: DB.data
    };
    return JSON.stringify(payload, null, 1);
  };

  DB.backupFilename = function () {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return 'financas-backup-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
  };

  // Devolve {ok, msg}. Substitui todo o conteúdo — quem chama confirma antes.
  DB.importJSON = function (text) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { return { ok: false, msg: 'Arquivo não é um JSON válido.' }; }

    const d = parsed && parsed.dados ? parsed.dados : parsed;
    if (!d || !Array.isArray(d.transactions) || !Array.isArray(d.accounts)) {
      return { ok: false, msg: 'Este JSON não parece um backup do sistema (faltam contas ou lançamentos).' };
    }
    DB.data = migrate(d);
    DB.save();
    return {
      ok: true,
      msg: d.transactions.length.toLocaleString('pt-BR') + ' lançamentos e ' +
        d.accounts.length + ' contas restaurados.'
    };
  };

  DB.wipe = async function () {
    DB.data = emptyDataset();
    await DB.flush();
  };

  /* ── Estatística de uso, para avisar antes de doer ───────────── */
  DB.sizeInfo = function () {
    let bytes = 0;
    try { bytes = new Blob([JSON.stringify(DB.data)]).size; } catch (e) { }
    return {
      bytes,
      mb: bytes / 1048576,
      transactions: DB.data ? DB.data.transactions.length : 0,
      pesado: bytes > 25 * 1048576
    };
  };

  global.DB = DB;
})(window);
