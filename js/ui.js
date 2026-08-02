/* ══════════════════════════════════════════════════════════════════
   ui.js — telas, navegação e interações
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const UI = {};
  const d = () => DB.data;
  const $ = sel => document.querySelector(sel);
  const esc = U.esc;

  UI.state = {
    view: 'painel',
    month: null,
    search: '',
    filters: { accountId: '', cardId: '', categoryId: '', from: '', to: '', min: '', max: '', onlyReview: false },
    selection: new Set(),
    page: 200,
    calMonth: null
  };

  const VIEWS = [
    { id: 'painel', ico: '◆', label: 'Painel' },
    { id: 'revisar', ico: '◇', label: 'Revisar' },
    { id: 'transacoes', ico: '≡', label: 'Lançamentos' },
    { id: 'cartoes', ico: '▭', label: 'Cartões' },
    { id: 'calendario', ico: '▦', label: 'Calendário' },
    { id: 'metas', ico: '◎', label: 'Metas' },
    { id: 'investimentos', ico: '▲', label: 'Investimentos' },
    { id: 'relatorios', ico: '▤', label: 'Relatórios' },
    { id: 'ajustes', ico: '⚙', label: 'Ajustes' }
  ];
  // A barra do celular cabe em 5 itens. O que sobra vai para o "Mais",
  // senão metade do app fica inalcançável no telefone — o menu lateral
  // some abaixo de 900px.
  const MOBILE_VIEWS = ['painel', 'revisar', 'transacoes', 'cartoes'];
  const MOBILE_EXTRA = ['calendario', 'metas', 'investimentos', 'relatorios', 'ajustes'];

  /* ═══════════════════════ Infraestrutura ══════════════════════ */

  // opts.persist mantém o aviso na tela até você fechar — usado quando
  // o aviso traz um botão que exige decisão.
  UI.toast = function (msg, kind, opts) {
    opts = opts || {};
    const old = $('.toast'); if (old) old.remove();
    const t = U.el('div', { class: 'toast ' + (kind || ''), html: msg });
    if (opts.persist) {
      const x = U.el('button', {
        class: 'btn sm ghost', text: '✕', title: 'Fechar',
        style: { marginLeft: 'auto' },
        onclick: () => t.remove()
      });
      t.appendChild(x);
    } else {
      setTimeout(() => { if (t.parentNode) t.remove(); }, kind === 'bad' ? 8000 : 4500);
    }
    document.body.appendChild(t);
    return t;
  };

  UI.closeModal = function () {
    const s = $('.scrim'); if (s) s.remove();
  };

  UI.modal = function (html, opts) {
    opts = opts || {};
    UI.closeModal();
    const scrim = U.el('div', { class: 'scrim' });
    const modal = U.el('div', { class: 'modal ' + (opts.wide ? 'wide' : ''), html });
    scrim.appendChild(modal);
    scrim.addEventListener('click', e => { if (e.target === scrim && !opts.sticky) UI.closeModal(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { UI.closeModal(); document.removeEventListener('keydown', onKey); }
    });
    document.body.appendChild(scrim);
    if (opts.onMount) opts.onMount(modal);
    const f = modal.querySelector('input,select,textarea,button');
    if (f && !opts.noFocus) f.focus();
    return modal;
  };

  UI.confirm = function (title, body, onYes, yesLabel) {
    UI.modal('<h2>' + esc(title) + '</h2><p style="color:var(--ink-2);font-size:.9rem">' + body + '</p>' +
      '<div class="modal-foot"><button class="btn" data-x="cancel">Cancelar</button>' +
      '<button class="btn primary" data-x="ok">' + esc(yesLabel || 'Confirmar') + '</button></div>',
      {
        onMount(m) {
          m.querySelector('[data-x=cancel]').onclick = UI.closeModal;
          m.querySelector('[data-x=ok]').onclick = () => { UI.closeModal(); onYes(); };
        }
      });
  };

  UI.go = function (view, opts) {
    UI.state.view = view;
    if (opts) {
      if (opts.search !== undefined) UI.state.search = opts.search || '';
      if (opts.category) UI.state.filters.categoryId = opts.category;
      if (opts.accountId) UI.state.filters.accountId = opts.accountId;
      if (opts.cardId) UI.state.filters.cardId = opts.cardId;
      if (opts.month) {
        UI.state.filters.from = opts.month + '-01';
        UI.state.filters.to = U.endOfMonth(opts.month);
      }
      if (opts.onlyReview !== undefined) UI.state.filters.onlyReview = opts.onlyReview;
    }
    UI.state.selection.clear();
    UI.render();
    const m = $('main'); if (m) m.scrollTop = 0;
  };

  /* ═══════════════════════ Casca ═══════════════════════════════ */

  UI.render = function () {
    const app = $('#app');
    const pend = ENGINE.reviewQueue().length;

    app.innerHTML =
      '<nav class="side">' +
      '<div class="brand"><b>' + esc(d().settings.household || 'Minhas finanças') + '</b>' +
      '<span>controle financeiro</span></div>' +
      '<div class="navlist">' +
      VIEWS.map(v => '<button data-nav="' + v.id + '" class="' + (UI.state.view === v.id ? 'on' : '') + '">' +
        '<span class="ico">' + v.ico + '</span>' + v.label +
        (v.id === 'revisar' && pend ? '<span class="badge">' + pend + '</span>' : '') +
        '</button>').join('') +
      '</div>' +
      '<div class="nav-foot">' +
      '<button data-act="import">＋ Importar extrato</button>' +
      '<button data-act="gmail">✉ Buscar no Gmail</button>' +
      '<button data-act="backup">↓ Backup</button>' +
      '<button data-act="theme">◐ Tema</button>' +
      '<span id="saveState"></span>' +
      '</div></nav>' +
      '<main><div class="view" id="viewRoot"></div></main>' +
      '<div class="mobilebar">' +
      MOBILE_VIEWS.map(id => {
        const v = VIEWS.find(x => x.id === id);
        return '<button data-nav="' + v.id + '" class="' + (UI.state.view === v.id ? 'on' : '') + '">' +
          '<span class="ico">' + v.ico + '</span>' + v.label +
          (v.id === 'revisar' && pend ? '<span class="badge">' + pend + '</span>' : '') + '</button>';
      }).join('') +
      '<button data-act="mais" class="' + (MOBILE_EXTRA.includes(UI.state.view) ? 'on' : '') + '">' +
      '<span class="ico">⋯</span>Mais</button>' +
      '</div>';

    const root = $('#viewRoot');
    try {
      (UI.viewRenderers[UI.state.view] || UI.viewRenderers.painel)(root);
    } catch (e) {
      console.error(e);
      root.innerHTML = '<div class="note bad"><b>Algo quebrou ao desenhar esta tela.</b><br>' +
        esc(e.message) + '<br><br>Seus dados estão salvos. Recarregue a página; se persistir, ' +
        'faça um backup em Ajustes e me mande o arquivo.</div>';
    }
    UI.updateSaveState();
  };

  UI.updateSaveState = function () {
    const el = $('#saveState');
    if (!el) return;
    const info = DB.sizeInfo();
    el.textContent = info.transactions.toLocaleString('pt-BR') + ' lançamentos · ' +
      (DB.saveError ? 'ERRO AO SALVAR' : 'salvo');
    el.style.color = DB.saveError ? 'var(--neg)' : '';
  };

  /* ═══════════════════════ Delegação de eventos ════════════════ */

  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) return UI.go(nav.dataset.nav);

    const act = e.target.closest('[data-act]');
    if (act) {
      const fn = UI.actions[act.dataset.act];
      if (fn) { e.preventDefault(); fn(act, e); }
    }
  });

  /* ═══════════════════════ Importação ══════════════════════════ */

  UI.actions = {};

  UI.actions.import = function () {
    const input = U.el('input', { type: 'file', multiple: 'multiple', accept: '.ofx,.ofc,.qfx,.csv,.txt,.tsv,.xlsx,.xls,.xlsm,.json,.pdf' });
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => { UI.handleFiles(Array.from(input.files)); input.remove(); };
    input.click();
  };

  UI.handleFiles = async function (files) {
    if (!files || !files.length) return;
    UI.modal('<h2>Lendo arquivos…</h2><p class="muted" id="impProgress">Preparando.</p>', { sticky: true, noFocus: true });
    const reports = [];
    for (const file of files) {
      const p = $('#impProgress');
      if (p) p.textContent = 'Lendo ' + file.name + '…';
      try {
        const parsed = await PARSE.parseFile(file);
        if (parsed.warnings && parsed.warnings[0] === '__BACKUP__') {
          UI.closeModal();
          return UI.offerRestore(parsed.rawText, file.name);
        }
        if (!parsed.statements.length) {
          reports.push({
            filename: file.name, failed: true, warnings: parsed.warnings,
            linhas: parsed._linhas || null, codigo: parsed._codigo || null
          });
          continue;
        }
        const rep = await ENGINE.importParsed(parsed, file, {});
        reports.push(rep);
      } catch (err) {
        console.error(err);
        reports.push({ filename: file.name, failed: true, warnings: [err.message || String(err)] });
      }
    }
    await DB.flush();
    UI.closeModal();
    UI.showImportReport(reports);
    UI.render();
  };

  // Guarda o texto lido de PDFs que falharam, para o diagnóstico.
  // Fica só em memória: nada disso vai para o disco nem para a rede.
  UI._linhasPdf = {};

  UI.actions.vertexto = function (el) {
    const linhas = UI._linhasPdf[el.dataset.i] || [];
    UI.modal('<h2>Texto extraído do PDF</h2>' +
      '<p style="font-size:.87rem;color:var(--ink-2)">Foi isto que consegui ler do arquivo. ' +
      'Se você reconhecer aqui as linhas dos lançamentos, o problema é só o reconhecimento do ' +
      'padrão — me mostre <b>uma linha de exemplo</b> (pode trocar os valores por outros) que eu ajusto. ' +
      'Se o texto estiver embaralhado ou vazio, o PDF usa fontes que não consigo decifrar.</p>' +
      '<textarea readonly rows="18" style="font-family:var(--mono);font-size:.72rem;white-space:pre">' +
      esc(linhas.join('\n')) + '</textarea>' +
      '<div class="modal-foot">' +
      '<button class="btn" data-x="copiar">Copiar tudo</button>' +
      '<button class="btn primary" data-x="fechar">Fechar</button></div>',
      {
        wide: true,
        onMount(m) {
          m.querySelector('[data-x=fechar]').onclick = UI.closeModal;
          m.querySelector('[data-x=copiar]').onclick = () => {
            const ta = m.querySelector('textarea');
            ta.select();
            try { document.execCommand('copy'); UI.toast('Texto copiado.', 'good'); }
            catch (e) { UI.toast('Selecione o texto e copie com Ctrl+C.', 'bad'); }
          };
        }
      });
  };

  UI.showImportReport = function (reports) {
    const ok = reports.filter(r => !r.failed);
    const bad = reports.filter(r => r.failed);
    const totalIns = U.sum(ok, r => r.inserted);
    const totalDup = U.sum(ok, r => r.duplicates);
    const totalRev = U.sum(ok, r => r.review);
    const autoPct = totalIns ? (totalIns - totalRev) / totalIns : 1;

    let html = '<h2>Importação concluída</h2>';
    if (totalIns) {
      html += '<div class="note good"><b>' + totalIns.toLocaleString('pt-BR') + ' lançamentos novos</b>' +
        (totalDup ? ' · ' + totalDup + ' duplicados ignorados' : '') +
        '<br>' + U.pct(autoPct, 0) + ' classificados automaticamente' +
        (totalRev ? ' · <b>' + totalRev + '</b> precisam da sua confirmação' : ' · nada para revisar') +
        '</div>';
    }

    ok.forEach(r => {
      html += '<div class="impline"><span>' + esc(r.filename) + ' <span class="pill">' + r.format + '</span></span>' +
        '<span class="num">' + r.inserted + ' novos · ' + r.duplicates + ' dup.</span></div>';
      (r.accountsCreated || []).forEach(a => {
        html += '<div class="note" style="margin:.4rem 0"><b>Conta detectada:</b> ' + esc(a.name) +
          '. Você pode renomear em Ajustes.</div>';
      });
      (r.cardsCreated || []).forEach(c => {
        html += '<div class="note" style="margin:.4rem 0"><b>Cartão detectado:</b> ' + esc(c.name) +
          '. Informe limite, fechamento e vencimento na tela de Cartões para liberar a previsão de faturas.</div>';
      });
      (r.balanceChecks || []).forEach(b => {
        html += '<div class="note warn" style="margin:.4rem 0"><b>Conferência de saldo em ' + esc(b.accountName) + ':</b> ' +
          'faltam ' + U.money(Math.abs(b.diffCents)) + ' entre o saldo informado pelo banco e a soma dos lançamentos. ' +
          'Provavelmente há um período sem importar antes de ' + U.fmtDate(b.periodStart) + '.</div>';
      });
      (r.warnings || []).forEach(w => {
        html += '<div class="note" style="margin:.4rem 0">' + esc(w) + '</div>';
      });
    });

    bad.forEach((r, i) => {
      if (r.linhas && r.linhas.length) UI._linhasPdf[i] = r.linhas;
      html += '<div class="note bad" style="margin:.4rem 0"><b>' + esc(r.filename) + '</b><br>' +
        (r.warnings || []).map(w => esc(w).replace(/\n/g, '<br>')).join('<br>') +
        (r.linhas && r.linhas.length
          ? '<div style="margin-top:.5rem"><button class="btn sm" data-act="vertexto" data-i="' + i + '">' +
          'Ver texto extraído (' + r.linhas.length + ' linhas)</button></div>'
          : '') +
        '</div>';
    });

    html += '<div class="modal-foot">' +
      (totalRev ? '<button class="btn primary" data-x="rev">Revisar ' + totalRev + ' item' + (totalRev > 1 ? 'ns' : '') + '</button>' : '') +
      '<button class="btn" data-x="close">Fechar</button></div>';

    UI.modal(html, {
      onMount(m) {
        m.querySelector('[data-x=close]').onclick = () => { UI.closeModal(); UI.render(); };
        const rev = m.querySelector('[data-x=rev]');
        if (rev) rev.onclick = () => { UI.closeModal(); UI.go('revisar'); };
      }
    });
  };

  UI.offerRestore = function (text, filename) {
    UI.confirm('Restaurar backup?',
      'O arquivo <b>' + esc(filename) + '</b> é um backup. Restaurar vai <b>substituir</b> todos os dados atuais ' +
      '(' + d().transactions.length.toLocaleString('pt-BR') + ' lançamentos). Esta ação não tem desfazer.',
      async () => {
        const res = DB.importJSON(text);
        await DB.flush();
        UI.toast(res.ok ? 'Backup restaurado: ' + res.msg : res.msg, res.ok ? 'good' : 'bad');
        UI.render();
      }, 'Substituir tudo');
  };

  // Arrastar e soltar em qualquer lugar da janela
  ['dragenter', 'dragover'].forEach(ev => {
    document.addEventListener(ev, e => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      e.preventDefault();
      document.body.classList.add('dragging');
      const dz = $('.drop'); if (dz) dz.classList.add('over');
    });
  });
  document.addEventListener('dragleave', e => {
    if (e.relatedTarget) return;
    document.body.classList.remove('dragging');
    const dz = $('.drop'); if (dz) dz.classList.remove('over');
  });
  document.addEventListener('drop', e => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    document.body.classList.remove('dragging');
    UI.handleFiles(Array.from(e.dataTransfer.files));
  });

  UI.actions.backup = async function () {
    await DB.flush();
    U.download(DB.backupFilename(), DB.exportJSON(), 'application/json');
    d().settings.lastBackup = U.today();
    DB.save();
    UI.toast('Backup salvo na pasta de downloads.', 'good');
  };

  // Tudo o que não coube na barra do celular.
  UI.actions.mais = function () {
    const item = (icone, texto, attr, detalhe) =>
      '<button class="btn ghost" ' + attr + ' style="justify-content:flex-start;gap:.6rem;' +
      'padding:.6rem .5rem;width:100%;border-bottom:1px solid var(--rule-soft);border-radius:0">' +
      '<span style="width:1.4rem;text-align:center;font-size:1rem">' + icone + '</span>' +
      '<span style="display:flex;flex-direction:column;gap:.05rem;min-width:0">' +
      '<span style="font-size:.92rem;color:var(--ink)">' + texto + '</span>' +
      (detalhe ? '<span style="font-size:.72rem;color:var(--ink-3)">' + detalhe + '</span>' : '') +
      '</span></button>';

    UI.modal('<h2>Mais</h2>' +
      '<div style="display:flex;flex-direction:column;margin:-.3rem 0 .6rem">' +
      MOBILE_EXTRA.map(id => {
        const v = VIEWS.find(x => x.id === id);
        return item(v.ico, v.label, 'data-nav="' + v.id + '"');
      }).join('') +
      '</div>' +
      '<div class="lbl">importar</div>' +
      '<div style="display:flex;flex-direction:column;margin-bottom:.6rem">' +
      item('＋', 'Importar extrato', 'data-act="import"', 'arquivo OFX, CSV ou XLSX') +
      item('✉', 'Buscar no Gmail', 'data-act="gmail"', 'procura extratos e faturas no seu e-mail') +
      '</div>' +
      '<div class="lbl">sistema</div>' +
      '<div style="display:flex;flex-direction:column">' +
      item('↓', 'Baixar backup', 'data-act="backup"', 'guarde este arquivo em lugar seguro') +
      item('◐', 'Trocar tema', 'data-act="theme"', 'claro, escuro ou automático') +
      '</div>' +
      '<div class="modal-foot"><button class="btn" data-x="c">Fechar</button></div>',
      {
        onMount(m) {
          m.querySelector('[data-x=c]').onclick = UI.closeModal;
          // Fecha antes de agir, senão a tela nova nasce atrás do modal.
          m.querySelectorAll('[data-nav],[data-act]').forEach(b => {
            b.addEventListener('click', () => setTimeout(UI.closeModal, 0));
          });
        }
      });
  };

  UI.actions.theme = function () {
    const cur = d().settings.theme || 'auto';
    const next = cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto';
    d().settings.theme = next;
    UI.applyTheme();
    DB.save();
    UI.toast('Tema: ' + (next === 'auto' ? 'automático' : next === 'light' ? 'claro' : 'escuro'));
  };

  UI.applyTheme = function () {
    const t = d().settings.theme || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  };

  /* ═══════════════════════ Seletor de categoria ════════════════ */

  UI.pickCategory = function (onPick, currentId) {
    const cats = ENGINE.leafCategories();
    const html = '<h2>Escolher categoria</h2>' +
      '<input type="search" id="catSearch" placeholder="Buscar categoria…" autocomplete="off">' +
      '<div id="catList" style="max-height:52vh;overflow-y:auto;margin-top:.6rem;display:flex;flex-direction:column;gap:1px"></div>' +
      '<div class="modal-foot"><button class="btn" data-x="close">Cancelar</button></div>';

    UI.modal(html, {
      onMount(m) {
        const list = m.querySelector('#catList');
        const input = m.querySelector('#catSearch');
        function draw(q) {
          const nq = U.stripAccents(q || '').toLowerCase();
          const filtered = cats.filter(c => {
            if (!nq) return true;
            return U.stripAccents(ENGINE.categoryLabel(c.id)).toLowerCase().includes(nq);
          });
          list.innerHTML = filtered.map(c =>
            '<button class="btn ghost" data-pick="' + c.id + '" style="justify-content:flex-start;' +
            (c.id === currentId ? 'color:var(--brass);font-weight:600' : '') + '">' +
            '<span class="dotcat" style="background:' + ENGINE.categoryColor(c.id) + '"></span>' +
            esc(ENGINE.categoryLabel(c.id)) + '</button>').join('') ||
            '<div class="muted" style="padding:.5rem">Nada encontrado.</div>';
        }
        draw('');
        input.addEventListener('input', () => draw(input.value));
        list.addEventListener('click', ev => {
          const b = ev.target.closest('[data-pick]');
          if (!b) return;
          UI.closeModal();
          onPick(b.dataset.pick);
        });
        m.querySelector('[data-x=close]').onclick = UI.closeModal;
      }
    });
  };

  // Sugestões para a fila de revisão: a aposta atual + categorias
  // que você já usou para coisas parecidas + as mais usadas.
  UI.suggestions = function (tx) {
    const out = [];
    const add = id => { if (id && !out.includes(id) && ENGINE.category(id)) out.push(id); };
    add(tx.categoryId);
    const sims = d().transactions
      .filter(t => t.id !== tx.id && t.categorySource === 'user' &&
        U.similarity(t.descriptorNorm, tx.descriptorNorm) > 0.5)
      .slice(0, 30);
    const votes = U.groupBy(sims, t => t.categoryId);
    Array.from(votes.entries()).sort((a, b) => b[1].length - a[1].length).forEach(([c]) => add(c));
    const freq = U.groupBy(d().transactions.filter(t =>
      t.categoryId && (tx.amountCents < 0) === (t.amountCents < 0)), t => t.categoryId);
    Array.from(freq.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 6).forEach(([c]) => add(c));
    return out.slice(0, 5);
  };

  global.UI = UI;
  UI.viewRenderers = {};
})(window);
