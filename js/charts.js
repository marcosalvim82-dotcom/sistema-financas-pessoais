/* ══════════════════════════════════════════════════════════════════
   charts.js — gráficos em SVG, sem dependência externa.

   Três princípios que governam este arquivo:

   1. Cor nunca é a única codificação. Toda série tem rótulo em texto,
      e todo gráfico traz os números exatos numa tabela sob demanda.
   2. Um eixo só. Nunca duas escalas no mesmo desenho — é a forma mais
      comum de mentir com gráfico sem perceber.
   3. Um gráfico na tela é interativo por natureza: passar o ponteiro
      mostra o valor. Ler posição de barra não deveria ser exigido de
      ninguém.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const C = {};
  let seq = 0;

  function idNovo() { return 'g' + (++seq) + Date.now().toString(36).slice(-4); }

  function svgAbre(w, h, cls, idTitulo, idDesc) {
    return '<svg class="chart ' + (cls || '') + '" viewBox="0 0 ' + w + ' ' + h + '" ' +
      'preserveAspectRatio="none" role="img" aria-labelledby="' + idTitulo + ' ' + idDesc + '">';
  }

  // Barra com topo arredondado e base reta, ancorada na linha de base.
  function barra(x, y, w, h, r) {
    r = Math.min(r === undefined ? 4 : r, w / 2, Math.max(h, 0.1));
    if (h <= 0.5) return '';
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) +
      'q0,' + (-r) + ' ' + r + ',' + (-r) + 'h' + (w - 2 * r) +
      'q' + r + ',0 ' + r + ',' + r + 'V' + (y + h) + 'Z';
  }

  /* ═══════════ Moldura comum: título, explicação, dados ════════ */

  // Envolve o desenho com o que o torna compreensível: uma frase em
  // português dizendo o que ele mostra, e a tabela com os números.
  function moldura(o) {
    const idT = idNovo(), idD = idNovo();
    let html = '<div class="chart-wrap">';
    if (o.titulo) {
      html += '<div class="chart-head"><h3 id="' + idT + '">' + U.esc(o.titulo) + '</h3>' +
        (o.acao || '') + '</div>';
    }
    if (o.explica) html += '<p class="chart-explica" id="' + idD + '">' + o.explica + '</p>';
    else html += '<span class="sr-only" id="' + idD + '">' + U.esc(o.descricao || '') + '</span>';
    if (o.legenda) html += '<div class="chart-legend">' + o.legenda + '</div>';

    html += '<div class="chart-box"' +
      (o.pontos ? ' data-tip="' + U.esc(JSON.stringify(o.pontos)) + '"' : '') +
      (o.tipoTip ? ' data-tiptipo="' + o.tipoTip + '"' : '') + '>' +
      o.svg(idT, idD) +
      (o.pontos ? '<div class="chart-tip" aria-hidden="true"></div>' : '') +
      '</div>';

    if (o.tabela) {
      html += '<details class="chart-dados"><summary>Ver números exatos</summary>' +
        '<div class="scrollx"><table class="tbl"><caption class="sr-only">' +
        U.esc(o.titulo || 'Dados do gráfico') + '</caption><thead><tr>' +
        o.tabela.colunas.map((c, i) => '<th scope="col"' + (i ? ' class="n"' : '') + '>' +
          U.esc(c) + '</th>').join('') +
        '</tr></thead><tbody>' +
        o.tabela.linhas.map(l => '<tr>' +
          l.map((c, i) => i ? '<td class="n">' + c + '</td>'
            : '<th scope="row" style="font-weight:500">' + U.esc(c) + '</th>').join('') +
          '</tr>').join('') +
        '</tbody></table></div></details>';
    }
    return html + '</div>';
  }
  C.moldura = moldura;

  /* ═══════════ Camada de interação (ponteiro e teclado) ════════ */

  C.ativarInteracao = function (raiz) {
    (raiz || document).querySelectorAll('.chart-box[data-tip]').forEach(box => {
      if (box.dataset.ligado) return;
      box.dataset.ligado = '1';

      let pontos;
      try { pontos = JSON.parse(box.dataset.tip); } catch (e) { return; }
      if (!pontos || !pontos.length) return;

      const tip = box.querySelector('.chart-tip');
      const svg = box.querySelector('svg');
      const cursor = svg && svg.querySelector('.chart-cursor');
      if (!tip || !svg) return;

      function mostrar(i, xRel) {
        const p = pontos[i];
        if (!p) return;
        tip.innerHTML = '<b>' + U.esc(p.r) + '</b>' +
          (p.l || []).map(l => '<span class="lin">' +
            '<span>' + (l.c ? '<i style="background:' + l.c + '"></i>' : '') + U.esc(l.n) + '</span>' +
            '<span class="num">' + U.esc(l.v) + '</span></span>').join('');
        tip.classList.add('on');
        const larg = box.clientWidth;
        tip.style.left = Math.max(60, Math.min(larg - 60, xRel)) + 'px';
        tip.style.top = '48%';
        if (cursor) {
          cursor.setAttribute('x1', p.x); cursor.setAttribute('x2', p.x);
          cursor.style.opacity = '.7';
        }
      }

      function esconder() {
        tip.classList.remove('on');
        if (cursor) cursor.style.opacity = '0';
      }

      box.addEventListener('pointermove', e => {
        const cx = box.getBoundingClientRect();
        const rel = e.clientX - cx.left;
        const frac = rel / cx.width;
        const i = Math.max(0, Math.min(pontos.length - 1, Math.round(frac * (pontos.length - 1))));
        mostrar(i, rel);
      });
      box.addEventListener('pointerleave', esconder);

      // Teclado: setas percorrem os pontos, para quem não usa ponteiro.
      box.tabIndex = 0;
      box.setAttribute('role', 'application');
      box.setAttribute('aria-label', 'Gráfico interativo. Use as setas para percorrer os valores.');
      let idx = 0;
      box.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          idx = Math.max(0, Math.min(pontos.length - 1, idx + (e.key === 'ArrowRight' ? 1 : -1)));
          mostrar(idx, (idx / (pontos.length - 1 || 1)) * box.clientWidth);
        } else if (e.key === 'Escape') esconder();
      });
      box.addEventListener('blur', esconder);
    });
  };

  /* ═══════════════ Saldo projetado (linha + banda) ═════════════ */

  C.forecast = function (pontos, opts) {
    opts = opts || {};
    if (!pontos || pontos.length < 2) {
      return '<div class="empty-chart">Sem dados suficientes para projetar. ' +
        'Importe pelo menos um extrato com algumas semanas de movimento.</div>';
    }

    const W = 720, H = 210, padL = 46, padR = 10, padT = 14, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    const lo = Math.min(0, ...pontos.map(p => p.p10));
    const hi = Math.max(...pontos.map(p => p.p90), 1);
    const span = (hi - lo) || 1;
    const px = i => padL + (i / (pontos.length - 1)) * iw;
    const py = v => padT + ih - ((v - lo) / span) * ih;

    const negativo = pontos.find(p => p.p50 < 0);
    const ultimo = pontos[pontos.length - 1];

    const dadosTip = pontos.map((p, i) => ({
      x: px(i).toFixed(1),
      r: U.fmtDate(p.date, 'long'),
      l: [{ n: 'Saldo previsto', v: U.money(p.p50), c: 'var(--brass)' }]
        .concat((p.events || []).slice(0, 3).map(e => ({
          n: e.label, v: U.money(e.amountCents),
          c: e.amountCents < 0 ? 'var(--neg)' : 'var(--pos)'
        })))
    }));

    function desenho(idT, idD) {
      let band = '';
      pontos.forEach((p, i) => { band += (i ? 'L' : 'M') + px(i).toFixed(1) + ',' + py(p.p90).toFixed(1); });
      for (let i = pontos.length - 1; i >= 0; i--) band += 'L' + px(i).toFixed(1) + ',' + py(pontos[i].p10).toFixed(1);
      band += 'Z';

      let linha = '';
      pontos.forEach((p, i) => { linha += (i ? 'L' : 'M') + px(i).toFixed(1) + ',' + py(p.p50).toFixed(1); });

      let s = svgAbre(W, H, 'chart-forecast', idT, idD) +
        '<defs><linearGradient id="fc' + idT + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="var(--brass)" stop-opacity=".20"/>' +
        '<stop offset="100%" stop-color="var(--brass)" stop-opacity=".02"/>' +
        '</linearGradient></defs>';

      // Escala do eixo: sem referência numérica, a linha não diz nada.
      [hi, (hi + lo) / 2, lo].forEach(v => {
        const y = py(v);
        s += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) +
          '" stroke="var(--rule)" stroke-width="1" opacity=".45"/>' +
          '<text x="' + (padL - 6) + '" y="' + (y + 3).toFixed(1) + '" class="eixo-y" text-anchor="end">' +
          U.moneyShort(v) + '</text>';
      });

      if (lo < 0) {
        s += '<line x1="' + padL + '" y1="' + py(0).toFixed(1) + '" x2="' + (W - padR) +
          '" y2="' + py(0).toFixed(1) + '" stroke="var(--neg)" stroke-width="1" stroke-dasharray="3 3"/>';
      }

      s += '<path d="' + band + '" fill="url(#fc' + idT + ')"/>' +
        '<path d="' + linha + '" fill="none" stroke="var(--brass)" stroke-width="2" ' +
        'stroke-linejoin="round" stroke-linecap="round"/>';

      pontos.forEach((p, i) => {
        if (!p.events || !p.events.length) return;
        const maior = p.events.reduce((a, e) => Math.abs(e.amountCents) > Math.abs(a.amountCents) ? e : a, p.events[0]);
        if (Math.abs(maior.amountCents) < 20000) return;
        s += '<circle cx="' + px(i).toFixed(1) + '" cy="' + py(p.p50).toFixed(1) + '" r="3.5" ' +
          'fill="var(--panel)" stroke="' + (maior.amountCents < 0 ? 'var(--neg)' : 'var(--pos)') + '" stroke-width="2"/>';
      });

      s += '<circle cx="' + px(pontos.length - 1).toFixed(1) + '" cy="' + py(ultimo.p50).toFixed(1) +
        '" r="4" fill="var(--brass)"/>';
      s += '<line class="chart-cursor" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + ih) +
        '" style="opacity:0"/>';

      // Primeira e última data, para ancorar o eixo horizontal.
      s += '<text x="' + padL + '" y="' + (H - 6) + '" class="ct-axis">hoje</text>' +
        '<text x="' + (W - padR) + '" y="' + (H - 6) + '" class="ct-axis" text-anchor="end">' +
        U.fmtDate(ultimo.date, 'medium') + '</text>';

      return s + '</svg>';
    }

    // Tabela: um ponto por semana, senão são 90 linhas inúteis.
    const linhasTab = [];
    for (let i = 0; i < pontos.length; i += 7) {
      const p = pontos[i];
      linhasTab.push([U.fmtDate(p.date), U.money(p.p50), U.money(p.p10), U.money(p.p90)]);
    }

    return moldura({
      titulo: opts.titulo,
      explica: opts.explica,
      descricao: 'Saldo projetado para os próximos ' + pontos.length + ' dias. ' +
        'Começa em ' + U.money(pontos[0].p50) + ' e termina em ' + U.money(ultimo.p50) + '. ' +
        (negativo ? 'Fica negativo em ' + U.fmtDate(negativo.date) + '.' : 'Não fica negativo no período.'),
      legenda: '<span><i style="background:var(--brass)"></i>Saldo mais provável</span>' +
        '<span><i style="background:var(--brass);opacity:.25"></i>Faixa de variação</span>' +
        (negativo ? '<span class="chart-alert">Negativo em ' + U.fmtDate(negativo.date) + '</span>' : ''),
      svg: desenho,
      pontos: dadosTip,
      tabela: {
        colunas: ['Data', 'Mais provável', 'Cenário ruim', 'Cenário bom'],
        linhas: linhasTab
      }
    });
  };

  /* ═══════════════ Entradas e saídas por mês ═══════════════════ */

  C.monthlyBars = function (serie, opts) {
    opts = opts || {};
    if (!serie || !serie.length) {
      return '<div class="empty-chart">Importe pelo menos um extrato para ver a evolução mês a mês.</div>';
    }

    const W = 720, H = 200, padL = 46, padR = 10, padT = 12, padB = 26;
    const iw = W - padL - padR, ih = H - padT - padB;
    const max = Math.max(1, ...serie.map(s => Math.max(s.income, s.expense)));
    const vao = iw / serie.length;
    const folga = 2;
    const bw = Math.max(3, (vao - folga * 3) / 2);

    const dadosTip = serie.map((s, i) => ({
      x: (padL + i * vao + vao / 2).toFixed(1),
      r: U.fmtMonth(s.month, true),
      l: [
        { n: 'Entradas', v: U.money(s.income), c: 'var(--pos)' },
        { n: 'Saídas', v: U.money(s.expense), c: 'var(--neg)' },
        { n: 'Sobrou', v: U.money(s.net), c: s.net >= 0 ? 'var(--pos)' : 'var(--neg)' }
      ]
    }));

    function desenho(idT, idD) {
      let s = svgAbre(W, H, 'chart-monthly', idT, idD);

      [max, max / 2, 0].forEach(v => {
        const y = padT + ih - (v / max) * ih;
        s += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) +
          '" stroke="var(--rule)" stroke-width="1" opacity="' + (v === 0 ? '1' : '.45') + '"/>' +
          '<text x="' + (padL - 6) + '" y="' + (y + 3).toFixed(1) + '" class="eixo-y" text-anchor="end">' +
          (v === 0 ? '0' : U.moneyShort(v)) + '</text>';
      });

      serie.forEach((m, i) => {
        const x0 = padL + i * vao + folga;
        const hIn = (m.income / max) * ih;
        const hEx = (m.expense / max) * ih;
        s += '<path d="' + barra(x0, padT + ih - hIn, bw, hIn) + '" fill="var(--pos)"/>';
        s += '<path d="' + barra(x0 + bw + folga, padT + ih - hEx, bw, hEx) + '" fill="var(--neg)"/>';
        // Rótulo a cada dois meses, senão o eixo vira uma mancha.
        if (i % 2 === serie.length % 2) {
          s += '<text x="' + (x0 + bw) + '" y="' + (H - 8) + '" class="ct-axis" text-anchor="middle">' +
            U.fmtMonth(m.month) + '</text>';
        }
      });
      return s + '</svg>';
    }

    const total = serie.reduce((a, s) => ({ i: a.i + s.income, e: a.e + s.expense }), { i: 0, e: 0 });

    return moldura({
      titulo: opts.titulo,
      explica: opts.explica,
      descricao: 'Entradas e saídas nos últimos ' + serie.length + ' meses. ' +
        'No período entraram ' + U.money(total.i) + ' e saíram ' + U.money(total.e) + '.',
      legenda: '<span><i style="background:var(--pos)"></i>Entradas</span>' +
        '<span><i style="background:var(--neg)"></i>Saídas</span>',
      svg: desenho,
      pontos: dadosTip,
      tabela: {
        colunas: ['Mês', 'Entradas', 'Saídas', 'Sobrou'],
        linhas: serie.slice().reverse().map(s => [
          U.fmtMonth(s.month, true), U.money(s.income), U.money(s.expense), U.money(s.net)
        ])
      }
    });
  };

  /* ═══════════════ Gastos por categoria ════════════════════════ */

  C.categoryBars = function (itens, opts) {
    opts = opts || {};
    if (!itens || !itens.length) return '<div class="empty-chart">Nenhum gasto registrado neste período.</div>';

    const total = U.sum(itens, i => i.cents) || 1;
    const mostrar = itens.slice(0, opts.limit || 8);
    const resto = itens.slice(mostrar.length);

    let barras = '<ul class="catbars" style="list-style:none;margin:0;padding:0">';
    mostrar.forEach(it => {
      const frac = it.cents / total;
      const rotulo = it.name + ': ' + U.money(it.cents) + ', ' + U.pct(frac, 0) + ' do total, ' +
        it.count + (it.count > 1 ? ' lançamentos' : ' lançamento');
      barras += '<li><button class="catbar" data-cat="' + U.esc(it.id) + '" ' +
        'aria-label="' + U.esc(rotulo) + '">' +
        '<span class="catbar-head">' +
        '<span class="catbar-name"><i style="background:' + it.color + '" aria-hidden="true"></i>' +
        U.esc(it.name) + '</span>' +
        '<span class="catbar-val">' + U.money(it.cents) + '</span></span>' +
        '<span class="catbar-track" aria-hidden="true"><i style="width:' + (frac * 100).toFixed(1) +
        '%;background:' + it.color + '"></i></span>' +
        '<span class="catbar-sub" aria-hidden="true">' + U.pct(frac, 0) + ' · ' +
        it.count + (it.count > 1 ? ' lançamentos' : ' lançamento') + '</span>' +
        '</button></li>';
    });
    if (resto.length) {
      const soma = U.sum(resto, i => i.cents);
      barras += '<li><div class="catbar catbar-rest"><span class="catbar-head">' +
        '<span class="catbar-name"><i style="background:var(--rule)" aria-hidden="true"></i>' +
        'Outras ' + resto.length + ' categorias</span>' +
        '<span class="catbar-val">' + U.money(soma) + '</span></span></div></li>';
    }
    barras += '</ul>';

    if (!opts.titulo && !opts.explica) return barras;

    return '<div class="chart-wrap">' +
      (opts.titulo ? '<div class="chart-head"><h3>' + U.esc(opts.titulo) + '</h3></div>' : '') +
      (opts.explica ? '<p class="chart-explica">' + opts.explica + '</p>' : '') +
      barras + '</div>';
  };

  /* ═══════════════ Minigráfico ═════════════════════════════════ */

  C.spark = function (valores, opts) {
    opts = opts || {};
    if (!valores || valores.length < 2) return '';
    const W = 120, H = 32;
    const min = Math.min(...valores), max = Math.max(...valores);
    const span = (max - min) || 1;
    const px = i => (i / (valores.length - 1)) * (W - 4) + 2;
    const py = v => H - 3 - ((v - min) / span) * (H - 8);
    let d = '';
    valores.forEach((v, i) => { d += (i ? 'L' : 'M') + px(i).toFixed(1) + ',' + py(v).toFixed(1); });
    const cor = opts.color || 'var(--brass)';
    // Decorativo: o número que ele acompanha já está escrito ao lado.
    return '<svg class="chart chart-spark" viewBox="0 0 ' + W + ' ' + H + '" ' +
      'preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      '<path d="' + d + '" fill="none" stroke="' + cor + '" stroke-width="1.6" ' +
      'stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + px(valores.length - 1).toFixed(1) + '" cy="' + py(valores[valores.length - 1]).toFixed(1) +
      '" r="2.6" fill="' + cor + '"/></svg>';
  };

  /* ═══════════════ Previsão de faturas ═════════════════════════ */

  C.cardForecast = function (barras, opts) {
    opts = opts || {};
    if (!barras || !barras.length) return '<div class="empty-chart">Sem faturas futuras previstas.</div>';

    const W = 460, H = 160, padT = 10, padB = 24, padL = 40, padR = 6;
    const ih = H - padT - padB, iw = W - padL - padR;
    const max = Math.max(1, ...barras.map(b => b.committed + b.estimated));
    const vao = iw / barras.length, folga = 2;
    const bw = Math.max(6, vao - folga * 2);

    const dadosTip = barras.map((b, i) => ({
      x: (padL + i * vao + vao / 2).toFixed(1),
      r: 'Fatura de ' + b.label,
      l: [
        { n: 'Parcelas contratadas', v: U.money(b.committed), c: 'var(--brass)' },
        { n: 'Estimativa variável', v: U.money(b.estimated), c: 'var(--rule)' },
        { n: 'Total previsto', v: U.money(b.committed + b.estimated) }
      ]
    }));

    function desenho(idT, idD) {
      let s = svgAbre(W, H, 'chart-cardfc', idT, idD);
      [max, max / 2, 0].forEach(v => {
        const y = padT + ih - (v / max) * ih;
        s += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) +
          '" stroke="var(--rule)" stroke-width="1" opacity="' + (v === 0 ? '1' : '.4') + '"/>' +
          '<text x="' + (padL - 5) + '" y="' + (y + 3).toFixed(1) + '" class="eixo-y" text-anchor="end">' +
          (v === 0 ? '0' : U.moneyShort(v)) + '</text>';
      });
      barras.forEach((b, i) => {
        const x0 = padL + i * vao + folga;
        const hC = (b.committed / max) * ih;
        const hE = (b.estimated / max) * ih;
        if (hE > 1) s += '<path d="' + barra(x0, padT + ih - hC - hE, bw, Math.max(0, hE - 2)) +
          '" fill="var(--rule)"/>';
        if (hC > 1) s += '<path d="' + barra(x0, padT + ih - hC, bw, hC, hE > 1 ? 0 : 4) +
          '" fill="var(--brass)"/>';
        s += '<text x="' + (x0 + bw / 2) + '" y="' + (H - 8) + '" class="ct-axis" text-anchor="middle">' +
          U.esc(b.label) + '</text>';
      });
      return s + '</svg>';
    }

    return moldura({
      titulo: opts.titulo,
      explica: opts.explica,
      descricao: 'Previsão das próximas ' + barras.length + ' faturas.',
      legenda: '<span><i style="background:var(--brass)"></i>Parcelas já contratadas</span>' +
        '<span><i style="background:var(--rule)"></i>Estimativa de gasto variável</span>',
      svg: desenho,
      pontos: dadosTip,
      tabela: {
        colunas: ['Fatura', 'Parcelas', 'Estimado', 'Total'],
        linhas: barras.map(b => [b.label, U.money(b.committed), U.money(b.estimated),
        U.money(b.committed + b.estimated)])
      }
    });
  };

  /* ═══════════════ Barra de progresso ══════════════════════════ */

  C.progress = function (valor, alvo, opts) {
    opts = opts || {};
    const frac = alvo ? Math.max(0, Math.min(1.4, valor / alvo)) : 0;
    const passou = frac > 1;
    const cor = opts.color || (passou ? 'var(--neg)' : 'var(--pos)');
    return '<span class="prog" role="progressbar" aria-valuenow="' + Math.round(frac * 100) +
      '" aria-valuemin="0" aria-valuemax="100"' +
      (opts.rotulo ? ' aria-label="' + U.esc(opts.rotulo) + '"' : '') + '>' +
      '<i style="width:' + Math.min(100, frac * 100).toFixed(1) + '%;background:' + cor + '"></i></span>';
  };

  global.CHARTS = C;
})(window);
