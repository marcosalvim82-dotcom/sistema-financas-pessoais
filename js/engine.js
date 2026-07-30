/* ══════════════════════════════════════════════════════════════════
   engine.js — o núcleo: dedup, categorização, cartões, parcelas,
   transferências e recorrências.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const E = {};
  const d = () => DB.data;

  /* ════════════════════════ Inicialização ══════════════════════ */

  E.seed = function () {
    const data = d();
    if (!data.categories.length) data.categories = RULES.buildCategories();
    // Regras semeadas ficam fora do banco: são código, não dado do
    // usuário. Assim melhoram quando o sistema é atualizado.
    return data;
  };

  E.category = function (id) {
    return d().categories.find(c => c.id === id) || null;
  };

  E.categoryLabel = function (id) {
    const c = E.category(id);
    if (!c) return 'Não classificado';
    if (!c.parentId) return c.name;
    const p = E.category(c.parentId);
    return (p ? p.name + ' › ' : '') + c.name;
  };

  E.categoryParent = function (id) {
    const c = E.category(id);
    if (!c) return null;
    return c.parentId ? E.category(c.parentId) : c;
  };

  E.categoryKind = function (id) {
    const p = E.categoryParent(id);
    return p ? p.kind : 'expense';
  };

  E.categoryColor = function (id) {
    const p = E.categoryParent(id);
    return p ? p.color : '#94908A';
  };

  E.leafCategories = function () {
    return d().categories.filter(c => c.parentId);
  };

  /* ═════════════════ Contas e cartões (detecção) ═══════════════ */

  function maskOf(acctId) {
    if (!acctId) return null;
    const digits = String(acctId).replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : String(acctId).slice(-4);
  }

  E.findOrCreateAccount = function (stmt, inst, filename) {
    const data = d();
    const instId = inst ? inst.id : 'outro';
    const mask = maskOf(stmt.acctId);

    let acc = data.accounts.find(a =>
      a.institutionId === instId && (
        (mask && a.masked === mask) ||
        (!mask && !a.masked && a.type === mapType(stmt.acctType))
      ));

    if (!acc && !mask) {
      // Sem número de conta no arquivo: se só existe uma conta desta
      // instituição, é ela.
      const sameInst = data.accounts.filter(a => a.institutionId === instId);
      if (sameInst.length === 1) acc = sameInst[0];
    }

    if (acc) return { account: acc, created: false };

    const instObj = RULES.institutionById(instId);
    acc = {
      id: U.uid(),
      institutionId: instId,
      name: instObj.name + (mask ? ' ·' + mask : '') ,
      type: mapType(stmt.acctType),
      masked: mask,
      currency: stmt.currency || 'BRL',
      balanceCents: null,
      balanceDate: null,
      status: 'provisional',
      includeInNetWorth: true,
      color: instObj.color,
      createdAt: new Date().toISOString()
    };
    data.accounts.push(acc);
    return { account: acc, created: true };
  };

  function mapType(t) {
    t = (t || '').toLowerCase();
    if (t.includes('sav') || t.includes('poup')) return 'savings';
    if (t.includes('invest')) return 'investment';
    if (t.includes('loan')) return 'loan';
    return 'checking';
  }

  E.findOrCreateCard = function (stmt, inst, filename) {
    const data = d();
    const instId = inst ? inst.id : 'outro';
    const mask = maskOf(stmt.acctId);

    let card = data.cards.find(c =>
      c.institutionId === instId && (mask ? c.masked === mask : !c.masked));

    if (!card && !mask) {
      const sameInst = data.cards.filter(c => c.institutionId === instId);
      if (sameInst.length === 1) card = sameInst[0];
    }
    if (card) return { card, created: false };

    const instObj = RULES.institutionById(instId);
    card = {
      id: U.uid(),
      institutionId: instId,
      name: instObj.name + (mask ? ' ·' + mask : '') + ' (cartão)',
      masked: mask,
      brand: null,
      limitCents: null,
      closingDay: null,
      dueDay: null,
      paymentAccountId: null,
      status: 'provisional',
      color: instObj.color,
      createdAt: new Date().toISOString()
    };
    data.cards.push(card);
    return { card, created: true };
  };

  /* ═══════════════════════ Deduplicação ════════════════════════ */

  function baseKey(ownerId, rec, norm) {
    return ownerId + '|' + rec.date + '|' + rec.amountCents + '|' + norm;
  }

  E.fingerprint = function (ownerId, rec, norm, ordinal) {
    return U.hash(baseKey(ownerId, rec, norm) + '#' + ordinal);
  };

  /* ═════════════════ Cascata de categorização ══════════════════ */

  // Compila uma regra semeada em teste rápido.
  function seedMatch(rule, norm, amountCents) {
    if (rule.sign === '+' && amountCents < 0) return false;
    if (rule.sign === '-' && amountCents > 0) return false;
    return rule.m.some(term => norm.includes(term));
  }

  function userRuleMatch(rule, tx) {
    if (rule.enabled === false) return false;
    const c = rule.conditions || {};
    if (c.contains && !tx.descriptorNorm.includes(String(c.contains).toUpperCase())) return false;
    if (c.equals && tx.descriptorNorm !== String(c.equals).toUpperCase()) return false;
    if (c.merchantKey && tx.merchantKey !== c.merchantKey) return false;
    if (c.minCents !== undefined && c.minCents !== null && Math.abs(tx.amountCents) < c.minCents) return false;
    if (c.maxCents !== undefined && c.maxCents !== null && Math.abs(tx.amountCents) > c.maxCents) return false;
    if (c.sign === '+' && tx.amountCents < 0) return false;
    if (c.sign === '-' && tx.amountCents > 0) return false;
    if (c.accountId && tx.accountId !== c.accountId) return false;
    if (c.cardId && tx.cardId !== c.cardId) return false;
    return true;
  }
  E.userRuleMatch = userRuleMatch;

  // Índice de vizinhos para o estágio kNN, montado uma vez por lote.
  E.buildNeighborIndex = function () {
    const idx = [];
    d().transactions.forEach(t => {
      if (!t.categoryId || t.categoryId === 'outros.nao-classificado') return;
      if (t.categorySource === 'seed' || t.categorySource === 'knn') return; // só o que é confiável
      idx.push({ norm: t.descriptorNorm, cat: t.categoryId, w: t.categorySource === 'user' ? 2 : 1 });
    });
    return idx;
  };

  E.classify = function (tx, ctx) {
    ctx = ctx || {};
    const data = d();
    const norm = tx.descriptorNorm;

    // 0 · decisão manual é soberana
    if (tx.categorySource === 'user' && tx.categoryId) {
      return { categoryId: tx.categoryId, source: 'user', confidence: 1 };
    }

    // 1 · regras do usuário, por prioridade
    const rules = (ctx.rules || data.rules).filter(r => r.enabled !== false)
      .sort((a, b) => (b.priority || 50) - (a.priority || 50));
    for (const r of rules) {
      if (userRuleMatch(r, tx)) {
        return { categoryId: r.categoryId, source: 'rule', confidence: 1, ruleId: r.id, tags: r.tags };
      }
    }

    // 2 · memória de estabelecimento (aprendida com você)
    if (tx.merchantKey) {
      const m = (ctx.merchants || data.merchants).find(x => x.key === tx.merchantKey);
      if (m && m.categoryId) {
        const conf = Math.min(0.97, 0.86 + Math.min(m.count || 1, 8) * 0.014);
        return { categoryId: m.categoryId, source: 'merchant', confidence: conf };
      }
    }

    // 3 · regras semeadas para o Brasil
    let bestSeed = null, bestP = -1, bestLen = 0;
    for (const r of RULES.SEED_RULES) {
      if (!seedMatch(r, norm, tx.amountCents)) continue;
      const p = r.p || 50;
      const len = Math.max.apply(null, r.m.filter(t => norm.includes(t)).map(t => t.length));
      if (p > bestP || (p === bestP && len > bestLen)) { bestSeed = r; bestP = p; bestLen = len; }
    }
    if (bestSeed) {
      return { categoryId: bestSeed.cat, source: 'seed', confidence: 0.88 };
    }

    // 4 · vizinho mais próximo entre seus próprios lançamentos
    const idx = ctx.neighbors || E.buildNeighborIndex();
    if (idx.length) {
      const scored = [];
      for (let i = 0; i < idx.length; i++) {
        const s = U.similarity(norm, idx[i].norm);
        if (s > 0.55) scored.push({ s, cat: idx[i].cat, w: idx[i].w });
      }
      if (scored.length) {
        scored.sort((a, b) => b.s - a.s);
        const top = scored.slice(0, 5);
        const votes = {};
        top.forEach(t => { votes[t.cat] = (votes[t.cat] || 0) + t.s * t.w; });
        let win = null, winScore = 0, total = 0;
        for (const k in votes) { total += votes[k]; if (votes[k] > winScore) { winScore = votes[k]; win = k; } }
        const agreement = total ? winScore / total : 0;
        const conf = Math.min(0.93, top[0].s * agreement);
        if (conf >= 0.5) return { categoryId: win, source: 'knn', confidence: conf };
      }
    }

    // 5 · heurísticas de último recurso
    if (tx.method === 'fee') return { categoryId: 'impostos.tarifa', source: 'heuristic', confidence: 0.7 };
    if (tx.method === 'yield') return { categoryId: 'dividendos.juros', source: 'heuristic', confidence: 0.7 };
    if (tx.method === 'cash') return { categoryId: 'outros.saque', source: 'heuristic', confidence: 0.75 };
    if (tx.cardId && tx.amountCents > 0) {
      return { categoryId: 'transferencias.fatura', source: 'heuristic', confidence: 0.8 };
    }
    if (tx.amountCents > 0) {
      return { categoryId: 'transferencias.recebido', source: 'heuristic', confidence: 0.35 };
    }
    return { categoryId: 'outros.nao-classificado', source: 'none', confidence: 0 };
  };

  E.applyClassification = function (tx, res) {
    tx.categoryId = res.categoryId;
    tx.categorySource = res.source;
    tx.categoryConfidence = res.confidence;
    if (res.tags && res.tags.length) {
      tx.tags = Array.from(new Set((tx.tags || []).concat(res.tags)));
    }
    const kind = E.categoryKind(tx.categoryId);
    tx.isTransfer = kind === 'transfer';
    return tx;
  };

  /* ═════════════════════ Aprendizado ═══════════════════════════ */

  // Chamado quando você corrige uma categoria. É o que faz o sistema
  // não perguntar a mesma coisa duas vezes.
  E.learn = function (tx, categoryId, opts) {
    opts = opts || {};
    const data = d();
    tx.categoryId = categoryId;
    tx.categorySource = 'user';
    tx.categoryConfidence = 1;
    tx.isTransfer = E.categoryKind(categoryId) === 'transfer';
    tx.updatedAt = new Date().toISOString();

    if (tx.merchantKey) {
      let m = data.merchants.find(x => x.key === tx.merchantKey);
      if (!m) {
        m = { key: tx.merchantKey, name: tx.merchantName || U.titleCase(tx.merchantKey), categoryId, count: 0 };
        data.merchants.push(m);
      }
      m.categoryId = categoryId;
      m.count = (m.count || 0) + 1;
      m.learnedAt = new Date().toISOString();
    }

    let affected = 1;
    if (opts.applySimilar) {
      affected += E.applyToSimilar(tx, categoryId, opts.retroactive);
    }
    if (opts.createRule && tx.merchantKey) {
      E.addRule({
        name: 'Sempre ' + (tx.merchantName || tx.merchantKey),
        conditions: { merchantKey: tx.merchantKey },
        categoryId, priority: 60, origin: 'aprendizado'
      });
    }
    return affected;
  };

  E.applyToSimilar = function (tx, categoryId, retroactive) {
    const data = d();
    let n = 0;
    data.transactions.forEach(t => {
      if (t.id === tx.id) return;
      if (t.categorySource === 'user') return;              // nunca sobrescreve seu trabalho
      if (!retroactive && t.importId !== tx.importId) return;
      const same = (t.merchantKey && t.merchantKey === tx.merchantKey) ||
        U.similarity(t.descriptorNorm, tx.descriptorNorm) > 0.86;
      if (same) {
        t.categoryId = categoryId;
        t.categorySource = 'merchant';
        t.categoryConfidence = 0.95;
        t.isTransfer = E.categoryKind(categoryId) === 'transfer';
        t.needsReview = false;
        n++;
      }
    });
    return n;
  };

  E.addRule = function (r) {
    const data = d();
    const rule = Object.assign({
      id: U.uid(), enabled: true, priority: 50,
      createdAt: new Date().toISOString()
    }, r);
    // Não duplica uma regra equivalente.
    const same = data.rules.find(x =>
      JSON.stringify(x.conditions) === JSON.stringify(rule.conditions) &&
      x.categoryId === rule.categoryId);
    if (same) return same;
    data.rules.push(rule);
    return rule;
  };

  E.previewRule = function (rule) {
    return d().transactions.filter(t =>
      t.categorySource !== 'user' && userRuleMatch(rule, t)).length;
  };

  E.applyRuleNow = function (rule, retroactive) {
    let n = 0;
    d().transactions.forEach(t => {
      if (t.categorySource === 'user') return;
      if (!userRuleMatch(rule, t)) return;
      t.categoryId = rule.categoryId;
      t.categorySource = 'rule';
      t.categoryConfidence = 1;
      t.isTransfer = E.categoryKind(rule.categoryId) === 'transfer';
      t.needsReview = false;
      if (rule.tags) t.tags = Array.from(new Set((t.tags || []).concat(rule.tags)));
      n++;
    });
    return n;
  };

  /* ═══════════════════════ Parcelamentos ═══════════════════════ */

  const RX_PARCELA = [
    /\bPARC(?:ELA)?\s*(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\b/i,
    /\((\d{1,2})\s*(?:de|\/)\s*(\d{1,2})\)/i,
    /\b(\d{1,2})\s*\/\s*(\d{1,2})\b/
  ];

  E.detectInstallment = function (rawDescriptor) {
    if (!rawDescriptor) return null;
    const s = U.stripAccents(rawDescriptor).toUpperCase();
    for (const rx of RX_PARCELA) {
      const m = s.match(rx);
      if (m) {
        const no = +m[1], total = +m[2];
        // 12/25 é data, não parcela. Filtra o obviamente absurdo.
        if (total >= 2 && total <= 48 && no >= 1 && no <= total) return { no, total };
      }
    }
    return null;
  };

  E.linkInstallment = function (tx) {
    if (!tx.installmentNo || !tx.installmentTotal) return;
    const data = d();
    const key = [tx.cardId || tx.accountId, tx.merchantKey, tx.installmentTotal, Math.abs(tx.amountCents)].join('|');
    let plan = data.installmentPlans.find(p => p.key === key);
    if (!plan) {
      const firstDate = U.addMonths(tx.date, -(tx.installmentNo - 1));
      plan = {
        id: U.uid(), key,
        cardId: tx.cardId || null, accountId: tx.accountId || null,
        merchantKey: tx.merchantKey, merchantName: tx.merchantName,
        installmentCents: Math.abs(tx.amountCents),
        total: tx.installmentTotal,
        firstDate,
        categoryId: tx.categoryId,
        createdAt: new Date().toISOString()
      };
      data.installmentPlans.push(plan);
    }
    tx.installmentPlanId = plan.id;
    if (!plan.categoryId || plan.categoryId === 'outros.nao-classificado') plan.categoryId = tx.categoryId;
  };

  E.planPaidCount = function (plan) {
    return d().transactions.filter(t => t.installmentPlanId === plan.id && t.status !== 'projected').length;
  };

  E.planRemaining = function (plan) {
    const paid = E.planPaidCount(plan);
    return Math.max(0, plan.total - paid) * plan.installmentCents;
  };

  // Parcelas que ainda vão cair, geradas na hora (nunca gravadas, para
  // não conflitar com a parcela real quando ela chegar no extrato).
  E.projectedInstallments = function (horizonMonths) {
    const data = d();
    const out = [];
    const today = U.today();
    data.installmentPlans.forEach(plan => {
      const existing = data.transactions.filter(t => t.installmentPlanId === plan.id);
      const seen = new Set(existing.map(t => t.installmentNo));
      const maxSeen = Math.max.apply(null, [0].concat(existing.map(t => t.installmentNo || 0)));
      for (let n = 1; n <= plan.total; n++) {
        if (seen.has(n)) continue;
        if (n < maxSeen) continue;                       // parcela antiga que faltou importar
        const date = U.addMonths(plan.firstDate, n - 1);
        if (date < today) continue;
        if (horizonMonths && U.daysBetween(today, date) > horizonMonths * 31) continue;
        out.push({
          id: 'proj-' + plan.id + '-' + n,
          projected: true,
          status: 'projected',
          cardId: plan.cardId, accountId: plan.accountId,
          date,
          cashDate: plan.cardId ? E.cashDateForCard(plan.cardId, date) : date,
          amountCents: -plan.installmentCents,
          descriptorRaw: (plan.merchantName || plan.merchantKey) + ' ' + n + '/' + plan.total,
          descriptorNorm: plan.merchantKey,
          merchantKey: plan.merchantKey,
          merchantName: plan.merchantName,
          categoryId: plan.categoryId || 'outros.diversos',
          categorySource: 'plan', categoryConfidence: 1,
          installmentPlanId: plan.id, installmentNo: n, installmentTotal: plan.total,
          isTransfer: false, tags: []
        });
      }
    });
    return out;
  };

  /* ═════════════════════ Ciclos de cartão ══════════════════════ */

  // Em qual fatura cai uma compra feita nesta data.
  E.statementCycleFor = function (card, date) {
    const closing = card.closingDay || 1;
    const [y, m, dd] = date.split('-').map(Number);
    let cy = y, cm = m;
    if (dd > closing) { cm++; if (cm > 12) { cm = 1; cy++; } }
    const cycleEnd = U.clampDay(cy, cm, closing);
    const prev = U.addMonths(cycleEnd, -1);
    const cycleStart = U.addDays(prev, 1);
    const dueDay = card.dueDay || Math.min(closing + 8, 28);
    let dy = cy, dm = cm;
    if (dueDay <= closing) { dm++; if (dm > 12) { dm = 1; dy++; } }
    const dueDate = U.clampDay(dy, dm, dueDay);
    return { cycleStart, cycleEnd, dueDate, key: cycleEnd };
  };

  E.cashDateForCard = function (cardId, date) {
    const card = d().cards.find(c => c.id === cardId);
    if (!card || !card.closingDay) return date;
    return E.statementCycleFor(card, date).dueDate;
  };

  // Deduz fechamento e vencimento a partir dos próprios lançamentos,
  // sem perguntar nada. Usa a lacuna mensal entre compras.
  E.inferCardCycle = function (card) {
    const txs = d().transactions.filter(t => t.cardId === card.id && t.status !== 'projected');
    if (txs.length < 8) return null;

    // Pagamentos da fatura na conta indicam o vencimento.
    const pays = d().transactions.filter(t =>
      t.accountId && t.linkedCardId === card.id && t.amountCents < 0);
    let dueDay = null;
    if (pays.length >= 2) {
      const days = pays.map(p => +p.date.split('-')[2]);
      dueDay = Math.round(U.median(days));
    }

    // Fechamento: dia do mês com menor densidade de compras.
    const byDay = new Array(29).fill(0);
    txs.forEach(t => { const dd = +t.date.split('-')[2]; if (dd <= 28) byDay[dd]++; });
    let closingDay = null, min = Infinity;
    for (let i = 1; i <= 28; i++) {
      if (byDay[i] < min) { min = byDay[i]; closingDay = i; }
    }
    if (dueDay && !closingDay) closingDay = ((dueDay - 8 + 28) % 28) || 28;
    if (closingDay && !dueDay) dueDay = Math.min(closingDay + 8, 28);
    return { closingDay, dueDay, confidence: pays.length >= 2 ? 'alta' : 'estimada' };
  };

  E.statementsForCard = function (card, includeProjected) {
    const data = d();
    const txs = data.transactions.filter(t => t.cardId === card.id);
    const proj = includeProjected ? E.projectedInstallments(12).filter(t => t.cardId === card.id) : [];
    const all = txs.concat(proj);
    if (!all.length) return [];
    if (!card.closingDay) {
      // Sem ciclo conhecido, agrupa por mês-calendário.
      const byMonth = U.groupBy(all, t => U.monthKey(t.date));
      return Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, list]) => ({
        key: k, cycleStart: k + '-01', cycleEnd: U.endOfMonth(k),
        dueDate: U.endOfMonth(k), items: list,
        totalCents: U.sum(list, t => t.amountCents),
        estimated: true
      }));
    }
    const map = new Map();
    all.forEach(t => {
      const cyc = E.statementCycleFor(card, t.date);
      if (!map.has(cyc.key)) map.set(cyc.key, Object.assign({ items: [] }, cyc));
      map.get(cyc.key).items.push(t);
    });
    const list = Array.from(map.values()).sort((a, b) => a.cycleEnd.localeCompare(b.cycleEnd));
    const today = U.today();
    list.forEach(s => {
      s.totalCents = U.sum(s.items, t => t.amountCents);
      s.chargesCents = U.sum(s.items.filter(t => t.amountCents < 0), t => t.amountCents);
      s.closed = s.cycleEnd < today;
      s.paidCents = U.sum(data.transactions.filter(t =>
        t.linkedStatementKey === card.id + '|' + s.key), t => Math.abs(t.amountCents));
      s.future = s.cycleStart > today;
      s.status = s.future ? 'prevista' : !s.closed ? 'aberta' :
        (s.paidCents >= Math.abs(s.chargesCents) * 0.98 ? 'paga' :
          (s.paidCents > 0 ? 'parcial' : (s.dueDate < today ? 'vencida' : 'fechada')));
    });
    return list;
  };

  E.cardSummary = function (card) {
    const st = E.statementsForCard(card, true);
    const today = U.today();
    const open = st.find(s => !s.closed && s.cycleStart <= today);
    // Fatura fechada há mais de 60 dias é considerada paga mesmo sem o
    // extrato da conta: ninguém carrega uma fatura vencida há meses, e
    // sem esse corte todo histórico antigo entraria como dívida atual.
    const limiteAntigo = U.addDays(today, -60);
    const closedUnpaid = st.filter(s => s.closed && s.dueDate >= limiteAntigo &&
      (s.status === 'fechada' || s.status === 'parcial' || s.status === 'vencida'))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const future = E.projectedInstallments(24).filter(t => t.cardId === card.id);
    const committed = Math.abs(U.sum(future, t => t.amountCents));
    const openAmount = open ? Math.abs(open.chargesCents || 0) : 0;
    const unpaidAmount = Math.abs(U.sum(closedUnpaid, s => (s.chargesCents || 0) + s.paidCents));
    const used = openAmount + unpaidAmount + committed;
    return {
      statements: st,
      open, closedUnpaid,
      openCents: openAmount,
      unpaidCents: unpaidAmount,
      committedCents: committed,
      availableCents: card.limitCents ? Math.max(0, card.limitCents - used) : null,
      usedPct: card.limitCents ? Math.min(1, used / card.limitCents) : null,
      nextDue: (closedUnpaid[0] || open || {}).dueDate || null
    };
  };

  /* ═══════════════ Transferências e pagamento de fatura ════════ */

  E.linkTransfers = function () {
    const data = d();
    const txs = data.transactions.filter(t => t.status !== 'projected');
    const byId = new Map(txs.map(t => [t.id, t]));
    const unlinked = txs.filter(t => !t.linkId);
    let links = 0;

    // 1 · pagamento de fatura: saída na conta ↔ cartão
    const payments = unlinked.filter(t =>
      t.accountId && t.amountCents < 0 &&
      (/PAG(AMENTO|TO)?[\s\-]*(DE)?[\s\-]*(FATURA|CARTAO)|FATURA CARTAO|PAGTO CARTAO/.test(t.descriptorNorm) ||
        t.categoryId === 'transferencias.fatura'));

    payments.forEach(p => {
      p.isTransfer = true;
      if (E.categoryKind(p.categoryId) !== 'transfer') {
        p.categoryId = 'transferencias.fatura';
        p.categorySource = p.categorySource === 'user' ? 'user' : 'link';
        p.categoryConfidence = 0.95;
      }
      // Só para quando a fatura específica já foi identificada: assim,
      // se você configurar fechamento e vencimento depois, o vínculo
      // é refeito com a informação nova.
      if (p.linkedStatementKey) return;
      // Casa com o cartão cuja fatura fechada bate com o valor.
      let best = null, bestDiff = Infinity, bestKey = null;
      data.cards.forEach(card => {
        E.statementsForCard(card).forEach(s => {
          if (!s.closed) return;
          const dueGap = Math.abs(U.daysBetween(s.dueDate, p.date));
          if (dueGap > 12) return;
          const diff = Math.abs(Math.abs(s.chargesCents) - Math.abs(p.amountCents));
          const rel = Math.abs(s.chargesCents) ? diff / Math.abs(s.chargesCents) : 1;
          if (rel < 0.06 && diff < bestDiff) { bestDiff = diff; best = card; bestKey = card.id + '|' + s.key; }
        });
      });
      if (!best && data.cards.length === 1) best = data.cards[0];
      if (best) {
        p.linkedCardId = best.id;
        if (bestKey) p.linkedStatementKey = bestKey;
        links++;
      }
    });

    // 2 · transferência entre contas próprias
    const outs = unlinked.filter(t => t.accountId && t.amountCents < 0 && !t.isTransfer);
    const ins = unlinked.filter(t => t.accountId && t.amountCents > 0);
    const usedIn = new Set();
    outs.forEach(o => {
      if (o.linkId) return;
      const cand = ins.find(i =>
        !usedIn.has(i.id) && !i.linkId &&
        i.accountId !== o.accountId &&
        i.amountCents === -o.amountCents &&
        Math.abs(U.daysBetween(o.date, i.date)) <= 3);
      if (cand) {
        const linkId = U.uid();
        o.linkId = linkId; cand.linkId = linkId;
        usedIn.add(cand.id);
        [o, cand].forEach(t => {
          t.isTransfer = true;
          if (t.categorySource !== 'user') {
            t.categoryId = 'transferencias.entre-contas';
            t.categorySource = 'link';
            t.categoryConfidence = 0.94;
            t.needsReview = false;
          }
        });
        data.links.push({ id: linkId, aId: o.id, bId: cand.id, kind: 'internal_transfer' });
        links++;
      }
    });

    return links;
  };

  /* ════════════════════════ Recorrências ═══════════════════════ */

  E.detectRecurrences = function () {
    const data = d();
    const txs = data.transactions.filter(t =>
      t.status !== 'projected' && !t.isTransfer && t.merchantKey);
    const groups = U.groupBy(txs, t => t.merchantKey + '|' + (t.amountCents < 0 ? 'out' : 'in'));
    const found = [];

    groups.forEach((list, key) => {
      if (list.length < 3) return;
      const sorted = list.slice().sort((a, b) => a.date.localeCompare(b.date));
      const gaps = [];
      for (let i = 1; i < sorted.length; i++) gaps.push(U.daysBetween(sorted[i - 1].date, sorted[i].date));
      const medGap = U.median(gaps);
      if (medGap < 20 || medGap > 400) return;

      let cadence = 'mensal';
      if (medGap >= 20 && medGap <= 40) cadence = 'mensal';
      else if (medGap >= 55 && medGap <= 70) cadence = 'bimestral';
      else if (medGap >= 80 && medGap <= 100) cadence = 'trimestral';
      else if (medGap >= 170 && medGap <= 200) cadence = 'semestral';
      else if (medGap >= 340 && medGap <= 400) cadence = 'anual';
      else return;

      // Regularidade: desvio dos intervalos precisa ser pequeno.
      const sd = U.stdev(gaps);
      if (sd > medGap * 0.35) return;

      const amounts = sorted.map(t => Math.abs(t.amountCents));
      const med = U.median(amounts);
      const variation = med ? U.stdev(amounts) / med : 1;

      const last = sorted[sorted.length - 1];
      const next = U.addMonths(last.date, cadence === 'mensal' ? 1 :
        cadence === 'bimestral' ? 2 : cadence === 'trimestral' ? 3 :
          cadence === 'semestral' ? 6 : 12);

      found.push({
        id: 'rec-' + U.hash(key),
        key,
        merchantKey: list[0].merchantKey,
        merchantName: list[0].merchantName || U.titleCase(list[0].merchantKey),
        categoryId: last.categoryId,
        cardId: last.cardId || null,
        accountId: last.accountId || null,
        direction: list[0].amountCents < 0 ? 'out' : 'in',
        cadence,
        expectedCents: med * (list[0].amountCents < 0 ? -1 : 1),
        variation,
        fixed: variation < 0.03,
        occurrences: sorted.length,
        firstDate: sorted[0].date,
        lastDate: last.date,
        nextExpected: next,
        amounts
      });
    });

    // Preserva o que você pausou ou encerrou manualmente.
    const prev = new Map((data.recurrences || []).map(r => [r.id, r]));
    found.forEach(r => {
      const old = prev.get(r.id);
      r.state = old && old.state === 'paused' ? 'paused' : 'active';
      r.dismissed = old ? old.dismissed : false;
    });
    data.recurrences = found;
    return found;
  };

  E.projectedRecurrences = function (horizonDays) {
    const data = d();
    const today = U.today();
    const limit = U.addDays(today, horizonDays || 90);
    const out = [];
    (data.recurrences || []).forEach(r => {
      if (r.state !== 'active') return;
      if (r.cadence !== 'mensal' && r.cadence !== 'bimestral') {
        if (r.nextExpected < today || r.nextExpected > limit) return;
      }
      let date = r.nextExpected;
      const step = r.cadence === 'mensal' ? 1 : r.cadence === 'bimestral' ? 2 :
        r.cadence === 'trimestral' ? 3 : r.cadence === 'semestral' ? 6 : 12;
      let guard = 0;
      while (date <= limit && guard++ < 24) {
        if (date >= today) {
          out.push({
            id: 'rec-' + r.id + '-' + date,
            projected: true, status: 'projected',
            recurrenceId: r.id,
            accountId: r.accountId, cardId: r.cardId,
            date,
            cashDate: r.cardId ? E.cashDateForCard(r.cardId, date) : date,
            amountCents: r.expectedCents,
            descriptorRaw: r.merchantName,
            descriptorNorm: r.merchantKey,
            merchantKey: r.merchantKey, merchantName: r.merchantName,
            categoryId: r.categoryId, categorySource: 'recurrence', categoryConfidence: 0.9,
            isTransfer: false, tags: []
          });
        }
        date = U.addMonths(date, step);
      }
    });
    return out;
  };

  /* ══════════════════════ Importação ═══════════════════════════ */

  E.importParsed = async function (parsed, file, opts) {
    opts = opts || {};
    const data = d();
    const report = {
      filename: file.name, format: parsed.format,
      inserted: 0, duplicates: 0, updated: 0, review: 0,
      accountsCreated: [], cardsCreated: [], warnings: parsed.warnings.slice(),
      balanceChecks: [], importId: U.uid(), transactions: []
    };

    const buffer = await PARSE.readFile(file);
    const fileHash = await U.hashBuffer(buffer);
    const already = data.imports.find(i => i.fileHash === fileHash);
    if (already && !opts.force) {
      report.duplicateFile = already;
      report.warnings.push('Este arquivo já foi importado em ' +
        U.fmtDate(already.date) + '. Nenhum lançamento foi duplicado.');
      return report;
    }

    const inst = parsed.institution;
    const existingFp = new Set(data.transactions.map(t => t.fingerprint));
    const existingExt = new Set(data.transactions.filter(t => t.externalId)
      .map(t => (t.accountId || t.cardId) + '|' + t.externalId));
    const runCount = {};
    const neighbors = E.buildNeighborIndex();

    parsed.statements.forEach(stmt => {
      let ownerId, isCard = stmt.kind === 'card';
      if (opts.forceKind === 'card') isCard = true;
      if (opts.forceKind === 'account') isCard = false;

      let account = null, card = null;
      if (opts.targetAccountId) {
        account = data.accounts.find(a => a.id === opts.targetAccountId);
        isCard = false;
      } else if (opts.targetCardId) {
        card = data.cards.find(c => c.id === opts.targetCardId);
        isCard = true;
      } else if (isCard) {
        const r = E.findOrCreateCard(stmt, inst, file.name);
        card = r.card;
        if (r.created) report.cardsCreated.push(card);
      } else {
        const r = E.findOrCreateAccount(stmt, inst, file.name);
        account = r.account;
        if (r.created) report.accountsCreated.push(account);
      }
      if (!account && !card) return;
      ownerId = account ? account.id : card.id;

      stmt.records.forEach(rec => {
        const raw = rec.descriptor || '';
        const norm = U.normalizeDescriptor(raw);
        const base = baseKey(ownerId, rec, norm);
        const n = runCount[base] || 0;
        runCount[base] = n + 1;
        const fp = U.hash(base + '#' + n);

        // Camada 2: identificador externo do próprio banco
        if (rec.externalId && existingExt.has(ownerId + '|' + rec.externalId)) {
          report.duplicates++;
          return;
        }
        // Camada 3: impressão digital determinística
        if (existingFp.has(fp)) { report.duplicates++; return; }

        const counterparty = RULES.extractCounterparty(norm);
        const merchantSource = counterparty ? U.normalizeDescriptor(counterparty) : U.merchantSource(norm);
        const mKey = U.merchantKey(merchantSource);

        const tx = {
          id: U.uid(),
          accountId: account ? account.id : null,
          cardId: card ? card.id : null,
          date: rec.date,
          cashDate: card ? E.cashDateForCard(card.id, rec.date) : rec.date,
          amountCents: rec.amountCents,
          descriptorRaw: raw,
          descriptorNorm: norm,
          merchantKey: mKey,
          merchantName: U.titleCase(merchantSource.slice(0, 40)) || U.titleCase(mKey),
          method: RULES.detectMethod(norm),
          status: 'posted',
          categoryId: null, categorySource: null, categoryConfidence: 0,
          isTransfer: false,
          tags: [],
          notes: '',
          externalId: rec.externalId || null,
          fingerprint: fp,
          importId: report.importId,
          createdAt: new Date().toISOString()
        };

        const parc = E.detectInstallment(raw);
        if (parc) { tx.installmentNo = parc.no; tx.installmentTotal = parc.total; }

        const res = E.classify(tx, { neighbors });
        E.applyClassification(tx, res);

        // Camada 4: possível duplicata (não descarta, só sinaliza)
        const fuzzy = data.transactions.find(t =>
          (t.accountId || t.cardId) === ownerId &&
          t.amountCents === tx.amountCents &&
          Math.abs(U.daysBetween(t.date, tx.date)) <= 3 &&
          t.fingerprint !== fp &&
          U.similarity(t.descriptorNorm, norm) > 0.82);
        if (fuzzy) { tx.possibleDuplicateOf = fuzzy.id; tx.needsReview = true; }

        if (tx.categoryConfidence < (data.settings.reviewThreshold || 0.62)) tx.needsReview = true;

        if (parc) E.linkInstallment(tx);

        data.transactions.push(tx);
        existingFp.add(fp);
        if (rec.externalId) existingExt.add(ownerId + '|' + rec.externalId);
        report.inserted++;
        if (tx.needsReview) report.review++;
        report.transactions.push(tx.id);
      });

      // Saldo declarado pelo banco é a verdade; a soma é só conferência.
      if (account && stmt.balanceCents !== null && stmt.balanceCents !== undefined) {
        const previous = account.balanceCents;
        account.balanceCents = stmt.balanceCents;
        account.balanceDate = stmt.balanceDate || stmt.periodEnd || U.today();
        if (previous !== null && previous !== undefined) {
          const movement = U.sum(
            data.transactions.filter(t => t.accountId === account.id && t.importId === report.importId),
            t => t.amountCents);
          const expected = previous + movement;
          if (Math.abs(expected - stmt.balanceCents) > 100) {
            report.balanceChecks.push({
              accountId: account.id,
              accountName: account.name,
              diffCents: stmt.balanceCents - expected,
              periodStart: stmt.periodStart, periodEnd: stmt.periodEnd
            });
          }
        }
      }
      if (card && stmt.balanceCents !== null && stmt.balanceCents !== undefined) {
        card.lastStatementBalanceCents = stmt.balanceCents;
      }
      if (card && !card.closingDay && stmt.periodEnd) {
        const inf = E.inferCardCycle(card);
        if (inf && inf.closingDay) {
          card.closingDay = inf.closingDay;
          card.dueDay = inf.dueDay;
          card.cycleConfidence = inf.confidence;
        }
      }
    });

    data.imports.push({
      id: report.importId, fileHash, filename: file.name,
      format: parsed.format, date: U.today(), at: new Date().toISOString(),
      inserted: report.inserted, duplicates: report.duplicates,
      institutionId: inst ? inst.id : null
    });

    // Pós-processamento do lote
    E.linkTransfers();
    E.detectRecurrences();
    E.recomputeCardCycles();

    DB.save();
    return report;
  };

  E.recomputeCardCycles = function () {
    d().cards.forEach(card => {
      if (card.cycleLocked) return;
      const inf = E.inferCardCycle(card);
      if (inf && inf.closingDay && (!card.closingDay || card.cycleConfidence !== 'alta')) {
        card.closingDay = inf.closingDay;
        card.dueDay = inf.dueDay;
        card.cycleConfidence = inf.confidence;
      }
      // Recalcula a data de caixa das compras do cartão.
      if (card.closingDay) {
        d().transactions.forEach(t => {
          if (t.cardId === card.id) t.cashDate = E.cashDateForCard(card.id, t.date);
        });
      }
    });
  };

  E.reclassifyAll = function (onlyUnreviewed) {
    // Renormaliza primeiro: melhorias no limpador de descritor só
    // valem para o histórico se o texto normalizado for recalculado.
    d().transactions.forEach(t => {
      const norm = U.normalizeDescriptor(t.descriptorRaw || '');
      if (!norm) return;
      const cp = RULES.extractCounterparty(norm);
      const src = cp ? U.normalizeDescriptor(cp) : U.merchantSource(norm);
      t.descriptorNorm = norm;
      t.merchantKey = U.merchantKey(src);
      t.merchantName = U.titleCase(src.slice(0, 40));
      t.method = RULES.detectMethod(norm);
    });

    const neighbors = E.buildNeighborIndex();
    let n = 0;
    d().transactions.forEach(t => {
      if (t.categorySource === 'user') return;
      if (onlyUnreviewed && t.categoryConfidence >= 0.9) return;
      const res = E.classify(t, { neighbors });
      if (res.categoryId !== t.categoryId || res.confidence !== t.categoryConfidence) {
        E.applyClassification(t, res);
        t.needsReview = res.confidence < (d().settings.reviewThreshold || 0.62);
        n++;
      }
    });
    E.linkTransfers();
    DB.save();
    return n;
  };

  /* ═════════════════════ Consultas de domínio ══════════════════ */

  E.accountBalance = function (accountId) {
    const acc = d().accounts.find(a => a.id === accountId);
    if (!acc) return 0;
    if (acc.balanceCents !== null && acc.balanceCents !== undefined) {
      // Soma o que veio depois da data do saldo autoritativo.
      const after = d().transactions.filter(t =>
        t.accountId === accountId && t.status !== 'projected' &&
        acc.balanceDate && t.date > acc.balanceDate);
      return acc.balanceCents + U.sum(after, t => t.amountCents);
    }
    return U.sum(d().transactions.filter(t => t.accountId === accountId && t.status !== 'projected'),
      t => t.amountCents);
  };

  E.netWorth = function () {
    const data = d();
    let assets = 0, liabilities = 0;
    data.accounts.forEach(a => {
      if (a.includeInNetWorth === false) return;
      const b = E.accountBalance(a.id);
      if (b >= 0) assets += b; else liabilities += Math.abs(b);
    });
    data.cards.forEach(c => {
      const s = E.cardSummary(c);
      liabilities += s.openCents + s.unpaidCents;
    });
    const invest = U.sum(data.investPositions, p => p.currentCents || 0);
    assets += invest;
    return { assets, liabilities, net: assets - liabilities, invest };
  };

  // Lançamentos que contam como receita/despesa do período.
  E.movementsIn = function (from, to, opts) {
    opts = opts || {};
    return d().transactions.filter(t => {
      if (t.status === 'projected') return false;
      if (t.hidden) return false;
      if (!opts.includeTransfers && t.isTransfer) return false;
      const dt = opts.cashBasis ? (t.cashDate || t.date) : t.date;
      return dt >= from && dt <= to;
    });
  };

  E.monthTotals = function (monthKey, opts) {
    const from = monthKey + '-01', to = U.endOfMonth(monthKey);
    const txs = E.movementsIn(from, to, opts);
    const income = U.sum(txs.filter(t => t.amountCents > 0 && E.categoryKind(t.categoryId) === 'income'), t => t.amountCents);
    const expense = Math.abs(U.sum(txs.filter(t => t.amountCents < 0), t => t.amountCents));
    return { income, expense, net: income - expense, txs };
  };

  E.reviewQueue = function () {
    return d().transactions.filter(t => t.needsReview && t.status !== 'projected')
      .sort((a, b) => (a.categoryConfidence || 0) - (b.categoryConfidence || 0));
  };

  global.ENGINE = E;
})(window);
