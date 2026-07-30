/* ══════════════════════════════════════════════════════════════════
   insights.js — previsão de caixa e detectores de insight

   Os detectores são funções estatísticas puras. Nada aqui inventa
   número: cada insight aponta para os lançamentos que o geraram.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const I = {};
  const d = () => DB.data;

  /* ═══════════════════ Previsão de fluxo de caixa ══════════════ */

  I.liquidBalance = function () {
    return U.sum(d().accounts.filter(a =>
      a.includeInNetWorth !== false && (a.type === 'checking' || a.type === 'savings')),
      a => ENGINE.accountBalance(a.id));
  };

  // Gasto discricionário diário: o que sobra depois de tirar
  // recorrências, transferências e parcelas.
  I.discretionaryProfile = function (days) {
    days = days || 90;
    const today = U.today();
    const from = U.addDays(today, -days);
    const recKeys = new Set((d().recurrences || []).map(r => r.merchantKey));
    const txs = d().transactions.filter(t =>
      t.status !== 'projected' && !t.isTransfer && t.accountId &&
      t.amountCents < 0 && t.date >= from && t.date <= today &&
      !t.installmentPlanId && !recKeys.has(t.merchantKey));

    const byDay = new Map();
    for (let i = 0; i < days; i++) byDay.set(U.addDays(from, i), 0);
    txs.forEach(t => { byDay.set(t.date, (byDay.get(t.date) || 0) + Math.abs(t.amountCents)); });
    const series = Array.from(byDay.values());
    return {
      mean: U.mean(series),
      sd: U.stdev(series),
      p90: U.percentile(series, 0.9),
      total: U.sum(series),
      days
    };
  };

  // Saídas conhecidas: faturas de cartão, recorrências e parcelas.
  I.knownEvents = function (horizonDays) {
    horizonDays = horizonDays || 90;
    const today = U.today();
    const limit = U.addDays(today, horizonDays);
    const events = [];

    // Faturas de cartão (uma saída por fatura, no vencimento).
    d().cards.forEach(card => {
      const sum = ENGINE.cardSummary(card);
      sum.statements.forEach(s => {
        if (!s.dueDate || s.dueDate < today || s.dueDate > limit) return;
        if (s.status === 'paga') return;
        const amount = Math.abs(s.chargesCents || 0) - (s.paidCents || 0);
        if (amount <= 0) return;
        events.push({
          date: s.dueDate, amountCents: -amount, kind: 'fatura',
          label: 'Fatura ' + card.name, cardId: card.id,
          certainty: s.closed ? 'certo' : 'estimado'
        });
      });
    });

    // Recorrências fora do cartão (as do cartão já entram na fatura).
    ENGINE.projectedRecurrences(horizonDays).forEach(t => {
      if (t.cardId) return;
      if (t.date < today || t.date > limit) return;
      events.push({
        date: t.date, amountCents: t.amountCents, kind: t.amountCents > 0 ? 'receita' : 'recorrencia',
        label: t.merchantName, certainty: 'estimado', recurrenceId: t.recurrenceId,
        categoryId: t.categoryId
      });
    });

    // Parcelas em conta (débito automático de financiamento, p. ex.).
    ENGINE.projectedInstallments(Math.ceil(horizonDays / 30) + 1).forEach(t => {
      if (t.cardId) return;
      if (t.date < today || t.date > limit) return;
      events.push({
        date: t.date, amountCents: t.amountCents, kind: 'parcela',
        label: t.merchantName + ' ' + t.installmentNo + '/' + t.installmentTotal,
        certainty: 'certo', categoryId: t.categoryId
      });
    });

    return events.sort((a, b) => a.date.localeCompare(b.date));
  };

  I.forecast = function (horizonDays) {
    horizonDays = horizonDays || 90;
    const today = U.today();
    const start = I.liquidBalance();
    const events = I.knownEvents(horizonDays);
    const disc = I.discretionaryProfile(90);

    const byDate = new Map();
    events.forEach(e => { byDate.set(e.date, (byDate.get(e.date) || 0) + e.amountCents); });

    const points = [];
    let running = start;
    for (let i = 0; i <= horizonDays; i++) {
      const date = U.addDays(today, i);
      running += (byDate.get(date) || 0);
      if (i > 0) running -= disc.mean;
      // Incerteza do discricionário acumulado: soma de variâncias.
      const spread = disc.sd * Math.sqrt(Math.max(i, 1)) * 1.2816;
      points.push({
        date,
        p50: Math.round(running),
        p10: Math.round(running - spread),
        p90: Math.round(running + spread),
        events: events.filter(e => e.date === date)
      });
    }

    const firstNegative = points.find(p => p.p10 < 0);
    const firstNegativeP50 = points.find(p => p.p50 < 0);
    return { start, points, events, disc, firstNegative, firstNegativeP50 };
  };

  /* ══════════════════════════ Detectores ═══════════════════════ */

  function push(list, o) {
    if (d().dismissedInsights.includes(o.id)) return;
    list.push(o);
  }

  I.all = function () {
    const out = [];
    const data = d();
    const today = U.today();

    /* 1 · Risco de saldo negativo */
    const fc = I.forecast(90);
    if (fc.firstNegativeP50) {
      const p = fc.firstNegativeP50;
      const causes = fc.events.filter(e => e.date <= p.date && e.date >= today && e.amountCents < 0)
        .sort((a, b) => a.amountCents - b.amountCents).slice(0, 2);
      push(out, {
        id: 'saldo-negativo-' + p.date,
        type: 'risco', severity: 'alta',
        title: 'Saldo projetado fica negativo em ' + U.fmtDate(p.date),
        detail: 'Projeção de ' + U.money(p.p50) + ' no dia ' + U.fmtDate(p.date) +
          (causes.length ? '. Principais saídas até lá: ' +
            causes.map(c => c.label + ' (' + U.money(Math.abs(c.amountCents)) + ')').join(' e ') + '.' : '.'),
        moneyImpactCents: Math.abs(p.p50),
        action: { view: 'calendario' }
      });
    } else if (fc.firstNegative) {
      push(out, {
        id: 'saldo-apertado-' + fc.firstNegative.date,
        type: 'risco', severity: 'media',
        title: 'Mês apertado por volta de ' + U.fmtDate(fc.firstNegative.date),
        detail: 'No cenário pessimista (P10) o saldo chega a ' + U.money(fc.firstNegative.p10) +
          '. No cenário central segue positivo.',
        moneyImpactCents: Math.abs(fc.firstNegative.p10),
        action: { view: 'calendario' }
      });
    }

    /* 2 · Assinaturas: custo total e possíveis esquecidas */
    // Só o que é de fato assinatura conta como economia potencial —
    // aluguel e plano de saúde são recorrentes, mas não são desperdício.
    const subs = (data.recurrences || []).filter(r =>
      r.direction === 'out' && r.state === 'active' &&
      String(r.categoryId || '').startsWith('assinaturas'));
    if (subs.length) {
      const monthly = Math.abs(U.sum(subs.filter(r => r.cadence === 'mensal'), r => r.expectedCents));
      if (monthly > 0) {
        push(out, {
          id: 'assinaturas-total',
          type: 'assinatura', severity: 'baixa',
          title: subs.length + ' assinaturas somam ' + U.money(monthly) + '/mês',
          detail: 'São ' + U.money(monthly * 12) + ' por ano em cobranças automáticas: ' +
            subs.slice(0, 5).map(s => s.merchantName).join(', ') +
            (subs.length > 5 ? ' e outras' : '') + '. Vale revisar quais você realmente usa.',
          moneyImpactCents: monthly * 12,
          action: { view: 'calendario' }
        });
      }
    }

    // Total de contas fixas: informativo, não entra na economia potencial.
    const fixas = (data.recurrences || []).filter(r =>
      r.direction === 'out' && r.state === 'active' && r.cadence === 'mensal' &&
      !String(r.categoryId || '').startsWith('assinaturas'));
    if (fixas.length >= 3) {
      const fixasMes = Math.abs(U.sum(fixas, r => r.expectedCents));
      push(out, {
        id: 'contas-fixas-total',
        type: 'estrutura', severity: 'baixa',
        title: U.money(fixasMes) + ' por mês em contas fixas',
        detail: fixas.length + ' compromissos mensais recorrentes (moradia, saúde, educação e afins). ' +
          'É o piso do seu custo de vida: o que você precisa cobrir antes de qualquer escolha.',
        moneyImpactCents: fixasMes,
        action: { view: 'calendario' }
      });
    }
    // Recorrência que parou de aparecer — pode ter sido cancelada, ou
    // pode ser cobrança que mudou de nome.
    (data.recurrences || []).forEach(r => {
      if (r.state !== 'active' || r.direction !== 'out' || r.cadence !== 'mensal') return;
      const atraso = U.daysBetween(r.nextExpected, today);
      if (atraso > 20 && atraso < 120) {
        push(out, {
          id: 'recorrencia-sumida-' + r.id,
          type: 'recorrencia', severity: 'baixa',
          title: r.merchantName + ' não foi cobrado este mês',
          detail: 'Esperado por volta de ' + U.fmtDate(r.nextExpected) + ' (' + U.money(Math.abs(r.expectedCents)) +
            '). Se você cancelou, ótimo. Se não, a cobrança pode ter mudado de descrição.',
          moneyImpactCents: Math.abs(r.expectedCents) * 12,
          action: { view: 'transacoes', search: r.merchantName }
        });
      }
    });

    /* 3 · Aumento silencioso de preço */
    (data.recurrences || []).forEach(r => {
      if (r.occurrences < 4 || r.direction !== 'out') return;
      const hist = r.amounts.slice(0, -1);
      const last = r.amounts[r.amounts.length - 1];
      const med = U.median(hist);
      if (med > 0 && last > med * 1.1 && last - med > 500) {
        push(out, {
          id: 'aumento-' + r.id + '-' + last,
          type: 'aumento', severity: 'media',
          title: r.merchantName + ' subiu ' + U.pct((last - med) / med, 0),
          detail: 'De ' + U.money(med) + ' para ' + U.money(last) + ' por cobrança. ' +
            'No ano isso representa ' + U.money((last - med) * 12) + ' a mais.',
          moneyImpactCents: (last - med) * 12,
          action: { view: 'transacoes', search: r.merchantName }
        });
      }
    });

    /* 4 · Cobrança duplicada */
    const recent = data.transactions.filter(t =>
      t.status !== 'projected' && t.amountCents < 0 && !t.isTransfer &&
      U.daysBetween(t.date, today) <= 120);
    const seen = new Map();
    recent.forEach(t => {
      const k = (t.merchantKey || t.descriptorNorm) + '|' + t.amountCents;
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push(t);
    });
    seen.forEach((list, k) => {
      if (list.length < 2) return;
      list.sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 1; i < list.length; i++) {
        const gap = U.daysBetween(list[i - 1].date, list[i].date);
        if (gap > 3) continue;
        // Se o padrão se repete todo mês, é assinatura, não duplicata.
        const isRecurring = (data.recurrences || []).some(r => r.merchantKey === list[i].merchantKey);
        if (isRecurring && gap > 1) continue;
        push(out, {
          id: 'duplicada-' + list[i].id,
          type: 'duplicada', severity: 'media',
          title: 'Cobrança repetida em ' + (list[i].merchantName || 'estabelecimento'),
          detail: U.money(Math.abs(list[i].amountCents)) + ' em ' + U.fmtDate(list[i - 1].date) +
            ' e de novo em ' + U.fmtDate(list[i].date) + '. Confira se não foi cobrado duas vezes.',
          moneyImpactCents: Math.abs(list[i].amountCents),
          txIds: [list[i - 1].id, list[i].id],
          action: { view: 'transacoes', search: list[i].merchantName }
        });
      }
    });

    /* 5 · Desperdício: tarifas, juros e multas */
    const wasteCats = ['impostos.tarifa', 'impostos.iof', 'impostos.anuidade', 'impostos.multas',
      'emprestimos.juros', 'emprestimos.rotativo'];
    const from90 = U.addDays(today, -90);
    const waste = data.transactions.filter(t =>
      t.status !== 'projected' && wasteCats.includes(t.categoryId) && t.date >= from90);
    const wasteTotal = Math.abs(U.sum(waste, t => t.amountCents));
    if (wasteTotal > 2000) {
      const byCat = U.groupBy(waste, t => t.categoryId);
      const top = Array.from(byCat.entries())
        .map(([c, l]) => ({ c, v: Math.abs(U.sum(l, t => t.amountCents)) }))
        .sort((a, b) => b.v - a.v)[0];
      push(out, {
        id: 'desperdicio-90d',
        type: 'desperdicio', severity: wasteTotal > 20000 ? 'alta' : 'media',
        title: U.money(wasteTotal) + ' em tarifas, juros e multas nos últimos 90 dias',
        detail: 'Maior parcela: ' + ENGINE.categoryLabel(top.c) + ' (' + U.money(top.v) + '). ' +
          'Projetado para o ano: ' + U.money(wasteTotal * 4) + '. Este é o custo mais fácil de eliminar.',
        moneyImpactCents: wasteTotal * 4,
        action: { view: 'transacoes', category: top.c }
      });
    }

    /* 6 · Categoria acima da média */
    const thisMonth = U.monthKey(today);
    const months = [];
    for (let i = 1; i <= 6; i++) months.push(U.monthKey(U.addMonths(today, -i)));
    const catNow = new Map(), catHist = new Map();
    data.transactions.forEach(t => {
      if (t.status === 'projected' || t.isTransfer || t.amountCents >= 0 || t.hidden) return;
      const parent = ENGINE.categoryParent(t.categoryId);
      if (!parent || parent.kind !== 'expense') return;
      const mk = U.monthKey(t.date);
      if (mk === thisMonth) catNow.set(parent.id, (catNow.get(parent.id) || 0) + Math.abs(t.amountCents));
      else if (months.includes(mk)) {
        if (!catHist.has(parent.id)) catHist.set(parent.id, new Map());
        const mm = catHist.get(parent.id);
        mm.set(mk, (mm.get(mk) || 0) + Math.abs(t.amountCents));
      }
    });
    const monthProgress = Math.max(0.35, (+today.split('-')[2]) / U.daysInMonth(thisMonth));
    catNow.forEach((v, cat) => {
      const hist = catHist.get(cat);
      if (!hist || hist.size < 3) return;
      const vals = Array.from(hist.values());
      const med = U.median(vals);
      const projected = v / monthProgress;
      if (med > 5000 && projected > med * 1.35 && projected - med > 8000) {
        push(out, {
          id: 'acima-media-' + cat + '-' + thisMonth,
          type: 'anomalia', severity: 'media',
          title: (ENGINE.category(cat) || {}).name + ' deve fechar ' + U.pct((projected - med) / med, 0) + ' acima do normal',
          detail: 'Já são ' + U.money(v) + ' este mês; a mediana dos últimos meses é ' + U.money(med) +
            '. No ritmo atual, fecha em torno de ' + U.money(projected) + '.',
          moneyImpactCents: projected - med,
          action: { view: 'transacoes', category: cat, month: thisMonth }
        });
      }
    });

    /* 7 · Comprometimento de renda com dívida e parcelas */
    const incomeMonths = months.slice(0, 3).map(mk => ENGINE.monthTotals(mk).income).filter(x => x > 0);
    const avgIncome = incomeMonths.length ? U.mean(incomeMonths) : 0;
    if (avgIncome > 0) {
      const parcelas = U.sum(data.installmentPlans, p => {
        const rest = ENGINE.planRemaining(p);
        return rest > 0 ? p.installmentCents : 0;
      });
      const debtRec = Math.abs(U.sum((data.recurrences || []).filter(r =>
        r.direction === 'out' && ENGINE.categoryKind(r.categoryId) === 'debt'), r => r.expectedCents));
      const total = parcelas + debtRec;
      if (total / avgIncome > 0.3) {
        push(out, {
          id: 'comprometimento-' + thisMonth,
          type: 'divida', severity: total / avgIncome > 0.45 ? 'alta' : 'media',
          title: U.pct(total / avgIncome, 0) + ' da sua renda já está comprometido',
          detail: U.money(total) + ' por mês em parcelas e dívidas, contra renda média de ' +
            U.money(avgIncome) + '. Acima de 30% o orçamento perde flexibilidade.',
          moneyImpactCents: total,
          action: { view: 'cartoes' }
        });
      }
    }

    /* 8 · Maior despesa do mês */
    const mt = ENGINE.monthTotals(thisMonth);
    const biggest = mt.txs.filter(t => t.amountCents < 0).sort((a, b) => a.amountCents - b.amountCents)[0];
    if (biggest && Math.abs(biggest.amountCents) > 30000) {
      push(out, {
        id: 'maior-despesa-' + thisMonth + '-' + biggest.id,
        type: 'destaque', severity: 'baixa',
        title: 'Maior despesa do mês: ' + (biggest.merchantName || 'lançamento') +
          ' — ' + U.money(Math.abs(biggest.amountCents)),
        detail: U.fmtDate(biggest.date) + ' · ' + ENGINE.categoryLabel(biggest.categoryId) +
          (biggest.installmentTotal ? ' · parcela ' + biggest.installmentNo + '/' + biggest.installmentTotal : ''),
        moneyImpactCents: Math.abs(biggest.amountCents),
        txIds: [biggest.id],
        action: { view: 'transacoes', search: biggest.merchantName }
      });
    }

    /* 9 · Mês atípico no total */
    const totals = months.map(mk => ENGINE.monthTotals(mk).expense).filter(x => x > 0);
    if (totals.length >= 3 && mt.expense > 0) {
      const med = U.median(totals), sd = U.stdev(totals);
      const projected = mt.expense / monthProgress;
      if (sd > 0 && (projected - med) / sd > 1.6 && projected > med * 1.2) {
        push(out, {
          id: 'mes-atipico-' + thisMonth,
          type: 'anomalia', severity: 'media',
          title: U.fmtMonth(thisMonth, true) + ' está fora do padrão',
          detail: 'Despesa projetada de ' + U.money(projected) + ' contra mediana de ' + U.money(med) + '.',
          moneyImpactCents: projected - med,
          action: { view: 'relatorios' }
        });
      }
    }

    /* 10 · Economia potencial consolidada */
    const potencial = out.filter(o => ['desperdicio', 'assinatura', 'aumento', 'duplicada'].includes(o.type))
      .reduce((a, o) => a + (o.moneyImpactCents || 0), 0);
    if (potencial > 0) {
      out.unshift({
        id: 'economia-potencial',
        type: 'economia', severity: 'destaque',
        title: U.money(potencial) + ' por ano em economia potencial',
        detail: 'Soma de tarifas e juros evitáveis, assinaturas a revisar, aumentos silenciosos e cobranças repetidas.',
        moneyImpactCents: potencial,
        action: null
      });
    }

    const ordem = { alta: 0, destaque: 1, media: 2, baixa: 3 };
    return out.sort((a, b) =>
      (ordem[a.severity] - ordem[b.severity]) || (b.moneyImpactCents - a.moneyImpactCents));
  };

  /* ═════════════════ Séries para o painel ══════════════════════ */

  I.monthlySeries = function (nMonths) {
    nMonths = nMonths || 12;
    const today = U.today();
    const out = [];
    for (let i = nMonths - 1; i >= 0; i--) {
      const mk = U.monthKey(U.addMonths(today, -i));
      const t = ENGINE.monthTotals(mk);
      out.push({ month: mk, income: t.income, expense: t.expense, net: t.net });
    }
    return out;
  };

  I.categoryBreakdown = function (from, to, opts) {
    opts = opts || {};
    const txs = ENGINE.movementsIn(from, to).filter(t =>
      opts.income ? t.amountCents > 0 : t.amountCents < 0);
    const map = new Map();
    txs.forEach(t => {
      const p = ENGINE.categoryParent(t.categoryId);
      if (!p) return;
      if (!opts.income && p.kind !== 'expense' && p.kind !== 'debt' && p.kind !== 'investment') return;
      if (opts.income && p.kind !== 'income') return;
      const cur = map.get(p.id) || { id: p.id, name: p.name, color: p.color, cents: 0, count: 0 };
      cur.cents += Math.abs(t.amountCents);
      cur.count++;
      map.set(p.id, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.cents - a.cents);
  };

  I.topMerchants = function (from, to, limit) {
    const txs = ENGINE.movementsIn(from, to).filter(t => t.amountCents < 0);
    const map = new Map();
    txs.forEach(t => {
      const k = t.merchantKey || t.descriptorNorm;
      const cur = map.get(k) || { key: k, name: t.merchantName || k, cents: 0, count: 0, categoryId: t.categoryId };
      cur.cents += Math.abs(t.amountCents);
      cur.count++;
      map.set(k, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.cents - a.cents).slice(0, limit || 10);
  };

  I.recurringVsVariable = function (from, to) {
    const recKeys = new Set((d().recurrences || []).map(r => r.merchantKey));
    const txs = ENGINE.movementsIn(from, to).filter(t => t.amountCents < 0);
    let rec = 0, varia = 0, parc = 0;
    txs.forEach(t => {
      const v = Math.abs(t.amountCents);
      if (t.installmentPlanId) parc += v;
      else if (recKeys.has(t.merchantKey)) rec += v;
      else varia += v;
    });
    return { recorrente: rec, variavel: varia, parcelado: parc, total: rec + varia + parc };
  };

  global.INSIGHTS = I;
})(window);
