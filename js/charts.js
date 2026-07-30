/* ══════════════════════════════════════════════════════════════════
   charts.js — gráficos em SVG, sem dependência externa.

   Regras seguidas: um eixo só (nunca dois), marcas finas, grade
   recessiva, extremidade dos dados arredondada e ancorada na linha
   de base, rótulo direto em vez de número em todo ponto, e cor nunca
   como única codificação — toda série tem rótulo em texto ao lado.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const C = {};
  const NS = 'http://www.w3.org/2000/svg';

  function svg(w, h, cls) {
    return '<svg class="chart ' + (cls || '') + '" viewBox="0 0 ' + w + ' ' + h +
      '" preserveAspectRatio="none" role="img">';
  }

  // Caminho de barra com o topo arredondado (4px) e a base reta.
  function barPath(x, y, w, h, r) {
    r = Math.min(r === undefined ? 4 : r, w / 2, Math.max(h, 0.1));
    if (h <= 0.5) return '';
    return 'M' + x + ',' + (y + h) +
      'V' + (y + r) +
      'q0,' + (-r) + ' ' + r + ',' + (-r) +
      'h' + (w - 2 * r) +
      'q' + r + ',0 ' + r + ',' + r +
      'V' + (y + h) + 'Z';
  }

  /* ─────────────── Previsão de caixa: área + banda ─────────────── */
  C.forecast = function (points, opts) {
    opts = opts || {};
    const W = 720, H = 220, padL = 8, padR = 8, padT = 14, padB = 22;
    if (!points || points.length < 2) return '<div class="empty-chart">Sem dados suficientes para projetar.</div>';

    const iw = W - padL - padR, ih = H - padT - padB;
    const lo = Math.min(0, ...points.map(p => p.p10));
    const hi = Math.max(...points.map(p => p.p90), 1);
    const span = (hi - lo) || 1;
    const x = i => padL + (i / (points.length - 1)) * iw;
    const y = v => padT + ih - ((v - lo) / span) * ih;

    let band = 'M' + x(0) + ',' + y(points[0].p90);
    points.forEach((p, i) => { band += 'L' + x(i) + ',' + y(p.p90); });
    for (let i = points.length - 1; i >= 0; i--) band += 'L' + x(i) + ',' + y(points[i].p10);
    band += 'Z';

    let line = '';
    points.forEach((p, i) => { line += (i ? 'L' : 'M') + x(i) + ',' + y(p.p50); });

    const zeroY = y(0);
    let out = svg(W, H, 'chart-forecast') + '<defs>' +
      '<linearGradient id="fcFill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--brass)" stop-opacity=".20"/>' +
      '<stop offset="100%" stop-color="var(--brass)" stop-opacity=".02"/>' +
      '</linearGradient></defs>';

    // Grade recessiva: só a linha do zero e os limites.
    out += '<line x1="' + padL + '" y1="' + zeroY + '" x2="' + (W - padR) + '" y2="' + zeroY +
      '" stroke="var(--neg)" stroke-width="1" stroke-dasharray="3 3" opacity=".55"/>';

    out += '<path d="' + band + '" fill="url(#fcFill)"/>';
    out += '<path d="' + line + '" fill="none" stroke="var(--brass)" stroke-width="2" ' +
      'stroke-linejoin="round" stroke-linecap="round"/>';

    // Marcadores nos dias com evento conhecido (fatura, salário…).
    points.forEach((p, i) => {
      if (!p.events || !p.events.length) return;
      const big = p.events.reduce((a, e) => Math.abs(e.amountCents) > Math.abs(a.amountCents) ? e : a, p.events[0]);
      if (Math.abs(big.amountCents) < 20000) return;
      out += '<circle cx="' + x(i) + '" cy="' + y(p.p50) + '" r="3.5" fill="var(--panel)" ' +
        'stroke="' + (big.amountCents < 0 ? 'var(--neg)' : 'var(--pos)') + '" stroke-width="2">' +
        '<title>' + U.esc(U.fmtDate(p.date) + ' · ' + big.label + ' · ' + U.money(big.amountCents)) + '</title></circle>';
    });

    // Ponto final destacado, com o valor rotulado uma única vez.
    const last = points[points.length - 1];
    out += '<circle cx="' + x(points.length - 1) + '" cy="' + y(last.p50) + '" r="4" fill="var(--brass)"/>';
    out += '</svg>';

    const negPoint = points.find(p => p.p50 < 0);
    return '<div class="chart-wrap">' + out +
      '<div class="chart-foot">' +
      '<span>hoje · ' + U.money(points[0].p50) + '</span>' +
      (negPoint ? '<span class="chart-alert">negativo em ' + U.fmtDate(negPoint.date) + '</span>' : '') +
      '<span>' + U.fmtDate(last.date, 'medium') + ' · ' + U.money(last.p50) + '</span>' +
      '</div></div>';
  };

  /* ─────────────── Receitas × despesas por mês ─────────────────── */
  C.monthlyBars = function (series, opts) {
    opts = opts || {};
    if (!series || !series.length) return '<div class="empty-chart">Importe pelo menos um extrato para ver a evolução.</div>';
    const W = 720, H = 200, padL = 8, padR = 8, padT = 12, padB = 26;
    const iw = W - padL - padR, ih = H - padT - padB;
    const max = Math.max(1, ...series.map(s => Math.max(s.income, s.expense)));
    const slot = iw / series.length;
    const gap = 2;                       // respiro de 2px entre barras vizinhas
    const bw = Math.max(3, (slot - gap * 3) / 2);

    let out = svg(W, H, 'chart-monthly');
    // Grade: apenas a base e uma linha na metade.
    out += '<line x1="' + padL + '" y1="' + (padT + ih / 2) + '" x2="' + (W - padR) + '" y2="' + (padT + ih / 2) +
      '" stroke="var(--rule)" stroke-width="1" opacity=".5"/>';
    out += '<line x1="' + padL + '" y1="' + (padT + ih) + '" x2="' + (W - padR) + '" y2="' + (padT + ih) +
      '" stroke="var(--rule)" stroke-width="1"/>';

    series.forEach((s, i) => {
      const x0 = padL + i * slot + gap;
      const hIn = (s.income / max) * ih;
      const hEx = (s.expense / max) * ih;
      out += '<path d="' + barPath(x0, padT + ih - hIn, bw, hIn) + '" fill="var(--pos)" opacity=".9">' +
        '<title>' + U.esc(U.fmtMonth(s.month, true) + ' · entradas ' + U.money(s.income)) + '</title></path>';
      out += '<path d="' + barPath(x0 + bw + gap, padT + ih - hEx, bw, hEx) + '" fill="var(--neg)" opacity=".9">' +
        '<title>' + U.esc(U.fmtMonth(s.month, true) + ' · saídas ' + U.money(s.expense)) + '</title></path>';
      out += '<text x="' + (x0 + bw) + '" y="' + (H - 8) + '" class="ct-axis" text-anchor="middle">' +
        U.fmtMonth(s.month) + '</text>';
    });
    out += '</svg>';

    return '<div class="chart-wrap">' +
      '<div class="chart-legend"><span><i style="background:var(--pos)"></i>Entradas</span>' +
      '<span><i style="background:var(--neg)"></i>Saídas</span></div>' + out + '</div>';
  };

  /* ─────────────── Gastos por categoria (barras diretas) ───────── */
  C.categoryBars = function (items, opts) {
    opts = opts || {};
    if (!items || !items.length) return '<div class="empty-chart">Nenhum gasto no período.</div>';
    const total = U.sum(items, i => i.cents) || 1;
    const shown = items.slice(0, opts.limit || 8);
    let html = '<div class="catbars">';
    shown.forEach(it => {
      const pct = it.cents / total;
      html += '<button class="catbar" data-cat="' + U.esc(it.id) + '">' +
        '<span class="catbar-head">' +
        '<span class="catbar-name"><i style="background:' + it.color + '"></i>' + U.esc(it.name) + '</span>' +
        '<span class="catbar-val">' + U.money(it.cents) + '</span></span>' +
        '<span class="catbar-track"><i style="width:' + (pct * 100).toFixed(1) + '%;background:' + it.color + '"></i></span>' +
        '<span class="catbar-sub">' + U.pct(pct, 0) + ' · ' + it.count + ' lançamento' + (it.count > 1 ? 's' : '') + '</span>' +
        '</button>';
    });
    if (items.length > shown.length) {
      const rest = U.sum(items.slice(shown.length), i => i.cents);
      html += '<div class="catbar catbar-rest"><span class="catbar-head">' +
        '<span class="catbar-name"><i style="background:var(--rule)"></i>Outras ' +
        (items.length - shown.length) + ' categorias</span>' +
        '<span class="catbar-val">' + U.money(rest) + '</span></span></div>';
    }
    return html + '</div>';
  };

  /* ─────────────── Minigráfico (sparkline) ─────────────────────── */
  C.spark = function (values, opts) {
    opts = opts || {};
    if (!values || values.length < 2) return '';
    const W = 120, H = 32;
    const min = Math.min(...values), max = Math.max(...values);
    const span = (max - min) || 1;
    const x = i => (i / (values.length - 1)) * (W - 4) + 2;
    const y = v => H - 3 - ((v - min) / span) * (H - 8);
    let path = '';
    values.forEach((v, i) => { path += (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); });
    const color = opts.color || 'var(--brass)';
    return svg(W, H, 'chart-spark') +
      '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="1.6" ' +
      'stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + x(values.length - 1).toFixed(1) + '" cy="' + y(values[values.length - 1]).toFixed(1) +
      '" r="2.6" fill="' + color + '"/></svg>';
  };

  /* ─────────────── Previsão de faturas do cartão ───────────────── */
  // Duas partes empilhadas com significados diferentes: o que já está
  // contratado (parcelas) e a estimativa de gasto variável.
  C.cardForecast = function (bars) {
    if (!bars || !bars.length) return '<div class="empty-chart">Sem faturas futuras previstas.</div>';
    const W = 460, H = 150, padT = 10, padB = 22, padL = 4, padR = 4;
    const ih = H - padT - padB, iw = W - padL - padR;
    const max = Math.max(1, ...bars.map(b => b.committed + b.estimated));
    const slot = iw / bars.length, gap = 2;
    const bw = Math.max(6, slot - gap * 2);

    let out = svg(W, H, 'chart-cardfc');
    out += '<line x1="' + padL + '" y1="' + (padT + ih) + '" x2="' + (W - padR) + '" y2="' + (padT + ih) +
      '" stroke="var(--rule)" stroke-width="1"/>';
    bars.forEach((b, i) => {
      const x0 = padL + i * slot + gap;
      const hC = (b.committed / max) * ih;
      const hE = (b.estimated / max) * ih;
      // 2px de respiro entre os segmentos empilhados.
      if (hE > 1) {
        out += '<path d="' + barPath(x0, padT + ih - hC - hE, bw, Math.max(0, hE - 2)) +
          '" fill="var(--rule)">' +
          '<title>' + U.esc(b.label + ' · estimativa variável ' + U.money(b.estimated)) + '</title></path>';
      }
      if (hC > 1) {
        out += '<path d="' + barPath(x0, padT + ih - hC, bw, hC, hE > 1 ? 0 : 4) + '" fill="var(--brass)">' +
          '<title>' + U.esc(b.label + ' · parcelas contratadas ' + U.money(b.committed)) + '</title></path>';
      }
      out += '<text x="' + (x0 + bw / 2) + '" y="' + (H - 8) + '" class="ct-axis" text-anchor="middle">' +
        U.esc(b.label) + '</text>';
    });
    out += '</svg>';
    return '<div class="chart-wrap">' +
      '<div class="chart-legend"><span><i style="background:var(--brass)"></i>Parcelas já contratadas</span>' +
      '<span><i style="background:var(--rule)"></i>Estimativa de gasto variável</span></div>' +
      out + '</div>';
  };

  /* ─────────────── Barra de progresso rotulada ─────────────────── */
  C.progress = function (value, target, opts) {
    opts = opts || {};
    const pct = target ? Math.max(0, Math.min(1.4, value / target)) : 0;
    const over = pct > 1;
    const color = opts.color || (over ? 'var(--neg)' : 'var(--pos)');
    return '<span class="prog"><i style="width:' + Math.min(100, pct * 100).toFixed(1) +
      '%;background:' + color + '"></i></span>';
  };

  global.CHARTS = C;
})(window);
