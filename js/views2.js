/* ══════════════════════════════════════════════════════════════════
   views2.js — Cartões, Calendário, Metas, Investimentos,
               Relatórios e Ajustes
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const d = () => DB.data;
  const esc = U.esc;
  const V = UI.viewRenderers;

  function head(title, sub, right) {
    return '<div class="vhead"><div><h1>' + esc(title) + '</h1>' +
      (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>' +
      '<div class="spacer"></div>' + (right || '') + '</div>';
  }

  /* ════════════════════════ CARTÕES ════════════════════════════ */

  V.cartoes = function (root) {
    const data = d();
    if (!data.cards.length) {
      root.innerHTML = head('Cartões') +
        '<div class="empty"><b>Nenhum cartão ainda</b>' +
        '<span>Importe a fatura do cartão (OFX ou CSV) e ele aparece aqui sozinho, ' +
        'com ciclo, parcelas e limite.</span>' +
        '<button class="btn primary" data-act="import">＋ Importar fatura</button>' +
        '<button class="btn" data-act="newcard">Criar cartão manualmente</button></div>';
      return;
    }

    let html = head('Cartões', 'Compras entram como despesa na data da compra; o dinheiro sai no vencimento.',
      '<button class="btn" data-act="newcard">＋ Novo cartão</button>' +
      '<button class="btn primary" data-act="import">＋ Importar fatura</button>');

    data.cards.forEach(card => {
      const s = ENGINE.cardSummary(card);
      const plans = data.installmentPlans.filter(p => p.cardId === card.id && ENGINE.planRemaining(p) > 0);
      const today = U.today();

      html += '<div class="card"><div class="row">' +
        '<h3 style="font-size:1.05rem">' + esc(card.name) + '</h3>' +
        (card.closingDay ? '<span class="pill">fecha dia ' + card.closingDay + ' · vence dia ' + card.dueDay +
          (card.cycleConfidence === 'estimada' ? ' (estimado)' : '') + '</span>'
          : '<span class="pill warn">ciclo não definido</span>') +
        '<span style="flex:1"></span>' +
        '<button class="btn sm" data-act="editcard" data-id="' + card.id + '">Configurar</button>' +
        '<button class="btn sm" data-act="cardtx" data-id="' + card.id + '">Ver lançamentos</button>' +
        '</div>';

      html += '<div class="grid g4">' +
        mini('Fatura aberta', U.money(s.openCents), s.open ? 'fecha ' + U.fmtDate(s.open.cycleEnd) : '—') +
        mini('Fechada a pagar', U.money(s.unpaidCents), s.nextDue ? 'vence ' + U.fmtDate(s.nextDue) : '—') +
        mini('Futuro comprometido', U.money(s.committedCents), plans.length + ' parcelamento' + (plans.length !== 1 ? 's' : '')) +
        mini('Limite disponível', card.limitCents ? U.money(s.availableCents) : '—',
          card.limitCents ? U.pct(s.usedPct, 0) + ' de ' + U.moneyShort(card.limitCents) + ' usado'
            : 'informe o limite em Configurar') +
        '</div>';

      if (card.limitCents) {
        html += '<span class="prog"><i style="width:' + (s.usedPct * 100).toFixed(1) + '%;background:' +
          (s.usedPct > 0.85 ? 'var(--neg)' : s.usedPct > 0.6 ? 'var(--warn)' : 'var(--brass)') + '"></i></span>';
      }

      // Previsão das próximas faturas
      const fcBars = [];
      const proj = ENGINE.projectedInstallments(6).filter(t => t.cardId === card.id);
      const variableEst = estimateCardVariable(card);
      for (let i = 0; i < 6; i++) {
        const ref = U.addMonths(today, i);
        const cyc = card.closingDay ? ENGINE.statementCycleFor(card, ref) : null;
        const label = U.fmtMonth(U.monthKey(cyc ? cyc.dueDate : ref));
        const committed = Math.abs(U.sum(proj.filter(t =>
          U.monthKey(t.cashDate || t.date) === U.monthKey(cyc ? cyc.dueDate : ref)), t => t.amountCents));
        fcBars.push({ label, committed, estimated: i === 0 ? 0 : variableEst });
      }
      html += '<div class="grid g2">' +
        '<div><div class="lbl">Previsão das próximas faturas</div>' + CHARTS.cardForecast(fcBars) + '</div>' +
        '<div><div class="lbl">Parcelamentos em aberto</div>' +
        (plans.length ? plans.map(p => {
          const paid = ENGINE.planPaidCount(p);
          return '<div class="catbar"><span class="catbar-head">' +
            '<span class="catbar-name">' + esc(p.merchantName || p.merchantKey) + '</span>' +
            '<span class="catbar-val">' + paid + '/' + p.total + ' · ' + U.money(p.installmentCents) + '</span></span>' +
            '<span class="catbar-track"><i style="width:' + ((paid / p.total) * 100).toFixed(0) +
            '%;background:var(--brass)"></i></span>' +
            '<span class="catbar-sub">faltam ' + U.money(ENGINE.planRemaining(p)) +
            ' · termina em ' + U.fmtDate(U.addMonths(p.firstDate, p.total - 1), 'medium') + '</span></div>';
        }).join('') + '<div class="muted" style="font-size:.78rem;margin-top:.4rem">Total comprometido: <b>' +
          U.money(s.committedCents) + '</b></div>'
          : '<div class="empty-chart">Nenhuma compra parcelada em aberto.</div>') +
        '</div></div>';

      // Faturas
      // Janela em torno de hoje: as faturas recentes importam mais que
      // as projetadas de 2027.
      const comItens = s.statements.filter(x => x.items.length);
      const atualIdx = Math.max(0, comItens.findIndex(x => x.cycleEnd >= today));
      const sts = comItens.slice(Math.max(0, atualIdx - 5), atualIdx + 3).reverse();
      html += '<div class="scrollx"><table class="tbl"><thead><tr>' +
        '<th>Fatura</th><th>Período</th><th>Vencimento</th><th class="n">Compras</th>' +
        '<th class="n">Pago</th><th>Situação</th></tr></thead><tbody>' +
        sts.map(st => '<tr><td><b>' + U.fmtMonth(U.monthKey(st.dueDate), true) + '</b></td>' +
          '<td class="muted">' + U.fmtDate(st.cycleStart, 'short') + ' a ' + U.fmtDate(st.cycleEnd, 'short') + '</td>' +
          '<td>' + U.fmtDate(st.dueDate) + '</td>' +
          '<td class="n neg">' + U.money(Math.abs(st.chargesCents || 0)) + '</td>' +
          '<td class="n">' + (st.paidCents ? U.money(st.paidCents) : '—') + '</td>' +
          '<td><span class="pill ' + statusPill(st.status) + '">' + st.status + '</span></td></tr>').join('') +
        '</tbody></table></div>';

      html += '</div>';
    });

    root.innerHTML = html;
  };

  function statusPill(s) {
    return s === 'paga' ? 'pos' : s === 'vencida' ? 'neg' : s === 'aberta' ? 'brass' :
      s === 'prevista' ? '' : 'warn';
  }

  function mini(label, value, sub) {
    return '<div class="kpi"><span class="lbl">' + esc(label) + '</span>' +
      '<span class="v" style="font-size:1.15rem">' + value + '</span>' +
      '<span class="d">' + esc(sub || '') + '</span></div>';
  }

  // Média de gasto não parcelado do cartão nos últimos 3 ciclos.
  function estimateCardVariable(card) {
    const today = U.today();
    const from = U.addMonths(today, -3);
    const txs = d().transactions.filter(t =>
      t.cardId === card.id && t.status !== 'projected' &&
      t.amountCents < 0 && !t.installmentPlanId && t.date >= from);
    if (!txs.length) return 0;
    return Math.round(Math.abs(U.sum(txs, t => t.amountCents)) / 3);
  }

  UI.actions.cardtx = function (el) { UI.go('transacoes', { cardId: el.dataset.id }); };
  UI.actions.newcard = function () { editCard(null); };
  UI.actions.editcard = function (el) {
    editCard(d().cards.find(c => c.id === el.dataset.id));
  };

  function editCard(card) {
    const data = d();
    const isNew = !card;
    card = card || {
      id: U.uid(), institutionId: 'outro', name: '', masked: null, limitCents: null,
      closingDay: null, dueDay: null, paymentAccountId: null, status: 'active',
      color: '#7C8089', createdAt: new Date().toISOString()
    };
    UI.modal('<h2>' + (isNew ? 'Novo cartão' : 'Configurar cartão') + '</h2>' +
      '<div class="grid g2">' +
      '<label class="field">Nome<input type="text" id="cn" value="' + esc(card.name) + '" placeholder="Nubank Ultravioleta"></label>' +
      '<label class="field">Instituição<select id="ci">' +
      RULES.INSTITUTIONS.map(i => '<option value="' + i.id + '"' + (card.institutionId === i.id ? ' selected' : '') +
        '>' + esc(i.name) + '</option>').join('') + '</select></label>' +
      '<label class="field">Limite total<input type="text" id="cl" value="' +
      (card.limitCents ? (card.limitCents / 100).toFixed(2).replace('.', ',') : '') + '" placeholder="10.000,00"></label>' +
      '<label class="field">Últimos 4 dígitos<input type="text" id="cm" value="' + esc(card.masked || '') + '" maxlength="4"></label>' +
      '<label class="field">Dia de fechamento<input type="number" id="cc" min="1" max="28" value="' +
      (card.closingDay || '') + '"></label>' +
      '<label class="field">Dia de vencimento<input type="number" id="cd" min="1" max="28" value="' +
      (card.dueDay || '') + '"></label>' +
      '<label class="field">Conta que paga a fatura<select id="cp"><option value="">—</option>' +
      data.accounts.map(a => '<option value="' + a.id + '"' + (card.paymentAccountId === a.id ? ' selected' : '') +
        '>' + esc(a.name) + '</option>').join('') + '</select></label>' +
      '</div>' +
      '<div class="note" style="margin-top:.6rem">Com fechamento e vencimento preenchidos eu passo a calcular ' +
      'limite disponível, previsão de faturas e a data real de saída do dinheiro.</div>' +
      '<div class="modal-foot">' +
      (isNew ? '' : '<button class="btn danger" data-x="del">Excluir cartão</button>') +
      '<button class="btn" data-x="c">Cancelar</button>' +
      '<button class="btn primary" data-x="ok">Salvar</button></div>',
      {
        onMount(m) {
          m.querySelector('[data-x=c]').onclick = UI.closeModal;
          const del = m.querySelector('[data-x=del]');
          if (del) del.onclick = () => {
            UI.closeModal();
            UI.confirm('Excluir cartão?', 'Isto apaga o cartão e todos os lançamentos dele.', () => {
              data.transactions = data.transactions.filter(t => t.cardId !== card.id);
              data.cards = data.cards.filter(c => c.id !== card.id);
              data.installmentPlans = data.installmentPlans.filter(p => p.cardId !== card.id);
              DB.save(); UI.render();
            }, 'Excluir');
          };
          m.querySelector('[data-x=ok]').onclick = () => {
            card.name = m.querySelector('#cn').value.trim() || card.name || 'Cartão';
            card.institutionId = m.querySelector('#ci').value;
            card.color = RULES.institutionById(card.institutionId).color;
            const lim = U.parseMoney(m.querySelector('#cl').value);
            card.limitCents = lim ? Math.abs(lim) : null;
            card.masked = m.querySelector('#cm').value.trim() || null;
            card.closingDay = +m.querySelector('#cc').value || null;
            card.dueDay = +m.querySelector('#cd').value || null;
            card.paymentAccountId = m.querySelector('#cp').value || null;
            card.status = 'active';
            if (card.closingDay) { card.cycleLocked = true; card.cycleConfidence = 'alta'; }
            if (isNew) data.cards.push(card);
            ENGINE.recomputeCardCycles();
            ENGINE.linkTransfers();
            DB.save(); UI.closeModal(); UI.render();
          };
        }
      });
  }

  /* ════════════════════════ CALENDÁRIO ═════════════════════════ */

  V.calendario = function (root) {
    const today = U.today();
    const mk = UI.state.calMonth || U.monthKey(today);
    const fc = INSIGHTS.forecast(120);
    const events = INSIGHTS.knownEvents(150);

    // Lançamentos já realizados no mês, agrupados por dia.
    const realized = d().transactions.filter(t =>
      t.status !== 'projected' && !t.isTransfer &&
      U.monthKey(t.cashDate || t.date) === mk);

    const byDay = new Map();
    const add = (date, ev) => {
      if (!byDay.has(date)) byDay.set(date, []);
      byDay.get(date).push(ev);
    };
    events.filter(e => U.monthKey(e.date) === mk).forEach(e => add(e.date, {
      label: e.label, cents: e.amountCents, kind: e.kind, projected: true
    }));
    const grouped = U.groupBy(realized, t => t.cashDate || t.date);
    grouped.forEach((list, date) => {
      const total = U.sum(list, t => t.amountCents);
      const big = list.slice().sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents))[0];
      add(date, {
        label: list.length > 1 ? big.merchantName + ' +' + (list.length - 1) : (big.merchantName || 'lançamento'),
        cents: total, kind: total > 0 ? 'receita' : 'gasto', projected: false
      });
    });

    const balByDay = new Map(fc.points.map(p => [p.date, p.p50]));

    const first = mk + '-01';
    const firstDow = U.weekday(first);
    const days = U.daysInMonth(mk);
    const monthEvents = events.filter(e => U.monthKey(e.date) === mk);
    const inflow = U.sum(monthEvents.filter(e => e.amountCents > 0), e => e.amountCents) +
      U.sum(realized.filter(t => t.amountCents > 0), t => t.amountCents);
    const outflow = Math.abs(U.sum(monthEvents.filter(e => e.amountCents < 0), e => e.amountCents) +
      U.sum(realized.filter(t => t.amountCents < 0), t => t.amountCents));

    let html = head('Calendário', U.fmtMonth(mk, true) +
      ' · entradas ' + U.money(inflow) + ' · saídas ' + U.money(outflow),
      '<button class="btn sm" data-act="calprev">‹ anterior</button>' +
      '<button class="btn sm" data-act="calnext">próximo ›</button>');

    html += '<div class="card"><div class="cal">' +
      ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map(x => '<div class="dow">' + x + '</div>').join('');

    for (let i = 0; i < firstDow; i++) html += '<div class="day out"></div>';
    for (let day = 1; day <= days; day++) {
      const date = U.clampDay(+mk.split('-')[0], +mk.split('-')[1], day);
      const evs = (byDay.get(date) || []).sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
      const bal = balByDay.get(date);
      const risk = bal !== undefined && bal < 0;
      html += '<div class="day ' + (date === today ? 'today' : '') + ' ' + (risk ? 'risk' : '') + '">' +
        '<div class="dnum"><b>' + day + '</b>' + (date === today ? '<span>hoje</span>' : '') + '</div>' +
        evs.slice(0, 3).map(e => '<div class="ev" title="' + esc(e.label + ' · ' + U.money(e.cents)) + '">' +
          '<i style="background:' + evColor(e) + '"></i>' +
          '<span style="overflow:hidden;text-overflow:ellipsis">' + esc(shortLabel(e.label)) + '</span></div>').join('') +
        (evs.length > 3 ? '<div class="ev muted">+' + (evs.length - 3) + '</div>' : '') +
        (bal !== undefined ? '<div class="bal ' + (risk ? 'neg' : '') + '">' + U.moneyShort(bal) + '</div>' : '') +
        '</div>';
    }
    const trailing = (7 - ((firstDow + days) % 7)) % 7;
    for (let i = 0; i < trailing; i++) html += '<div class="day out"></div>';
    html += '</div>' +
      '<div class="chart-legend" style="margin-top:.5rem">' +
      '<span><i style="background:var(--pos)"></i>Entrada</span>' +
      '<span><i style="background:var(--neg)"></i>Saída</span>' +
      '<span><i style="background:var(--brass)"></i>Fatura de cartão</span>' +
      '<span><i style="background:var(--warn)"></i>Parcela</span>' +
      '<span class="muted">o número no rodapé de cada dia é o saldo projetado</span></div></div>';

    // Recorrências detectadas
    const recs = (d().recurrences || []).slice().sort((a, b) => a.nextExpected.localeCompare(b.nextExpected));
    html += '<div class="card"><h3>Contas e assinaturas detectadas automaticamente</h3>' +
      (recs.length ? '<div class="scrollx"><table class="tbl"><thead><tr>' +
        '<th>O quê</th><th>Categoria</th><th>Frequência</th><th class="n">Valor típico</th>' +
        '<th>Próxima</th><th>Situação</th><th></th></tr></thead><tbody>' +
        recs.map(r => '<tr><td><b>' + esc(r.merchantName) + '</b>' +
          (r.fixed ? ' <span class="pill">fixo</span>' : '') + '</td>' +
          '<td class="muted">' + esc(ENGINE.categoryLabel(r.categoryId)) + '</td>' +
          '<td>' + r.cadence + '</td>' +
          '<td class="n ' + (r.expectedCents < 0 ? 'neg' : 'pos') + '">' + U.money(r.expectedCents) + '</td>' +
          '<td>' + U.fmtDate(r.nextExpected) + '</td>' +
          '<td><span class="pill ' + (r.state === 'active' ? 'pos' : '') + '">' +
          (r.state === 'active' ? 'ativa' : 'pausada') + '</span></td>' +
          '<td><button class="btn sm" data-act="togglerec" data-id="' + esc(r.id) + '">' +
          (r.state === 'active' ? 'pausar' : 'reativar') + '</button></td></tr>').join('') +
        '</tbody></table></div>'
        : '<div class="empty-chart">Ainda não há repetições suficientes para detectar recorrências. ' +
        'Com 3 meses de extrato eu identifico contas fixas, assinaturas e salário sozinho.</div>') +
      '</div>';

    root.innerHTML = html;
  };

  function evColor(e) {
    if (e.kind === 'fatura') return 'var(--brass)';
    if (e.kind === 'parcela') return 'var(--warn)';
    return e.cents > 0 ? 'var(--pos)' : 'var(--neg)';
  }
  function shortLabel(s) {
    s = String(s || '');
    return s.length > 16 ? s.slice(0, 15) + '…' : s;
  }

  UI.actions.calprev = function () {
    UI.state.calMonth = U.monthKey(U.addMonths((UI.state.calMonth || U.monthKey(U.today())) + '-01', -1));
    UI.render();
  };
  UI.actions.calnext = function () {
    UI.state.calMonth = U.monthKey(U.addMonths((UI.state.calMonth || U.monthKey(U.today())) + '-01', 1));
    UI.render();
  };
  UI.actions.togglerec = function (el) {
    const r = (d().recurrences || []).find(x => x.id === el.dataset.id);
    if (!r) return;
    r.state = r.state === 'active' ? 'paused' : 'active';
    DB.save(); UI.render();
  };

  /* ════════════════════════ METAS ══════════════════════════════ */

  const GOAL_TYPES = {
    spend_cap: 'Teto de gasto por categoria',
    monthly_savings: 'Economia mensal',
    emergency_fund: 'Reserva de emergência',
    net_worth: 'Patrimônio líquido',
    investment: 'Aportes em investimento',
    debt_payoff: 'Quitação de dívida'
  };

  V.metas = function (root) {
    const data = d();
    const today = U.today();
    const mk = U.monthKey(today);

    let html = head('Metas e orçamentos', 'O progresso se atualiza sozinho a cada importação.',
      '<button class="btn" data-act="suggestbudget">Sugerir orçamento</button>' +
      '<button class="btn primary" data-act="newgoal">＋ Nova meta</button>');

    if (!data.goals.length) {
      html += '<div class="empty"><b>Nenhuma meta definida</b>' +
        '<span>Metas úteis para começar: reserva de emergência de 6 meses, teto mensal ' +
        'para a categoria que mais pesa, e uma taxa de poupança.</span>' +
        '<button class="btn primary" data-act="newgoal">＋ Criar primeira meta</button></div>';
    } else {
      html += '<div class="grid g2">' + data.goals.map(g => goalCard(g)).join('') + '</div>';
    }

    // Orçamento por categoria no mês
    const budgets = (data.budgets || []).filter(b => b.month === mk || b.month === 'todos');
    const cats = INSIGHTS.categoryBreakdown(mk + '-01', U.endOfMonth(mk));
    html += '<div class="card"><h3>Orçamento de ' + U.fmtMonth(mk, true) + '</h3>' +
      (budgets.length ? '<div class="stack">' + budgets.map(b => {
        const spent = (cats.find(c => c.id === b.categoryId) || { cents: 0 }).cents;
        const pct = b.limitCents ? spent / b.limitCents : 0;
        const dayPct = (+today.split('-')[2]) / U.daysInMonth(mk);
        const projected = dayPct > 0 ? spent / dayPct : spent;
        const cat = ENGINE.category(b.categoryId);
        return '<div class="catbar"><span class="catbar-head">' +
          '<span class="catbar-name"><i style="background:' + ENGINE.categoryColor(b.categoryId) + '"></i>' +
          esc(cat ? cat.name : b.categoryId) + '</span>' +
          '<span class="catbar-val">' + U.money(spent) + ' / ' + U.money(b.limitCents) + '</span></span>' +
          '<span class="catbar-track"><i style="width:' + Math.min(100, pct * 100).toFixed(0) +
          '%;background:' + (pct > 1 ? 'var(--neg)' : pct > 0.85 ? 'var(--warn)' : 'var(--pos)') + '"></i></span>' +
          '<span class="catbar-sub">' +
          (pct > 1 ? 'estourou em ' + U.money(spent - b.limitCents)
            : 'no ritmo atual fecha em ' + U.money(projected) +
            (projected > b.limitCents ? ' — <b class="neg">acima do limite</b>' : ' — dentro do limite')) +
          ' <button class="btn sm ghost" data-act="delbudget" data-id="' + b.categoryId + '">remover</button></span></div>';
      }).join('') + '</div>'
        : '<div class="empty-chart">Nenhum limite definido. Clique em <b>Sugerir orçamento</b> e eu proponho ' +
        'valores baseados na sua própria mediana dos últimos meses.</div>') +
      '</div>';

    root.innerHTML = html;
  };

  function goalProgress(g) {
    const today = U.today();
    const mk = U.monthKey(today);
    let current = 0, note = '';

    if (g.type === 'emergency_fund') {
      current = U.sum(d().accounts.filter(a => (g.accountIds || []).includes(a.id)),
        a => ENGINE.accountBalance(a.id));
      if (!(g.accountIds || []).length) {
        current = U.sum(d().accounts.filter(a => a.type === 'savings'), a => ENGINE.accountBalance(a.id));
      }
      const months = [];
      for (let i = 1; i <= 6; i++) months.push(ENGINE.monthTotals(U.monthKey(U.addMonths(today, -i))).expense);
      const custo = U.median(months.filter(x => x > 0));
      if (custo) note = (current / custo).toFixed(1) + ' meses de despesa cobertos';
    } else if (g.type === 'net_worth') {
      current = ENGINE.netWorth().net;
    } else if (g.type === 'monthly_savings') {
      current = ENGINE.monthTotals(mk).net;
    } else if (g.type === 'spend_cap') {
      const cats = INSIGHTS.categoryBreakdown(mk + '-01', U.endOfMonth(mk));
      current = (cats.find(c => c.id === g.categoryId) || { cents: 0 }).cents;
    } else if (g.type === 'investment') {
      const from = U.monthKey(today) + '-01';
      current = Math.abs(U.sum(d().transactions.filter(t =>
        t.date >= from && ENGINE.categoryKind(t.categoryId) === 'investment' && t.amountCents < 0),
        t => t.amountCents));
    } else if (g.type === 'debt_payoff') {
      const rest = U.sum(d().installmentPlans, p => ENGINE.planRemaining(p));
      current = Math.max(0, (g.targetCents || 0) - rest);
      note = U.money(rest) + ' ainda a pagar em parcelas';
    }

    const pct = g.targetCents ? current / g.targetCents : 0;
    // Projeção: ritmo dos últimos 6 meses
    let eta = null;
    if (['emergency_fund', 'net_worth', 'investment'].includes(g.type) && g.targetCents > current) {
      const series = INSIGHTS.monthlySeries(6).map(s => s.net).filter(x => x > 0);
      const rate = series.length ? U.mean(series) : 0;
      if (rate > 0) {
        const months = Math.ceil((g.targetCents - current) / rate);
        if (months < 600) eta = U.addMonths(U.today(), months);
      }
    }
    return { current, pct, note, eta };
  }

  function goalCard(g) {
    const p = goalProgress(g);
    const inverse = g.type === 'spend_cap';
    const bad = inverse ? p.pct > 1 : false;
    const status = inverse
      ? (p.pct > 1 ? '<span class="pill neg">estourou</span>'
        : p.pct > 0.85 ? '<span class="pill warn">no limite</span>' : '<span class="pill pos">dentro</span>')
      : (p.pct >= 1 ? '<span class="pill pos">concluída</span>' : '<span class="pill">em andamento</span>');

    return '<div class="goal"><div class="gh"><b>' + esc(g.name) + '</b>' + status + '</div>' +
      '<div class="gv">' + U.money(p.current) + ' <span class="muted" style="font-size:.72rem">de ' +
      U.money(g.targetCents) + '</span></div>' +
      '<span class="prog"><i style="width:' + Math.min(100, p.pct * 100).toFixed(1) + '%;background:' +
      (bad ? 'var(--neg)' : p.pct >= 1 ? 'var(--pos)' : 'var(--brass)') + '"></i></span>' +
      '<div class="muted" style="font-size:.78rem">' + U.pct(p.pct, 0) + ' · ' + esc(GOAL_TYPES[g.type] || '') +
      (p.note ? ' · ' + esc(p.note) : '') +
      (p.eta ? ' · previsão de conclusão em <b>' + U.fmtMonth(U.monthKey(p.eta), true) + '</b>' : '') +
      (g.targetDate ? ' · prazo ' + U.fmtDate(g.targetDate) : '') + '</div>' +
      '<div class="row"><button class="btn sm" data-act="editgoal" data-id="' + g.id + '">Editar</button>' +
      '<button class="btn sm danger" data-act="delgoal" data-id="' + g.id + '">Remover</button></div></div>';
  }

  UI.actions.newgoal = function () { editGoal(null); };
  UI.actions.editgoal = function (el) { editGoal(d().goals.find(g => g.id === el.dataset.id)); };
  UI.actions.delgoal = function (el) {
    d().goals = d().goals.filter(g => g.id !== el.dataset.id);
    DB.save(); UI.render();
  };

  function editGoal(goal) {
    const isNew = !goal;
    goal = goal || { id: U.uid(), type: 'emergency_fund', name: '', targetCents: 0, targetDate: '', categoryId: '' };
    UI.modal('<h2>' + (isNew ? 'Nova meta' : 'Editar meta') + '</h2>' +
      '<div class="grid g2">' +
      '<label class="field">Tipo<select id="gt">' +
      Object.keys(GOAL_TYPES).map(k => '<option value="' + k + '"' + (goal.type === k ? ' selected' : '') +
        '>' + GOAL_TYPES[k] + '</option>').join('') + '</select></label>' +
      '<label class="field">Nome<input type="text" id="gn" value="' + esc(goal.name) + '" placeholder="Reserva de emergência"></label>' +
      '<label class="field">Valor-alvo<input type="text" id="gv" value="' +
      (goal.targetCents ? (goal.targetCents / 100).toFixed(2).replace('.', ',') : '') + '" placeholder="60.000,00"></label>' +
      '<label class="field">Prazo (opcional)<input type="date" id="gd" value="' + esc(goal.targetDate || '') + '"></label>' +
      '<label class="field" id="gcatWrap">Categoria (para teto de gasto)<select id="gc"><option value="">—</option>' +
      d().categories.filter(c => !c.parentId).map(c => '<option value="' + c.id + '"' +
        (goal.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
      '</select></label>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn" data-x="c">Cancelar</button>' +
      '<button class="btn primary" data-x="ok">Salvar</button></div>',
      {
        onMount(m) {
          m.querySelector('[data-x=c]').onclick = UI.closeModal;
          m.querySelector('[data-x=ok]').onclick = () => {
            goal.type = m.querySelector('#gt').value;
            goal.name = m.querySelector('#gn').value.trim() || GOAL_TYPES[goal.type];
            goal.targetCents = Math.abs(U.parseMoney(m.querySelector('#gv').value) || 0);
            goal.targetDate = m.querySelector('#gd').value || '';
            goal.categoryId = m.querySelector('#gc').value || '';
            if (isNew) d().goals.push(goal);
            DB.save(); UI.closeModal(); UI.render();
          };
        }
      });
  }

  UI.actions.suggestbudget = function () {
    const today = U.today();
    const months = [];
    for (let i = 1; i <= 6; i++) months.push(U.monthKey(U.addMonths(today, -i)));
    const perCat = new Map();
    months.forEach(mk => {
      INSIGHTS.categoryBreakdown(mk + '-01', U.endOfMonth(mk)).forEach(c => {
        if (!perCat.has(c.id)) perCat.set(c.id, []);
        perCat.get(c.id).push(c.cents);
      });
    });
    const props = Array.from(perCat.entries())
      .map(([id, vals]) => ({ id, name: (ENGINE.category(id) || {}).name || id, limit: U.median(vals) }))
      .filter(p => p.limit > 5000)
      .sort((a, b) => b.limit - a.limit);

    if (!props.length) {
      return UI.toast('Ainda não há histórico suficiente. Importe pelo menos dois meses.', 'bad');
    }
    UI.modal('<h2>Orçamento sugerido</h2>' +
      '<p class="muted" style="font-size:.86rem">Baseado na <b>mediana</b> dos seus últimos 6 meses — não na média, ' +
      'que um mês atípico distorce. Ajuste o que quiser antes de salvar.</p>' +
      '<div class="stack" style="max-height:50vh;overflow-y:auto">' +
      props.map(p => '<label class="row" style="justify-content:space-between">' +
        '<span><input type="checkbox" data-b="' + p.id + '" checked> ' + esc(p.name) + '</span>' +
        '<input type="text" data-bv="' + p.id + '" value="' + (p.limit / 100).toFixed(2).replace('.', ',') +
        '" style="width:9rem;text-align:right"></label>').join('') +
      '</div><div class="modal-foot"><button class="btn" data-x="c">Cancelar</button>' +
      '<button class="btn primary" data-x="ok">Salvar orçamento</button></div>',
      {
        wide: true,
        onMount(m) {
          m.querySelector('[data-x=c]').onclick = UI.closeModal;
          m.querySelector('[data-x=ok]').onclick = () => {
            const mk = U.monthKey(U.today());
            d().budgets = (d().budgets || []).filter(b => b.month !== 'todos');
            m.querySelectorAll('[data-b]').forEach(cb => {
              if (!cb.checked) return;
              const id = cb.dataset.b;
              const v = U.parseMoney(m.querySelector('[data-bv="' + id + '"]').value);
              if (!v) return;
              d().budgets.push({ month: 'todos', categoryId: id, limitCents: Math.abs(v) });
            });
            DB.save(); UI.closeModal(); UI.render();
            UI.toast('Orçamento salvo. Ele vale para todos os meses até você mudar.', 'good');
          };
        }
      });
  };
  UI.actions.delbudget = function (el) {
    d().budgets = (d().budgets || []).filter(b => b.categoryId !== el.dataset.id);
    DB.save(); UI.render();
  };

  /* ════════════════════ INVESTIMENTOS ══════════════════════════ */

  const ASSET_CLASSES = {
    'renda-fixa': 'Renda fixa', 'acoes': 'Ações', 'fii': 'FIIs', 'etf': 'ETFs',
    'fundos': 'Fundos', 'previdencia': 'Previdência', 'cripto': 'Criptomoedas', 'exterior': 'Exterior'
  };

  V.investimentos = function (root) {
    const data = d();
    const pos = data.investPositions || [];
    const totalAtual = U.sum(pos, p => p.currentCents || 0);
    const totalAporte = U.sum(pos, p => p.investedCents || 0);
    const lucro = totalAtual - totalAporte;
    const rent = totalAporte ? lucro / totalAporte : 0;

    // Aportes detectados nos extratos (categoria Investimentos)
    const aportesDetectados = data.transactions.filter(t =>
      t.status !== 'projected' && ENGINE.categoryKind(t.categoryId) === 'investment' && t.amountCents < 0);
    const proventos = data.transactions.filter(t =>
      t.status !== 'projected' && ENGINE.categoryParent(t.categoryId) &&
      ENGINE.categoryParent(t.categoryId).id === 'dividendos');

    let html = head('Investimentos',
      'Lançamentos de aporte e provento vêm dos seus extratos; a posição atual você atualiza quando quiser.',
      '<button class="btn primary" data-act="newpos">＋ Adicionar posição</button>');

    html += '<div class="grid g4">' +
      mini('Patrimônio investido', U.money(totalAtual), pos.length + ' posições') +
      mini('Total aportado', U.money(totalAporte), aportesDetectados.length + ' aportes nos extratos') +
      mini('Resultado', U.money(lucro), lucro >= 0 ? 'ganho acumulado' : 'perda acumulada') +
      mini('Rentabilidade', totalAporte ? U.pct(rent, 1) : '—', 'sobre o valor aportado') +
      '</div>';

    if (pos.length) {
      const byClass = U.groupBy(pos, p => p.assetClass);
      const alloc = Array.from(byClass.entries()).map(([k, list]) => ({
        id: k, name: ASSET_CLASSES[k] || k,
        cents: U.sum(list, p => p.currentCents || 0),
        count: list.length,
        color: classColor(k)
      })).sort((a, b) => b.cents - a.cents);

      html += '<div class="grid g2">' +
        '<div class="card"><h3>Alocação</h3>' + CHARTS.categoryBars(alloc, { limit: 8 }) + '</div>' +
        '<div class="card"><h3>Proventos recebidos</h3>' +
        (proventos.length
          ? '<div class="gv num" style="font-size:1.3rem">' +
          U.money(U.sum(proventos, t => t.amountCents)) + '</div>' +
          '<div class="muted" style="font-size:.8rem">' + proventos.length +
          ' créditos identificados nos extratos (dividendos, JCP, rendimentos de FII e juros).</div>' +
          proventos.slice(-6).reverse().map(t => '<div class="impline"><span>' +
            U.fmtDate(t.date, 'medium') + ' · ' + esc(t.merchantName || '') + '</span>' +
            '<span class="num pos">' + U.money(t.amountCents) + '</span></div>').join('')
          : '<div class="empty-chart">Nenhum provento identificado ainda.</div>') +
        '</div></div>';

      html += '<div class="card"><h3>Posições</h3><div class="scrollx"><table class="tbl"><thead><tr>' +
        '<th>Ativo</th><th>Classe</th><th class="n">Aportado</th><th class="n">Valor atual</th>' +
        '<th class="n">Resultado</th><th class="n">%</th><th>Atualizado</th><th></th></tr></thead><tbody>' +
        pos.map(p => {
          const res = (p.currentCents || 0) - (p.investedCents || 0);
          const r = p.investedCents ? res / p.investedCents : 0;
          return '<tr><td><b>' + esc(p.name) + '</b></td>' +
            '<td class="muted">' + esc(ASSET_CLASSES[p.assetClass] || p.assetClass) + '</td>' +
            '<td class="n">' + U.money(p.investedCents) + '</td>' +
            '<td class="n">' + U.money(p.currentCents) + '</td>' +
            '<td class="n ' + (res >= 0 ? 'pos' : 'neg') + '">' + U.money(res, { signed: true }) + '</td>' +
            '<td class="n ' + (res >= 0 ? 'pos' : 'neg') + '">' + U.pct(r, 1) + '</td>' +
            '<td class="muted">' + U.fmtDate(p.updatedAt || p.createdAt, 'medium') + '</td>' +
            '<td><button class="btn sm" data-act="editpos" data-id="' + p.id + '">editar</button></td></tr>';
        }).join('') + '</tbody></table></div></div>';
    } else {
      html += '<div class="empty"><b>Nenhuma posição cadastrada</b>' +
        '<span>Adicione o que você tem hoje (CDB, ações, FIIs, previdência, cripto) com o valor aportado ' +
        'e o valor atual. Os aportes e proventos que passam pela sua conta já são reconhecidos ' +
        'automaticamente nos extratos.</span>' +
        '<button class="btn primary" data-act="newpos">＋ Adicionar posição</button></div>';
    }

    if (aportesDetectados.length) {
      const porMes = U.groupBy(aportesDetectados, t => U.monthKey(t.date));
      const serie = Array.from(porMes.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
      html += '<div class="card"><h3>Aportes identificados nos extratos</h3>' +
        '<div class="stack">' + serie.reverse().map(([mk, list]) =>
          '<div class="impline"><span>' + U.fmtMonth(mk, true) + ' · ' + list.length + ' aporte(s)</span>' +
          '<span class="num">' + U.money(Math.abs(U.sum(list, t => t.amountCents))) + '</span></div>').join('') +
        '</div></div>';
    }

    root.innerHTML = html;
  };

  function classColor(k) {
    return ({
      'renda-fixa': '#A87B2E', 'acoes': '#3F6C8C', 'fii': '#4E7C59', 'etf': '#6B5B95',
      'fundos': '#8C5B6E', 'previdencia': '#7C6A46', 'cripto': '#B07500', 'exterior': '#5F7A8C'
    })[k] || '#94908A';
  }

  UI.actions.newpos = function () { editPos(null); };
  UI.actions.editpos = function (el) {
    editPos((d().investPositions || []).find(p => p.id === el.dataset.id));
  };

  function editPos(pos) {
    const isNew = !pos;
    pos = pos || { id: U.uid(), name: '', assetClass: 'renda-fixa', investedCents: 0, currentCents: 0, createdAt: new Date().toISOString() };
    UI.modal('<h2>' + (isNew ? 'Nova posição' : 'Editar posição') + '</h2>' +
      '<div class="grid g2">' +
      '<label class="field">Nome do ativo<input type="text" id="pn" value="' + esc(pos.name) +
      '" placeholder="CDB Banco X 110% CDI"></label>' +
      '<label class="field">Classe<select id="pc">' +
      Object.keys(ASSET_CLASSES).map(k => '<option value="' + k + '"' + (pos.assetClass === k ? ' selected' : '') +
        '>' + ASSET_CLASSES[k] + '</option>').join('') + '</select></label>' +
      '<label class="field">Valor aportado<input type="text" id="pi" value="' +
      (pos.investedCents ? (pos.investedCents / 100).toFixed(2).replace('.', ',') : '') + '"></label>' +
      '<label class="field">Valor atual<input type="text" id="pv" value="' +
      (pos.currentCents ? (pos.currentCents / 100).toFixed(2).replace('.', ',') : '') + '"></label>' +
      '</div>' +
      '<div class="note" style="margin-top:.6rem">Sem conexão com a bolsa nesta versão local, o valor atual é ' +
      'informado por você. Atualize uma vez por mês e a evolução do patrimônio fica correta.</div>' +
      '<div class="modal-foot">' +
      (isNew ? '' : '<button class="btn danger" data-x="del">Excluir</button>') +
      '<button class="btn" data-x="c">Cancelar</button>' +
      '<button class="btn primary" data-x="ok">Salvar</button></div>',
      {
        onMount(m) {
          m.querySelector('[data-x=c]').onclick = UI.closeModal;
          const del = m.querySelector('[data-x=del]');
          if (del) del.onclick = () => {
            d().investPositions = (d().investPositions || []).filter(p => p.id !== pos.id);
            DB.save(); UI.closeModal(); UI.render();
          };
          m.querySelector('[data-x=ok]').onclick = () => {
            pos.name = m.querySelector('#pn').value.trim() || 'Posição';
            pos.assetClass = m.querySelector('#pc').value;
            pos.investedCents = Math.abs(U.parseMoney(m.querySelector('#pi').value) || 0);
            pos.currentCents = Math.abs(U.parseMoney(m.querySelector('#pv').value) || 0);
            pos.updatedAt = U.today();
            d().investPositions = d().investPositions || [];
            if (isNew) d().investPositions.push(pos);
            DB.save(); UI.closeModal(); UI.render();
          };
        }
      });
  }

  /* ════════════════════════ RELATÓRIOS ═════════════════════════ */

  V.relatorios = function (root) {
    const today = U.today();
    const mk = UI.state.reportMonth || U.monthKey(today);
    const year = mk.slice(0, 4);
    const mt = ENGINE.monthTotals(mk);
    const cats = INSIGHTS.categoryBreakdown(mk + '-01', U.endOfMonth(mk));
    const inc = INSIGHTS.categoryBreakdown(mk + '-01', U.endOfMonth(mk), { income: true });
    const series = INSIGHTS.monthlySeries(12);
    const nw = ENGINE.netWorth();
    const mix = INSIGHTS.recurringVsVariable(mk + '-01', U.endOfMonth(mk));
    const tops = INSIGHTS.topMerchants(mk + '-01', U.endOfMonth(mk), 10);

    const anoTx = ENGINE.movementsIn(year + '-01-01', year + '-12-31');
    const anoRec = U.sum(anoTx.filter(t => t.amountCents > 0 && ENGINE.categoryKind(t.categoryId) === 'income'), t => t.amountCents);
    const anoDesp = Math.abs(U.sum(anoTx.filter(t => t.amountCents < 0), t => t.amountCents));

    let html = head('Relatórios', U.fmtMonth(mk, true),
      '<button class="btn" data-act="printreport">Imprimir / PDF</button>' +
      '<button class="btn" data-act="exportxlsx">↓ Excel</button>');

    html += '<div class="row"><label class="field" style="max-width:14rem">Mês' +
      '<select id="rm">' + U.monthsRange(U.monthKey(U.addMonths(today, -35)), U.monthKey(today))
        .reverse().map(m => '<option value="' + m + '"' + (m === mk ? ' selected' : '') + '>' +
          U.fmtMonth(m, true) + '</option>').join('') + '</select></label></div>';

    html += '<div class="grid g4">' +
      mini('Receitas do mês', U.money(mt.income), '') +
      mini('Despesas do mês', U.money(mt.expense), '') +
      mini('Resultado', U.money(mt.net), mt.income ? U.pct(mt.net / mt.income, 0) + ' da renda' : '') +
      mini('Patrimônio líquido', U.money(nw.net), 'hoje') +
      '</div>';

    html += '<div class="grid g2">' +
      '<div class="card"><h3>Despesas por categoria</h3>' + CHARTS.categoryBars(cats, { limit: 15 }) + '</div>' +
      '<div class="card"><h3>Receitas por categoria</h3>' +
      (inc.length ? CHARTS.categoryBars(inc, { limit: 8 }) : '<div class="empty-chart">Sem receitas no mês.</div>') +
      '<h3 style="margin-top:.8rem">Composição das saídas</h3>' +
      '<div class="muted" style="font-size:.8rem">Recorrente ' + U.money(mix.recorrente) +
      ' · parcelado ' + U.money(mix.parcelado) + ' · variável ' + U.money(mix.variavel) + '</div>' +
      '</div></div>';

    html += '<div class="card"><h3>Evolução de 12 meses</h3>' + CHARTS.monthlyBars(series) +
      '<div class="scrollx"><table class="tbl"><thead><tr><th>Mês</th><th class="n">Receitas</th>' +
      '<th class="n">Despesas</th><th class="n">Resultado</th><th class="n">Taxa de poupança</th></tr></thead><tbody>' +
      series.slice().reverse().map(s => '<tr><td>' + U.fmtMonth(s.month, true) + '</td>' +
        '<td class="n pos">' + U.money(s.income) + '</td>' +
        '<td class="n neg">' + U.money(s.expense) + '</td>' +
        '<td class="n ' + (s.net >= 0 ? 'pos' : 'neg') + '">' + U.money(s.net) + '</td>' +
        '<td class="n">' + (s.income ? U.pct(s.net / s.income, 0) : '—') + '</td></tr>').join('') +
      '<tr style="font-weight:600"><td>Total ' + year + '</td>' +
      '<td class="n pos">' + U.money(anoRec) + '</td>' +
      '<td class="n neg">' + U.money(anoDesp) + '</td>' +
      '<td class="n">' + U.money(anoRec - anoDesp) + '</td>' +
      '<td class="n">' + (anoRec ? U.pct((anoRec - anoDesp) / anoRec, 0) : '—') + '</td></tr>' +
      '</tbody></table></div></div>';

    html += '<div class="card"><h3>Maiores gastos do mês</h3><div class="scrollx"><table class="tbl">' +
      '<thead><tr><th>Estabelecimento</th><th>Categoria</th><th class="n">Vezes</th><th class="n">Total</th></tr></thead><tbody>' +
      tops.map(m => '<tr><td><b>' + esc(m.name) + '</b></td>' +
        '<td class="muted">' + esc(ENGINE.categoryLabel(m.categoryId)) + '</td>' +
        '<td class="n">' + m.count + '</td><td class="n neg">' + U.money(m.cents) + '</td></tr>').join('') +
      '</tbody></table></div></div>';

    root.innerHTML = html;
    const sel = root.querySelector('#rm');
    if (sel) sel.onchange = () => { UI.state.reportMonth = sel.value; UI.render(); };
  };

  UI.actions.printreport = function () { window.print(); };

  UI.actions.exportxlsx = function () {
    const data = d();
    const today = U.today();
    const mk = UI.state.reportMonth || U.monthKey(today);

    const lanc = [['Data', 'Data de caixa', 'Estabelecimento', 'Descritor original', 'Categoria mãe',
      'Subcategoria', 'Valor', 'Conta/Cartão', 'Parcela', 'Transferência', 'Etiquetas']];
    data.transactions.filter(t => t.status !== 'projected')
      .sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
        const owner = t.cardId ? (data.cards.find(c => c.id === t.cardId) || {}).name
          : (data.accounts.find(a => a.id === t.accountId) || {}).name;
        const parent = ENGINE.categoryParent(t.categoryId);
        const cat = ENGINE.category(t.categoryId);
        lanc.push([U.fmtDate(t.date), U.fmtDate(t.cashDate || t.date),
        t.merchantName || '', t.descriptorRaw || '',
        parent ? parent.name : '', cat && cat.parentId ? cat.name : '',
        t.amountCents / 100, owner || '',
        t.installmentTotal ? t.installmentNo + '/' + t.installmentTotal : '',
        t.isTransfer ? 'sim' : 'não', (t.tags || []).join(' ')]);
      });

    const resumo = [['Mês', 'Receitas', 'Despesas', 'Resultado', 'Taxa de poupança']];
    INSIGHTS.monthlySeries(24).forEach(s => {
      resumo.push([U.fmtMonth(s.month, true), s.income / 100, s.expense / 100, s.net / 100,
      s.income ? +(s.net / s.income).toFixed(4) : '']);
    });

    const porCat = [['Categoria', 'Total do mês', 'Lançamentos']];
    INSIGHTS.categoryBreakdown(mk + '-01', U.endOfMonth(mk)).forEach(c => {
      porCat.push([c.name, c.cents / 100, c.count]);
    });

    const contas = [['Conta', 'Instituição', 'Tipo', 'Saldo atual']];
    data.accounts.forEach(a => contas.push([a.name, RULES.institutionById(a.institutionId).name,
      a.type, ENGINE.accountBalance(a.id) / 100]));
    data.cards.forEach(c => {
      const s = ENGINE.cardSummary(c);
      contas.push([c.name, RULES.institutionById(c.institutionId).name, 'cartão de crédito',
        -(s.openCents + s.unpaidCents) / 100]);
    });

    const parcelas = [['Estabelecimento', 'Parcela', 'Total de parcelas', 'Valor da parcela', 'Falta pagar', 'Termina em']];
    data.installmentPlans.forEach(p => {
      const rest = ENGINE.planRemaining(p);
      if (rest <= 0) return;
      parcelas.push([p.merchantName || p.merchantKey, ENGINE.planPaidCount(p), p.total,
      p.installmentCents / 100, rest / 100, U.fmtDate(U.addMonths(p.firstDate, p.total - 1))]);
    });

    const blob = XLSXOUT.build([
      { name: 'Resumo mensal', rows: resumo },
      { name: 'Categorias ' + mk, rows: porCat },
      { name: 'Contas e cartoes', rows: contas },
      { name: 'Parcelamentos', rows: parcelas },
      { name: 'Lancamentos', rows: lanc }
    ]);
    U.download('relatorio-financeiro-' + today + '.xlsx', blob);
    UI.toast('Planilha gerada com 5 abas.', 'good');
  };

  /* ════════════════════════ AJUSTES ════════════════════════════ */

  V.ajustes = function (root) {
    const data = d();
    const info = DB.sizeInfo();

    let html = head('Ajustes', 'Contas, regras, categorias e backup.');

    html += '<div class="card"><h3>Geral</h3><div class="grid g2">' +
      '<label class="field">Nome do painel<input type="text" id="sh" value="' + esc(data.settings.household || '') + '"></label>' +
      '<label class="field">Tema<select id="st">' +
      [['auto', 'Automático (segue o sistema)'], ['light', 'Claro'], ['dark', 'Escuro']]
        .map(([v, l]) => '<option value="' + v + '"' + (data.settings.theme === v ? ' selected' : '') + '>' + l + '</option>').join('') +
      '</select></label>' +
      '<label class="field">Limite para pedir revisão (0 a 1)<input type="number" id="srt" step="0.01" min="0" max="1" value="' +
      (data.settings.reviewThreshold || 0.62) + '"></label>' +
      '</div>' +
      '<div class="muted" style="font-size:.78rem">Quanto maior o limite, mais itens vão para a fila de revisão ' +
      'e mais rápido o sistema aprende o seu jeito. 0,62 é um bom equilíbrio.</div></div>';

    html += '<div class="card"><h3>Contas</h3>' +
      (data.accounts.length ? '<div class="scrollx"><table class="tbl"><thead><tr>' +
        '<th>Nome</th><th>Instituição</th><th>Tipo</th><th class="n">Saldo</th><th>No patrimônio</th><th></th></tr></thead><tbody>' +
        data.accounts.map(a => '<tr><td><b>' + esc(a.name) + '</b>' +
          (a.status === 'provisional' ? ' <span class="pill warn">a confirmar</span>' : '') + '</td>' +
          '<td class="muted">' + esc(RULES.institutionById(a.institutionId).name) + '</td>' +
          '<td class="muted">' + a.type + '</td>' +
          '<td class="n">' + U.money(ENGINE.accountBalance(a.id)) + '</td>' +
          '<td><input type="checkbox" data-nwacct="' + a.id + '"' + (a.includeInNetWorth !== false ? ' checked' : '') + '></td>' +
          '<td><button class="btn sm" data-act="renameacct" data-id="' + a.id + '">renomear</button> ' +
          '<button class="btn sm danger" data-act="delacct" data-id="' + a.id + '">excluir</button></td></tr>').join('') +
        '</tbody></table></div>'
        : '<div class="empty-chart">Nenhuma conta ainda.</div>') + '</div>';

    html += '<div class="card"><h3>Regras de categorização</h3>' +
      '<div class="muted" style="font-size:.8rem">Criadas automaticamente quando você corrige algo na fila de revisão. ' +
      'Elas têm prioridade sobre qualquer inferência.</div>' +
      (data.rules.length ? '<div class="scrollx"><table class="tbl"><thead><tr>' +
        '<th>Quando</th><th>Categoria</th><th class="n">Afeta</th><th></th></tr></thead><tbody>' +
        data.rules.map(r => '<tr><td>' + esc(ruleText(r)) + '</td>' +
          '<td>' + esc(ENGINE.categoryLabel(r.categoryId)) + '</td>' +
          '<td class="n">' + ENGINE.previewRule(r) + '</td>' +
          '<td><button class="btn sm" data-act="applyrule" data-id="' + r.id + '">aplicar agora</button> ' +
          '<button class="btn sm danger" data-act="delrule" data-id="' + r.id + '">excluir</button></td></tr>').join('') +
        '</tbody></table></div>'
        : '<div class="empty-chart">Nenhuma regra ainda.</div>') +
      '<div class="row"><button class="btn" data-act="newrule">＋ Criar regra manualmente</button>' +
      '<button class="btn" data-act="reclassify">Reprocessar categorização de tudo</button></div></div>';

    html += '<div class="card"><h3>Categorias</h3>' +
      '<div class="muted" style="font-size:.8rem">As 15 categorias-mãe são fixas para manter os relatórios comparáveis. ' +
      'As subcategorias você cria à vontade.</div>' +
      '<div class="row">' + data.categories.filter(c => !c.parentId).map(c =>
        '<button class="pill cat" data-act="addsub" data-id="' + c.id + '">' +
        '<span class="dotcat" style="background:' + c.color + '"></span>' + esc(c.name) +
        ' <b>+</b></button>').join('') + '</div>' +
      (data.categories.some(c => c.parentId && !c.system)
        ? '<div class="lbl" style="margin-top:.6rem">suas subcategorias</div><div class="row">' +
        data.categories.filter(c => c.parentId && !c.system).map(c =>
          '<span class="pill cat">' + esc(ENGINE.categoryLabel(c.id)) +
          ' <button data-act="delcat" data-id="' + c.id + '">✕</button></span>').join('') + '</div>'
        : '') +
      '</div>';

    html += '<div class="card"><h3>Backup e dados</h3>' +
      '<div class="note ' + (info.pesado ? 'warn' : '') + '"><b>' +
      info.transactions.toLocaleString('pt-BR') + ' lançamentos · ' + info.mb.toFixed(1) + ' MB.</b> ' +
      'Os dados ficam <b>só neste navegador, neste computador</b>. Se você limpar os dados do navegador, ' +
      'eles somem. Faça backup de vez em quando — é um arquivo só.' +
      (data.settings.lastBackup ? '<br>Último backup: ' + U.fmtDate(data.settings.lastBackup) +
        '.' : '<br><b>Você ainda não fez nenhum backup.</b>') + '</div>' +
      '<div class="row">' +
      '<button class="btn primary" data-act="backup">↓ Baixar backup (.json)</button>' +
      '<button class="btn" data-act="import">↑ Restaurar backup</button>' +
      '<button class="btn" data-act="exportcsv">↓ Exportar lançamentos (CSV)</button>' +
      '<button class="btn" data-act="exportxlsx">↓ Exportar Excel</button>' +
      '<button class="btn danger" data-act="wipe">Apagar tudo</button>' +
      '</div>' +
      '<div class="muted" style="font-size:.78rem">O arquivo de backup é o mesmo formato que a futura versão ' +
      'com servidor vai importar — nada se perde na migração.</div></div>';

    html += '<div class="card"><h3>Importações feitas</h3>' +
      (data.imports.length ? '<div class="scrollx"><table class="tbl"><thead><tr>' +
        '<th>Arquivo</th><th>Quando</th><th>Formato</th><th class="n">Novos</th><th class="n">Duplicados</th></tr></thead><tbody>' +
        data.imports.slice().reverse().slice(0, 30).map(i => '<tr><td>' + esc(i.filename) + '</td>' +
          '<td class="muted">' + U.fmtDate(i.date) + '</td><td class="muted">' + i.format + '</td>' +
          '<td class="n">' + i.inserted + '</td><td class="n muted">' + i.duplicates + '</td></tr>').join('') +
        '</tbody></table></div>'
        : '<div class="empty-chart">Nenhuma importação registrada.</div>') + '</div>';

    root.innerHTML = html;

    const sh = root.querySelector('#sh');
    if (sh) sh.onchange = () => { data.settings.household = sh.value.trim() || 'Minhas finanças'; DB.save(); UI.render(); };
    const st = root.querySelector('#st');
    if (st) st.onchange = () => { data.settings.theme = st.value; UI.applyTheme(); DB.save(); };
    const srt = root.querySelector('#srt');
    if (srt) srt.onchange = () => {
      data.settings.reviewThreshold = Math.max(0, Math.min(1, +srt.value || 0.62));
      DB.save();
    };
    root.querySelectorAll('[data-nwacct]').forEach(cb => {
      cb.onchange = () => {
        const a = data.accounts.find(x => x.id === cb.dataset.nwacct);
        if (a) { a.includeInNetWorth = cb.checked; DB.save(); }
      };
    });
  };

  function ruleText(r) {
    const c = r.conditions || {};
    const parts = [];
    if (c.merchantKey) parts.push('estabelecimento é "' + c.merchantKey + '"');
    if (c.contains) parts.push('descrição contém "' + c.contains + '"');
    if (c.minCents) parts.push('valor ≥ ' + U.money(c.minCents));
    if (c.maxCents) parts.push('valor ≤ ' + U.money(c.maxCents));
    if (c.sign === '+') parts.push('é entrada');
    if (c.sign === '-') parts.push('é saída');
    return parts.join(' e ') || 'qualquer lançamento';
  }

  UI.actions.delrule = function (el) {
    d().rules = d().rules.filter(r => r.id !== el.dataset.id);
    DB.save(); UI.render();
  };
  UI.actions.applyrule = function (el) {
    const r = d().rules.find(x => x.id === el.dataset.id);
    if (!r) return;
    const n = ENGINE.applyRuleNow(r, true);
    DB.save();
    UI.toast(n + ' lançamentos atualizados por esta regra.', 'good');
    UI.render();
  };
  UI.actions.newrule = function () {
    UI.modal('<h2>Nova regra</h2>' +
      '<label class="field">Quando a descrição contiver<input type="text" id="rc" placeholder="ex.: POSTO IPIRANGA"></label>' +
      '<div class="grid g2">' +
      '<label class="field">Valor mínimo (opcional)<input type="text" id="rmin"></label>' +
      '<label class="field">Valor máximo (opcional)<input type="text" id="rmax"></label>' +
      '</div>' +
      '<p class="muted" style="font-size:.82rem" id="rprev">Escolha a categoria no próximo passo.</p>' +
      '<div class="modal-foot"><button class="btn" data-x="c">Cancelar</button>' +
      '<button class="btn primary" data-x="ok">Escolher categoria →</button></div>',
      {
        onMount(m) {
          m.querySelector('[data-x=c]').onclick = UI.closeModal;
          m.querySelector('[data-x=ok]').onclick = () => {
            const contains = m.querySelector('#rc').value.trim().toUpperCase();
            if (!contains) return UI.toast('Escreva o texto que a regra deve procurar.', 'bad');
            const min = U.parseMoney(m.querySelector('#rmin').value);
            const max = U.parseMoney(m.querySelector('#rmax').value);
            UI.closeModal();
            UI.pickCategory(cat => {
              const rule = ENGINE.addRule({
                name: 'Contém ' + contains, categoryId: cat, priority: 70,
                conditions: {
                  contains,
                  minCents: min ? Math.abs(min) : null,
                  maxCents: max ? Math.abs(max) : null
                }
              });
              const n = ENGINE.applyRuleNow(rule, true);
              DB.save();
              UI.toast('Regra criada · ' + n + ' lançamentos atualizados.', 'good');
              UI.render();
            });
          };
        }
      });
  };
  UI.actions.reclassify = function () {
    UI.confirm('Reprocessar tudo?',
      'Vou reclassificar todos os lançamentos com as regras e o aprendizado atuais. ' +
      '<b>Suas correções manuais não são tocadas.</b>',
      () => {
        const n = ENGINE.reclassifyAll(false);
        UI.toast(n + ' lançamentos reprocessados.', 'good');
        UI.render();
      }, 'Reprocessar');
  };
  UI.actions.addsub = function (el) {
    const parent = ENGINE.category(el.dataset.id);
    if (!parent) return;
    const name = prompt('Nova subcategoria em ' + parent.name + ':');
    if (!name) return;
    const slug = parent.id + '.' + U.stripAccents(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
    if (ENGINE.category(slug)) return UI.toast('Já existe uma subcategoria com esse nome.', 'bad');
    d().categories.push({
      id: slug, parentId: parent.id, name: name.trim(), kind: parent.kind,
      color: parent.color, system: false, order: 99
    });
    DB.save(); UI.render();
  };
  UI.actions.delcat = function (el) {
    const id = el.dataset.id;
    const used = d().transactions.filter(t => t.categoryId === id).length;
    if (used) return UI.toast('Essa subcategoria está em uso por ' + used + ' lançamentos.', 'bad');
    d().categories = d().categories.filter(c => c.id !== id);
    DB.save(); UI.render();
  };
  UI.actions.wipe = function () {
    UI.confirm('Apagar absolutamente tudo?',
      'Todos os lançamentos, contas, cartões, regras e metas serão apagados deste navegador. ' +
      '<b>Baixe um backup antes se tiver qualquer dúvida.</b>',
      async () => {
        await DB.wipe();
        ENGINE.seed();
        await DB.flush();
        UI.state.view = 'painel';
        UI.render();
        UI.toast('Tudo apagado.');
      }, 'Apagar tudo');
  };

  global.__views2 = true;
})(window);
