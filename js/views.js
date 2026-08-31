/* ══════════════════════════════════════════════════════════════════
   views.js — Painel, Revisar e Lançamentos
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

  function amtClass(c) { return c < 0 ? 'neg' : 'pos'; }

  function txRow(t, opts) {
    opts = opts || {};
    const cat = ENGINE.categoryLabel(t.categoryId);
    const color = ENGINE.categoryColor(t.categoryId);
    const owner = t.cardId
      ? (d().cards.find(c => c.id === t.cardId) || {}).name
      : (d().accounts.find(a => a.id === t.accountId) || {}).name;
    const sel = UI.state.selection.has(t.id);
    const nome = t.merchantName || t.descriptorRaw || 'lançamento sem descrição';
    // Um resumo em texto corrido: é o que o leitor de tela anuncia, no
    // lugar de ler os fragmentos visuais soltos e fora de ordem.
    const resumo = U.fmtDate(t.date, 'long') + ', ' + nome + ', ' +
      (t.amountCents < 0 ? 'saída de ' : 'entrada de ') + U.money(Math.abs(t.amountCents)) +
      ', categoria ' + cat + (owner ? ', em ' + owner : '') +
      (t.installmentTotal ? ', parcela ' + t.installmentNo + ' de ' + t.installmentTotal : '') +
      (t.needsReview ? ', precisa de revisão' : '');

    return '<div class="trow ' + (sel ? 'sel' : '') + '" data-tx="' + t.id + '">' +
      (opts.selectable
        ? '<input type="checkbox" data-selecttx="' + t.id + '" ' + (sel ? 'checked' : '') +
        ' aria-label="Selecionar ' + esc(nome) + ' de ' + esc(U.fmtDate(t.date)) + '">'
        : '<span></span>') +
      '<span class="sr-only">' + esc(resumo) + '</span>' +
      '<span class="tdate" aria-hidden="true">' + U.fmtDate(t.date, 'short') + '</span>' +
      '<span class="tmain" aria-hidden="true">' +
      '<span class="tname">' + esc(nome) + '</span>' +
      '<span class="tmeta">' +
      '<span class="dotcat" style="background:' + color + '"></span>' + esc(cat) +
      (owner ? ' · ' + esc(owner) : '') +
      (t.installmentTotal ? ' · <span class="pill brass">' + t.installmentNo + '/' + t.installmentTotal + '</span>' : '') +
      (t.isTransfer ? ' · <span class="pill">transf.</span>' : '') +
      (t.needsReview ? ' · <span class="pill warn">revisar</span>' : '') +
      (t.status === 'projected' ? ' · <span class="pill">previsto</span>' : '') +
      '</span></span>' +
      '<span class="tamt ' + amtClass(t.amountCents) + '" aria-hidden="true">' +
      U.money(t.amountCents, { signed: true }) + '</span>' +
      '<span class="tact">' +
      '<button class="btn sm" data-act="editcat" data-id="' + t.id + '" ' +
      'aria-label="Mudar categoria de ' + esc(nome) + '"><span aria-hidden="true">categoria</span></button>' +
      '<button class="btn sm" data-act="txdetail" data-id="' + t.id + '" ' +
      'aria-label="Detalhes de ' + esc(nome) + '"><span aria-hidden="true">⋯</span></button>' +
      '</span></div>';
  }
  UI.txRow = txRow;

  /* ════════════════════════ PAINEL ═════════════════════════════ */

  V.painel = function (root) {
    const data = d();
    if (!data.transactions.length) return V.onboarding(root);

    const today = U.today();
    const mk = U.monthKey(today);
    const mt = ENGINE.monthTotals(mk);
    const nw = ENGINE.netWorth();
    const series = INSIGHTS.monthlySeries(12);
    const prev = series[series.length - 2];
    const fc = INSIGHTS.forecast(90);
    const insights = INSIGHTS.all();
    const cats = INSIGHTS.categoryBreakdown(mk + '-01', U.endOfMonth(mk));
    const mix = INSIGHTS.recurringVsVariable(mk + '-01', U.endOfMonth(mk));
    const savingRate = mt.income > 0 ? mt.net / mt.income : null;
    const pend = ENGINE.reviewQueue().length;

    let html = head('Painel', U.fmtMonth(mk, true) + ' · atualizado em ' + U.fmtDate(today),
      '<button class="btn" data-act="gmail">✉ Gmail</button>' +
      '<button class="btn primary" data-act="import">＋ Importar extrato</button>');

    if (pend) {
      html += '<button class="note warn" data-nav="revisar" style="width:100%;text-align:left">' +
        '<b>' + pend + ' lançamento' + (pend > 1 ? 's' : '') + ' esperando confirmação.</b> ' +
        'Resolver leva menos de um minuto — e o sistema aprende com cada resposta. →</button>';
    }

    // Uma frase antes dos números. Quem abre o app quer saber se está
    // tudo bem, não interpretar quatro cartões de estatística.
    html += '<p class="explica">' + resumoDoMes(mt, savingRate, fc, mk) + '</p>';

    const diasNoMes = U.daysInMonth(mk);
    const diaHoje = +today.split('-')[2];
    const fracMes = diaHoje / diasNoMes;

    html += '<div class="grid g4">' +
      kpi('Patrimônio líquido', U.money(nw.net),
        'Tudo que você tem menos tudo que deve.',
        CHARTS.spark(series.map(s => s.net)),
        'Você tem ' + U.moneyShort(nw.assets) + ' e deve ' + U.moneyShort(nw.liabilities) + '.') +

      kpi('Entradas do mês', U.money(mt.income),
        prev ? cmp(mt.income, prev.income) : 'Primeiro mês registrado.') +

      kpi('Saídas do mês', U.money(mt.expense),
        prev ? cmp(mt.expense, prev.expense, true) : 'Primeiro mês registrado.',
        null,
        ritmoDoMes(mt.expense, prev ? prev.expense : 0, fracMes)) +

      kpi('Quanto sobrou', savingRate === null ? '—' : U.money(mt.net),
        savingRate === null
          ? 'Nenhuma receita registrada ainda neste mês.'
          : 'De cada R$ 100 que entraram, você guardou <b>R$ ' +
          Math.max(0, Math.round(savingRate * 100)) + '</b>.',
        null,
        savingRate === null ? '' : barraPoupanca(savingRate)) +
      '</div>';

    // Insights
    if (insights.length) {
      html += '<div class="card"><h3>O que merece sua atenção</h3><div class="stack">';
      insights.slice(0, 4).forEach(i => { html += insightCard(i); });
      if (insights.length > 4) {
        html += '<button class="btn ghost" data-act="allinsights">Ver todos os ' + insights.length + ' avisos</button>';
      }
      html += '</div></div>';
    }

    html += '<div class="grid g2">' +
      '<div class="card">' + CHARTS.forecast(fc.points, {
        titulo: 'Quanto você deve ter em caixa',
        explica: 'Próximos 90 dias, já descontando faturas de cartão, parcelas e contas fixas ' +
          'que o sistema reconheceu. A faixa mais clara é a margem de erro: o gasto do dia a dia ' +
          'varia, e fingir precisão aqui seria mentira.'
      }) + '</div>' +
      '<div class="card">' + CHARTS.categoryBars(cats, {
        limit: 7,
        titulo: 'Para onde foi o dinheiro',
        explica: 'Saídas de ' + U.fmtMonth(mk, true) + ', da maior para a menor. Clique numa ' +
          'categoria para ver os lançamentos que a compõem.'
      }) + '</div>' +
      '</div>';

    html += '<div class="card">' + CHARTS.monthlyBars(series, {
      titulo: 'Entradas e saídas, mês a mês',
      explica: 'Doze meses lado a lado. O que importa aqui não é a altura de uma barra isolada, ' +
        'e sim a distância entre a verde e a vermelha: é ela que vira poupança.'
    }) + '</div>';

    html += '<div class="grid g2">' +
      '<div class="card"><h3>Quanto do seu gasto você ainda controla</h3>' +
      '<p class="chart-explica">Compromisso já assumido contra escolha do dia a dia. ' +
      'Só a fatia cinza está sob seu controle neste mês — o resto já estava decidido antes de ele começar.</p>' +
      mixRow('Recorrente (contas fixas e assinaturas)', mix.recorrente, mix.total, 'var(--brass)') +
      mixRow('Parcelado (comprado no passado)', mix.parcelado, mix.total, 'var(--warn)') +
      mixRow('Variável (você decide agora)', mix.variavel, mix.total, 'var(--ink-3)') +
      '</div>' +
      '<div class="card"><h3>Onde você mais gastou este mês</h3>' +
      (function () {
        const tops = INSIGHTS.topMerchants(mk + '-01', U.endOfMonth(mk), 7);
        if (!tops.length) return '<div class="empty-chart">Sem gastos registrados no mês.</div>';
        return '<ul style="list-style:none;margin:0;padding:0">' + tops.map(m =>
          '<li><button class="trow" data-act="searchm" data-q="' + esc(m.name) + '" style="width:100%" ' +
          'aria-label="' + esc(m.name + ', ' + U.money(m.cents) + ' em ' + m.count +
            (m.count > 1 ? ' compras' : ' compra') + '. Ver lançamentos.') + '">' +
          '<span aria-hidden="true"></span><span class="tdate" aria-hidden="true">' + m.count + '×</span>' +
          '<span class="tmain" aria-hidden="true"><span class="tname">' + esc(m.name) + '</span>' +
          '<span class="tmeta">' + esc(ENGINE.categoryLabel(m.categoryId)) + '</span></span>' +
          '<span class="tamt neg" aria-hidden="true">' + U.money(m.cents) + '</span>' +
          '<span aria-hidden="true"></span></button></li>').join('') + '</ul>';
      })() + '</div>' +
      '</div>';

    // Cartões
    if (data.cards.length) {
      html += '<div class="card"><h3>Cartões</h3>' +
        '<p class="chart-explica">O valor grande é o que já está comprometido: fatura aberta mais ' +
        'faturas fechadas ainda não pagas.</p>' +
        '<div class="grid g3">' +
        data.cards.map(c => {
          const s = ENGINE.cardSummary(c);
          const devido = s.openCents + s.unpaidCents;
          const rotulo = c.name + ': ' + U.money(devido) + ' comprometido' +
            (s.nextDue ? ', vence em ' + U.fmtDate(s.nextDue) : '') +
            (s.usedPct !== null ? ', ' + U.pct(s.usedPct, 0) + ' do limite usado' : '') +
            '. Ver detalhes do cartão.';
          return '<button class="card flat" data-nav="cartoes" style="align-items:flex-start" ' +
            'aria-label="' + esc(rotulo) + '">' +
            '<span class="lbl" aria-hidden="true">' + esc(c.name) + '</span>' +
            '<span class="num" style="font-size:1.1rem" aria-hidden="true">' + U.money(devido) + '</span>' +
            '<span class="muted" style="font-size:.74rem" aria-hidden="true">' +
            (s.nextDue ? 'vence ' + U.fmtDate(s.nextDue) : 'vencimento ainda não definido') +
            (s.committedCents ? ' · ' + U.moneyShort(s.committedCents) + ' em parcelas futuras' : '') + '</span>' +
            (s.usedPct !== null ? '<span class="prog" aria-hidden="true"><i style="width:' +
              (s.usedPct * 100).toFixed(0) + '%;background:' +
              (s.usedPct > 0.8 ? 'var(--neg)' : 'var(--brass)') + '"></i></span>' : '') +
            '</button>';
        }).join('') + '</div></div>';
    }

    root.innerHTML = html;
    wireCategoryBars(root);
  };

  function kpi(label, value, detail, spark, contexto) {
    return '<div class="kpi"><span class="lbl">' + esc(label) + '</span>' +
      '<span class="v">' + value + '</span>' +
      '<span class="d">' + (detail || '') + '</span>' +
      (contexto ? '<span class="ctx">' + contexto + '</span>' : '') +
      (spark || '') + '</div>';
  }

  // A frase de abertura do painel. Diz o que importa antes de qualquer
  // gráfico: sobrou ou faltou dinheiro, e há algo à vista para se preocupar.
  function resumoDoMes(mt, taxa, fc, mk) {
    const mes = U.fmtMonth(mk, true);
    let s;
    if (!mt.income && !mt.expense) {
      return 'Ainda não há movimento registrado em ' + mes + '. Importe o extrato para ver o resumo.';
    }
    if (mt.net > 0) {
      s = 'Em ' + mes + ' entraram <b>' + U.money(mt.income) + '</b> e saíram <b>' +
        U.money(mt.expense) + '</b>. Sobrou <b>' + U.money(mt.net) + '</b>' +
        (taxa ? ', ou seja ' + U.pct(taxa, 0) + ' do que você recebeu' : '') + '.';
    } else {
      s = 'Em ' + mes + ' você gastou <b>' + U.money(Math.abs(mt.net)) + ' a mais</b> do que recebeu: ' +
        'entraram ' + U.money(mt.income) + ' e saíram ' + U.money(mt.expense) + '.';
    }
    if (fc && fc.firstNegativeP50) {
      s += ' <b>Atenção:</b> pelo ritmo atual o saldo fica negativo em ' +
        U.fmtDate(fc.firstNegativeP50.date) + '.';
    }
    return s;
  }

  // Projeta o gasto do mês pelo ritmo até agora e compara com o mês
  // anterior — a comparação bruta no meio do mês sempre parece boa.
  function ritmoDoMes(gastoAtual, gastoAnterior, fracMes) {
    if (!gastoAtual || fracMes >= 0.98) return '';
    const projetado = gastoAtual / Math.max(fracMes, 0.1);
    let txt = 'No ritmo atual, fecha o mês em torno de <b>' + U.money(projetado) + '</b>';
    if (gastoAnterior > 0) {
      const dif = (projetado - gastoAnterior) / gastoAnterior;
      if (Math.abs(dif) >= 0.08) {
        txt += ' — ' + U.pct(Math.abs(dif), 0) + (dif > 0 ? ' acima' : ' abaixo') + ' do mês passado';
      }
    }
    return txt + '.';
  }

  // Barra com marca de referência: 20% é a folga que a maioria dos
  // materiais de educação financeira usa como piso saudável.
  function barraPoupanca(taxa) {
    const alvo = 0.2;
    const frac = Math.max(0, Math.min(1, taxa / 0.5));
    const cor = taxa >= alvo ? 'var(--pos)' : taxa > 0 ? 'var(--warn)' : 'var(--neg)';
    return '<span class="barra" aria-hidden="true">' +
      '<i style="width:' + (frac * 100).toFixed(0) + '%;background:' + cor + '"></i>' +
      '<span class="marca" style="left:' + ((alvo / 0.5) * 100).toFixed(0) + '%"></span></span>' +
      '<span>marca de 20%</span>';
  }

  function cmp(now, before, inverse) {
    if (!before) return 'sem comparação com o mês anterior';
    const delta = (now - before) / before;
    const up = delta > 0;
    const good = inverse ? !up : up;
    const cls = Math.abs(delta) < 0.02 ? 'muted' : (good ? 'pos' : 'neg');
    return '<span class="' + cls + '">' + (up ? '▲' : '▼') + ' ' + U.pct(Math.abs(delta), 0) +
      '</span> vs. mês anterior';
  }

  function mixRow(label, cents, total, color) {
    const pct = total ? cents / total : 0;
    return '<div class="catbar"><span class="catbar-head">' +
      '<span class="catbar-name"><i style="background:' + color + '"></i>' + label + '</span>' +
      '<span class="catbar-val">' + U.money(cents) + '</span></span>' +
      '<span class="catbar-track"><i style="width:' + (pct * 100).toFixed(1) + '%;background:' + color + '"></i></span>' +
      '<span class="catbar-sub">' + U.pct(pct, 0) + ' das saídas</span></div>';
  }

  function insightCard(i) {
    const cls = i.severity === 'alta' ? 'bad' : i.severity === 'media' ? 'warn' :
      i.severity === 'destaque' ? 'good' : '';
    return '<div class="note ' + cls + '">' +
      '<div style="display:flex;justify-content:space-between;gap:.5rem;align-items:baseline">' +
      '<b>' + esc(i.title) + '</b>' +
      '<button class="btn sm ghost" data-act="dismiss" data-id="' + esc(i.id) + '" title="Não mostrar mais">✕</button>' +
      '</div>' +
      '<div style="font-size:.82rem;margin-top:.15rem">' + esc(i.detail) + '</div>' +
      (i.action ? '<div style="margin-top:.4rem"><button class="btn sm" data-act="insightgo" ' +
        'data-payload="' + esc(JSON.stringify(i.action)) + '">Ver lançamentos →</button></div>' : '') +
      '</div>';
  }

  function wireCategoryBars(root) {
    root.querySelectorAll('.catbar[data-cat]').forEach(b => {
      b.onclick = () => UI.go('transacoes', { category: b.dataset.cat, month: U.monthKey(U.today()) });
    });
  }

  UI.actions.searchm = function (el) { UI.go('transacoes', { search: el.dataset.q }); };
  UI.actions.dismiss = function (el) {
    d().dismissedInsights.push(el.dataset.id);
    DB.save(); UI.render();
  };
  UI.actions.insightgo = function (el) {
    let a = {};
    try { a = JSON.parse(el.dataset.payload); } catch (e) { }
    UI.go(a.view || 'transacoes', a);
  };
  UI.actions.allinsights = function () {
    const all = INSIGHTS.all();
    UI.modal('<h2>Todos os avisos</h2><div class="stack">' +
      all.map(insightCard).join('') + '</div>' +
      '<div class="modal-foot"><button class="btn" data-x="c">Fechar</button></div>',
      { wide: true, onMount(m) { m.querySelector('[data-x=c]').onclick = UI.closeModal; } });
  };

  /* ════════════════════════ ONBOARDING ═════════════════════════ */

  V.onboarding = function (root) {
    root.innerHTML =
      head('Comece importando um extrato', 'Depois disso, o trabalho é meu.') +
      '<div class="drop" data-act="import">' +
      '<b>Arraste aqui o extrato ou a fatura</b>' +
      '<span>OFX · CSV · XLSX — ou clique para escolher</span>' +
      '<span class="muted" style="font-size:.78rem;max-width:46ch">Eu detecto o banco, crio a conta ou o cartão, ' +
      'evito lançamentos repetidos e classifico tudo sozinho. Você só confirma o que ficar em dúvida.</span>' +
      '</div>' +
      '<div class="card"><h3>Ou busque direto no seu Gmail</h3>' +
      '<div class="muted" style="font-size:.84rem">Se o seu banco manda extrato ou fatura por e-mail, ' +
      'eu procuro sozinho pelos remetentes das instituições e você escolhe o que importar — ' +
      'sem precisar baixar arquivo nenhum.</div>' +
      '<div class="row"><button class="btn" data-act="gmail">✉ Buscar no Gmail</button></div></div>' +
      '<div class="card"><h3>Onde baixar cada arquivo</h3>' +
      '<div class="scrollx"><table class="tbl">' +
      '<thead><tr><th scope="col">Banco</th><th scope="col">Conta corrente</th><th scope="col">Fatura do cartão</th></tr></thead><tbody>' +
      [['Nubank', 'App › Conta › ⋯ › Exportar extrato (OFX ou CSV)', 'App › Cartão › Faturas › Exportar (CSV)'],
      ['Itaú', 'Internet banking › Extrato › Salvar em OFX', 'Fatura › Salvar em OFX'],
      ['Bradesco', 'Extrato › Exportar › OFX (Money 2000)', 'Fatura digital › OFX'],
      ['Banco do Brasil', 'Extrato › Salvar › OFX', 'Fatura Ourocard › OFX'],
      ['Santander', 'Extrato › Exportar › OFX', 'Fatura › OFX'],
      ['Inter', 'App › Extrato › Compartilhar › OFX/CSV', 'App › Cartão › Fatura › CSV'],
      ['C6 Bank', 'App › Extrato › Exportar › OFX', 'App › Cartão › Fatura › CSV'],
      ['Caixa', 'Internet banking › Extrato › Salvar OFX', '—']]
        .map(r => '<tr><td><b>' + r[0] + '</b></td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="muted" style="font-size:.78rem">Prefira sempre <b>OFX</b>: traz identificador único por lançamento, ' +
      'o que torna a deduplicação perfeita. CSV, XLSX e PDF também funcionam — ' +
      'no PDF eu leio o texto direto do arquivo, desde que não seja escaneado nem protegido por senha.</div>' +
      '</div>' +
      '<div class="card"><h3>Já usou o sistema antes?</h3>' +
      '<div class="row"><button class="btn" data-act="import">Restaurar um backup .json</button>' +
      '<button class="btn" data-act="demo">Carregar dados de demonstração</button></div>' +
      '<div class="muted" style="font-size:.78rem">A demonstração cria lançamentos fictícios para você ver como ' +
      'o sistema fica cheio. Dá para apagar tudo depois em Ajustes.</div></div>';
  };

  /* ════════════════════════ REVISAR ════════════════════════════ */

  V.revisar = function (root) {
    const data = d();
    const queue = ENGINE.reviewQueue();
    const provAccounts = data.accounts.filter(a => a.status === 'provisional');
    const provCards = data.cards.filter(c => c.status === 'provisional');
    const total = data.transactions.filter(t => t.status !== 'projected').length;
    const autoPct = total ? (total - queue.length) / total : 1;

    let html = head('Revisar', queue.length || provAccounts.length || provCards.length
      ? 'Cada resposta vira regra: a mesma pergunta não volta.'
      : 'Nada pendente.',
      '<button class="btn" data-act="import">＋ Importar</button>');

    html += '<div class="note ' + (queue.length ? '' : 'good') + '">' +
      '<b>' + U.pct(autoPct, 1) + ' da sua base está classificada automaticamente.</b> ' +
      total.toLocaleString('pt-BR') + ' lançamentos no total' +
      (queue.length ? ' · ' + queue.length + ' aguardando você.' : ' · nada aguardando você.') + '</div>';

    // Contas e cartões recém-detectados
    provAccounts.forEach(a => {
      html += '<div class="reviewcard"><div class="reviewhead">' +
        '<span class="m">Conta detectada: ' + esc(a.name) + '</span>' +
        '<span class="a">' + U.money(ENGINE.accountBalance(a.id)) + '</span></div>' +
        '<div class="muted" style="font-size:.82rem">Encontrada automaticamente no arquivo importado. ' +
        'Confirme para incluí-la no seu patrimônio.</div>' +
        '<div class="row"><button class="btn primary sm" data-act="confirmacct" data-id="' + a.id + '">Confirmar</button>' +
        '<button class="btn sm" data-act="renameacct" data-id="' + a.id + '">Renomear</button>' +
        '<button class="btn sm danger" data-act="delacct" data-id="' + a.id + '">Remover conta e lançamentos</button>' +
        '</div></div>';
    });
    provCards.forEach(c => {
      html += '<div class="reviewcard"><div class="reviewhead">' +
        '<span class="m">Cartão detectado: ' + esc(c.name) + '</span></div>' +
        '<div class="muted" style="font-size:.82rem">Informe limite, dia de fechamento e de vencimento para ' +
        'liberar limite disponível e previsão de faturas.</div>' +
        '<div class="row"><button class="btn primary sm" data-act="editcard" data-id="' + c.id + '">Configurar cartão</button>' +
        '<button class="btn sm" data-act="confirmcard" data-id="' + c.id + '">Confirmar assim mesmo</button>' +
        '</div></div>';
    });

    if (!queue.length && !provAccounts.length && !provCards.length) {
      html += '<div class="empty"><b>Fila vazia</b>' +
        '<span>Nada para confirmar. Importe um novo extrato quando quiser.</span>' +
        '<button class="btn primary" data-act="import">＋ Importar extrato</button></div>';
      root.innerHTML = html;
      return;
    }

    // Agrupa por estabelecimento: uma decisão resolve várias linhas.
    const dups = queue.filter(t => t.possibleDuplicateOf);
    const rest = queue.filter(t => !t.possibleDuplicateOf);
    const groups = U.groupBy(rest, t => t.merchantKey || t.descriptorNorm);
    const ordered = Array.from(groups.entries())
      .sort((a, b) => b[1].length - a[1].length || Math.abs(U.sum(b[1], t => t.amountCents)) - Math.abs(U.sum(a[1], t => t.amountCents)));

    dups.forEach(t => {
      const other = data.transactions.find(x => x.id === t.possibleDuplicateOf);
      html += '<div class="reviewcard dup"><div class="reviewhead">' +
        '<span class="m">Possível cobrança repetida</span>' +
        '<span class="a neg">' + U.money(t.amountCents) + '</span></div>' +
        '<div style="font-size:.85rem">' + esc(t.merchantName || t.descriptorRaw) + ' — ' +
        U.money(Math.abs(t.amountCents)) + ' em ' + U.fmtDate(t.date) +
        (other ? ' e também em ' + U.fmtDate(other.date) : '') + '.</div>' +
        '<div class="row">' +
        '<button class="btn primary sm" data-act="notdup" data-id="' + t.id + '">São compras diferentes</button>' +
        '<button class="btn sm danger" data-act="isdup" data-id="' + t.id + '">É repetida — remover</button>' +
        '</div></div>';
    });

    ordered.slice(0, 40).forEach(([key, list]) => {
      const t = list[0];
      const sugs = UI.suggestions(t);
      const totalCents = U.sum(list, x => x.amountCents);
      html += '<div class="reviewcard" data-group="' + esc(key) + '">' +
        '<div class="reviewhead"><span class="m">' + esc(t.merchantName || t.descriptorRaw || '—') + '</span>' +
        '<span class="a ' + amtClass(totalCents) + '">' + U.money(totalCents) + '</span></div>' +
        '<div class="muted" style="font-size:.78rem">' +
        U.fmtDate(t.date) + ' · ' +
        esc((t.cardId ? (data.cards.find(c => c.id === t.cardId) || {}).name
          : (data.accounts.find(a => a.id === t.accountId) || {}).name) || '') +
        (list.length > 1 ? ' · <b>' + list.length + ' lançamentos semelhantes</b>' : '') +
        ' · confiança ' + (t.categoryConfidence || 0).toFixed(2) +
        '</div>' +
        '<div style="font-family:var(--mono);font-size:.72rem;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        esc(t.descriptorRaw) + '</div>' +
        '<div class="catchips">' +
        sugs.map((c, i) => '<button class="catchip ' + (i === 0 ? 'best' : '') + '" data-act="resolve" ' +
          'data-key="' + esc(key) + '" data-cat="' + c + '">' + esc(ENGINE.categoryLabel(c)) + '</button>').join('') +
        '<button class="catchip" data-act="resolveother" data-key="' + esc(key) + '">outra…</button>' +
        '</div>' +
        '<label class="check"><input type="checkbox" data-retro="' + esc(key) + '"> ' +
        'aplicar também aos lançamentos antigos parecidos</label>' +
        '</div>';
    });

    if (ordered.length > 40) {
      html += '<div class="note">Mostrando 40 grupos de ' + ordered.length + '. Resolva estes e os próximos aparecem.</div>';
    }

    root.innerHTML = html;
  };

  UI.actions.resolve = function (el) {
    const key = el.dataset.key, cat = el.dataset.cat;
    applyResolve(key, cat);
  };
  UI.actions.resolveother = function (el) {
    const key = el.dataset.key;
    UI.pickCategory(cat => applyResolve(key, cat));
  };

  function applyResolve(key, cat) {
    const retroEl = document.querySelector('[data-retro="' + CSS.escape(key) + '"]');
    const retro = retroEl ? retroEl.checked : false;
    const list = ENGINE.reviewQueue().filter(t => (t.merchantKey || t.descriptorNorm) === key);
    if (!list.length) return;
    let n = 0;
    list.forEach((t, i) => {
      n += ENGINE.learn(t, cat, { applySimilar: i === 0, retroactive: retro, createRule: i === 0 });
      t.needsReview = false;
    });
    DB.save();
    UI.toast(n + ' lançamento' + (n > 1 ? 's' : '') + ' em <b>' + esc(ENGINE.categoryLabel(cat)) + '</b>. ' +
      'Não vou mais perguntar sobre isso.', 'good');
    UI.render();
  }

  UI.actions.notdup = function (el) {
    const t = d().transactions.find(x => x.id === el.dataset.id);
    if (!t) return;
    delete t.possibleDuplicateOf;
    t.needsReview = (t.categoryConfidence || 0) < (d().settings.reviewThreshold || 0.62);
    DB.save(); UI.render();
  };
  UI.actions.isdup = function (el) {
    const data = d();
    const i = data.transactions.findIndex(x => x.id === el.dataset.id);
    if (i < 0) return;
    data.transactions.splice(i, 1);
    DB.save(); UI.toast('Lançamento repetido removido.'); UI.render();
  };
  UI.actions.confirmacct = function (el) {
    const a = d().accounts.find(x => x.id === el.dataset.id);
    if (a) { a.status = 'active'; DB.save(); UI.render(); }
  };
  UI.actions.confirmcard = function (el) {
    const c = d().cards.find(x => x.id === el.dataset.id);
    if (c) { c.status = 'active'; DB.save(); UI.render(); }
  };
  UI.actions.renameacct = function (el) {
    const a = d().accounts.find(x => x.id === el.dataset.id);
    if (!a) return;
    UI.modal('<h2>Renomear conta</h2><label class="field">Nome<input type="text" id="nm" value="' +
      esc(a.name) + '"></label><div class="modal-foot"><button class="btn" data-x="c">Cancelar</button>' +
      '<button class="btn primary" data-x="ok">Salvar</button></div>', {
      onMount(m) {
        m.querySelector('[data-x=c]').onclick = UI.closeModal;
        m.querySelector('[data-x=ok]').onclick = () => {
          a.name = m.querySelector('#nm').value.trim() || a.name;
          a.status = 'active';
          DB.save(); UI.closeModal(); UI.render();
        };
      }
    });
  };
  UI.actions.delacct = function (el) {
    const a = d().accounts.find(x => x.id === el.dataset.id);
    if (!a) return;
    UI.confirm('Remover conta?', 'Isto apaga <b>' + esc(a.name) + '</b> e todos os lançamentos dela. Não tem desfazer.',
      () => {
        const data = d();
        data.transactions = data.transactions.filter(t => t.accountId !== a.id);
        data.accounts = data.accounts.filter(x => x.id !== a.id);
        ENGINE.detectRecurrences();
        DB.save(); UI.render();
      }, 'Remover');
  };

  /* ════════════════════════ LANÇAMENTOS ════════════════════════ */

  V.transacoes = function (root) {
    const data = d();
    const f = UI.state.filters;
    const q = U.stripAccents(UI.state.search || '').toUpperCase();

    let list = data.transactions.filter(t => {
      if (t.status === 'projected') return false;
      if (f.onlyReview && !t.needsReview) return false;
      if (f.accountId && t.accountId !== f.accountId) return false;
      if (f.cardId && t.cardId !== f.cardId) return false;
      if (f.categoryId) {
        const p = ENGINE.categoryParent(t.categoryId);
        if (t.categoryId !== f.categoryId && (!p || p.id !== f.categoryId)) return false;
      }
      if (f.from && t.date < f.from) return false;
      if (f.to && t.date > f.to) return false;
      if (f.min && Math.abs(t.amountCents) < U.parseMoney(f.min)) return false;
      if (f.max && Math.abs(t.amountCents) > U.parseMoney(f.max)) return false;
      if (q) {
        const hay = (t.descriptorNorm + ' ' + (t.merchantName || '') + ' ' +
          ENGINE.categoryLabel(t.categoryId) + ' ' + (t.tags || []).join(' ')).toUpperCase();
        const nq = U.stripAccents(hay);
        if (!nq.includes(q)) {
          // tolera erro de digitação em busca curta
          if (q.length < 4 || U.similarity(q, U.merchantKey(t.descriptorNorm)) < 0.55) return false;
        }
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

    const income = U.sum(list.filter(t => t.amountCents > 0 && !t.isTransfer), t => t.amountCents);
    const expense = Math.abs(U.sum(list.filter(t => t.amountCents < 0 && !t.isTransfer), t => t.amountCents));

    let html = head('Lançamentos',
      list.length.toLocaleString('pt-BR') + ' resultados · entradas ' + U.money(income) +
      ' · saídas ' + U.money(expense),
      '<button class="btn" data-act="exportcsv">↓ Exportar CSV</button>' +
      '<button class="btn primary" data-act="import">＋ Importar</button>');

    html += '<div class="card"><div class="grid g3">' +
      '<label class="field">Buscar<input type="search" id="fq" value="' + esc(UI.state.search) +
      '" placeholder="estabelecimento, categoria, etiqueta…"></label>' +
      '<label class="field">Conta<select id="facc"><option value="">Todas</option>' +
      data.accounts.map(a => '<option value="' + a.id + '"' + (f.accountId === a.id ? ' selected' : '') + '>' +
        esc(a.name) + '</option>').join('') + '</select></label>' +
      '<label class="field">Cartão<select id="fcard"><option value="">Todos</option>' +
      data.cards.map(c => '<option value="' + c.id + '"' + (f.cardId === c.id ? ' selected' : '') + '>' +
        esc(c.name) + '</option>').join('') + '</select></label>' +
      '<label class="field">Categoria<select id="fcat"><option value="">Todas</option>' +
      data.categories.filter(c => !c.parentId).map(c =>
        '<option value="' + c.id + '"' + (f.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
      data.categories.filter(c => c.parentId).map(c =>
        '<option value="' + c.id + '"' + (f.categoryId === c.id ? ' selected' : '') + '>&nbsp;&nbsp;' +
        esc(ENGINE.categoryLabel(c.id)) + '</option>').join('') +
      '</select></label>' +
      '<label class="field">De<input type="date" id="ffrom" value="' + esc(f.from) + '"></label>' +
      '<label class="field">Até<input type="date" id="fto" value="' + esc(f.to) + '"></label>' +
      '<label class="field">Valor mínimo<input type="text" id="fmin" value="' + esc(f.min) + '" placeholder="R$"></label>' +
      '<label class="field">Valor máximo<input type="text" id="fmax" value="' + esc(f.max) + '" placeholder="R$"></label>' +
      '</div>' +
      '<div class="row"><label class="check"><input type="checkbox" id="fonlyrev"' + (f.onlyReview ? ' checked' : '') +
      '> só os que precisam de revisão</label>' +
      '<span class="spacer" style="flex:1"></span>' +
      '<button class="btn sm" data-act="clearfilters">Limpar filtros</button>' +
      '<button class="btn sm" data-act="savedview">Salvar esta visão</button></div></div>';

    if ((data.savedViews || []).length) {
      html += '<div class="row">' + data.savedViews.map((v, i) =>
        '<button class="pill brass" data-act="loadview" data-i="' + i + '">' + esc(v.name) +
        ' <span data-act="delview" data-i="' + i + '">✕</span></button>').join('') + '</div>';
    }

    const shown = list.slice(0, UI.state.page);
    html += '<div class="card" style="padding:.4rem"><div class="feed">' +
      '<div class="trow" style="border-bottom:1px solid var(--rule)">' +
      '<input type="checkbox" id="selall"><span class="tdate lbl">data</span>' +
      '<span class="tmain lbl">lançamento</span><span class="tamt lbl">valor</span><span></span></div>' +
      (shown.length ? shown.map(t => txRow(t, { selectable: true })).join('')
        : '<div class="empty-chart">Nenhum lançamento com esses filtros.</div>') +
      '</div>' +
      (list.length > shown.length ?
        '<button class="btn ghost" data-act="more" style="width:100%;justify-content:center">' +
        'Mostrar mais (' + (list.length - shown.length).toLocaleString('pt-BR') + ' restantes)</button>' : '') +
      '</div>';

    if (UI.state.selection.size) {
      html += '<div class="bulkbar"><b>' + UI.state.selection.size + ' selecionados</b>' +
        '<button class="btn sm primary" data-act="bulkcat">Categorizar</button>' +
        '<button class="btn sm" data-act="bulktransfer">Marcar como transferência</button>' +
        '<button class="btn sm" data-act="bulkhide">Ocultar dos relatórios</button>' +
        '<button class="btn sm danger" data-act="bulkdel">Excluir</button>' +
        '<button class="btn sm ghost" data-act="bulkclear">Limpar seleção</button></div>';
    }

    root.innerHTML = html;
    wireFilters(root, list);
  };

  function wireFilters(root, list) {
    const f = UI.state.filters;
    const apply = U.debounce(() => UI.render(), 260);
    const q = root.querySelector('#fq');
    if (q) {
      q.oninput = () => { UI.state.search = q.value; UI.state.page = 200; apply(); };
      q.onkeydown = e => { if (e.key === 'Enter') { UI.state.search = q.value; UI.render(); } };
    }
    const bind = (id, key, isNum) => {
      const el = root.querySelector(id);
      if (!el) return;
      el.onchange = () => { f[key] = el.value; UI.state.page = 200; UI.render(); };
    };
    bind('#facc', 'accountId'); bind('#fcard', 'cardId'); bind('#fcat', 'categoryId');
    bind('#ffrom', 'from'); bind('#fto', 'to');
    ['#fmin', '#fmax'].forEach((id, i) => {
      const el = root.querySelector(id);
      if (el) el.onchange = () => { f[i ? 'max' : 'min'] = el.value; UI.render(); };
    });
    const orv = root.querySelector('#fonlyrev');
    if (orv) orv.onchange = () => { f.onlyReview = orv.checked; UI.render(); };

    const selall = root.querySelector('#selall');
    if (selall) selall.onchange = () => {
      if (selall.checked) list.slice(0, UI.state.page).forEach(t => UI.state.selection.add(t.id));
      else UI.state.selection.clear();
      UI.render();
    };
    root.querySelectorAll('[data-selecttx]').forEach(cb => {
      cb.onchange = () => {
        const id = cb.dataset.selecttx;
        if (cb.checked) UI.state.selection.add(id); else UI.state.selection.delete(id);
        UI.render();
      };
    });
  }

  UI.actions.more = function () { UI.state.page += 300; UI.render(); };
  UI.actions.clearfilters = function () {
    UI.state.filters = { accountId: '', cardId: '', categoryId: '', from: '', to: '', min: '', max: '', onlyReview: false };
    UI.state.search = '';
    UI.render();
  };
  UI.actions.bulkclear = function () { UI.state.selection.clear(); UI.render(); };
  UI.actions.bulkcat = function () {
    UI.pickCategory(cat => {
      let n = 0;
      d().transactions.forEach(t => {
        if (!UI.state.selection.has(t.id)) return;
        ENGINE.learn(t, cat, {});
        t.needsReview = false;
        n++;
      });
      UI.state.selection.clear();
      DB.save();
      UI.toast(n + ' lançamentos categorizados como <b>' + esc(ENGINE.categoryLabel(cat)) + '</b>.', 'good');
      UI.render();
    });
  };
  UI.actions.bulktransfer = function () {
    d().transactions.forEach(t => {
      if (!UI.state.selection.has(t.id)) return;
      ENGINE.learn(t, 'transferencias.entre-contas', {});
      t.needsReview = false;
    });
    UI.state.selection.clear(); DB.save(); UI.render();
  };
  UI.actions.bulkhide = function () {
    d().transactions.forEach(t => { if (UI.state.selection.has(t.id)) t.hidden = !t.hidden; });
    UI.state.selection.clear(); DB.save(); UI.render();
  };
  UI.actions.bulkdel = function () {
    const n = UI.state.selection.size;
    UI.confirm('Excluir ' + n + ' lançamentos?', 'Eles somem do sistema. Se estiverem no extrato, voltam na próxima importação.',
      () => {
        const data = d();
        data.transactions = data.transactions.filter(t => !UI.state.selection.has(t.id));
        UI.state.selection.clear();
        DB.save(); UI.render();
      }, 'Excluir');
  };

  UI.actions.editcat = function (el) {
    const t = d().transactions.find(x => x.id === el.dataset.id);
    if (!t) return;
    UI.pickCategory(cat => {
      const n = ENGINE.learn(t, cat, { applySimilar: true, createRule: false });
      t.needsReview = false;
      DB.save();
      UI.toast(n > 1 ? n + ' lançamentos atualizados (os semelhantes também).' : 'Categoria atualizada.', 'good');
      UI.render();
    }, t.categoryId);
  };

  UI.actions.txdetail = function (el) {
    const t = d().transactions.find(x => x.id === el.dataset.id);
    if (!t) return;
    const data = d();
    const owner = t.cardId ? (data.cards.find(c => c.id === t.cardId) || {}).name
      : (data.accounts.find(a => a.id === t.accountId) || {}).name;
    const plan = t.installmentPlanId ? data.installmentPlans.find(p => p.id === t.installmentPlanId) : null;

    UI.modal('<h2>' + esc(t.merchantName || 'Lançamento') + '</h2>' +
      '<div class="grid g2">' +
      det('Valor', '<span class="num ' + amtClass(t.amountCents) + '">' + U.money(t.amountCents, { signed: true }) + '</span>') +
      det('Data (competência)', U.fmtDate(t.date)) +
      det('Data de caixa', U.fmtDate(t.cashDate || t.date)) +
      det('Onde', esc(owner || '—')) +
      det('Categoria', esc(ENGINE.categoryLabel(t.categoryId))) +
      det('Origem da categoria', esc(sourceLabel(t.categorySource)) + ' · confiança ' + (t.categoryConfidence || 0).toFixed(2)) +
      det('Meio de pagamento', esc(t.method || '—')) +
      det('Parcela', t.installmentTotal ? t.installmentNo + ' de ' + t.installmentTotal : '—') +
      '</div>' +
      '<div class="lbl" style="margin-top:.8rem">descritor original do banco</div>' +
      '<div style="font-family:var(--mono);font-size:.78rem;background:var(--sunken);padding:.5rem;border-radius:6px;word-break:break-all">' +
      esc(t.descriptorRaw) + '</div>' +
      (plan ? '<div class="note" style="margin-top:.6rem"><b>Plano de parcelamento:</b> ' +
        plan.total + '× ' + U.money(plan.installmentCents) + ' desde ' + U.fmtDate(plan.firstDate) +
        ' · faltam ' + U.money(ENGINE.planRemaining(plan)) + '</div>' : '') +
      '<label class="field" style="margin-top:.6rem">Anotação<textarea id="nt" rows="2">' + esc(t.notes || '') + '</textarea></label>' +
      '<label class="field">Etiquetas (separadas por vírgula)<input type="text" id="tg" value="' +
      esc((t.tags || []).join(', ')) + '"></label>' +
      '<div class="modal-foot">' +
      '<button class="btn danger" data-x="del">Excluir</button>' +
      '<button class="btn" data-x="cat">Mudar categoria</button>' +
      '<button class="btn primary" data-x="save">Salvar</button></div>',
      {
        wide: true,
        onMount(m) {
          m.querySelector('[data-x=save]').onclick = () => {
            t.notes = m.querySelector('#nt').value;
            t.tags = m.querySelector('#tg').value.split(',').map(s => s.trim()).filter(Boolean);
            DB.save(); UI.closeModal(); UI.render();
          };
          m.querySelector('[data-x=cat]').onclick = () => {
            UI.closeModal();
            UI.pickCategory(cat => { ENGINE.learn(t, cat, { applySimilar: true }); t.needsReview = false; DB.save(); UI.render(); }, t.categoryId);
          };
          m.querySelector('[data-x=del]').onclick = () => {
            UI.closeModal();
            UI.confirm('Excluir lançamento?', 'Ele volta na próxima importação se estiver no extrato.', () => {
              const data2 = d();
              data2.transactions = data2.transactions.filter(x => x.id !== t.id);
              DB.save(); UI.render();
            }, 'Excluir');
          };
        }
      });
  };

  function det(label, value) {
    return '<div><div class="lbl">' + esc(label) + '</div><div style="font-size:.9rem">' + value + '</div></div>';
  }
  function sourceLabel(s) {
    return ({
      user: 'você definiu', rule: 'regra sua', merchant: 'aprendido do estabelecimento',
      seed: 'regra do sistema', knn: 'semelhança com seus lançamentos',
      heuristic: 'heurística', link: 'conciliação', plan: 'parcelamento',
      recurrence: 'recorrência', none: 'não classificado'
    })[s] || s || '—';
  }

  UI.actions.exportcsv = function () {
    const rows = [['Data', 'Data de caixa', 'Estabelecimento', 'Descritor original', 'Categoria',
      'Valor', 'Conta/Cartão', 'Parcela', 'Transferência', 'Etiquetas']];
    const data = d();
    data.transactions.filter(t => t.status !== 'projected')
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(t => {
        const owner = t.cardId ? (data.cards.find(c => c.id === t.cardId) || {}).name
          : (data.accounts.find(a => a.id === t.accountId) || {}).name;
        rows.push([
          U.fmtDate(t.date), U.fmtDate(t.cashDate || t.date),
          t.merchantName || '', t.descriptorRaw || '',
          ENGINE.categoryLabel(t.categoryId),
          (t.amountCents / 100).toFixed(2).replace('.', ','),
          owner || '',
          t.installmentTotal ? t.installmentNo + '/' + t.installmentTotal : '',
          t.isTransfer ? 'sim' : 'não',
          (t.tags || []).join(' ')
        ]);
      });
    const csv = '﻿' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    U.download('lancamentos-' + U.today() + '.csv', csv, 'text/csv;charset=utf-8');
    UI.toast('CSV exportado (abre direto no Excel).', 'good');
  };

  UI.actions.savedview = function () {
    const name = prompt('Nome desta visão:');
    if (!name) return;
    d().savedViews = d().savedViews || [];
    d().savedViews.push({ name, filters: JSON.parse(JSON.stringify(UI.state.filters)), search: UI.state.search });
    DB.save(); UI.render();
  };
  UI.actions.loadview = function (el) {
    const v = (d().savedViews || [])[+el.dataset.i];
    if (!v) return;
    UI.state.filters = JSON.parse(JSON.stringify(v.filters));
    UI.state.search = v.search || '';
    UI.render();
  };
  UI.actions.delview = function (el, e) {
    e.stopPropagation();
    (d().savedViews || []).splice(+el.dataset.i, 1);
    DB.save(); UI.render();
  };

  global.__views1 = true;
})(window);
