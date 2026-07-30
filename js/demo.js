/* ══════════════════════════════════════════════════════════════════
   demo.js — gera um conjunto fictício de lançamentos brasileiros
   para você ver o sistema cheio antes de importar seus dados.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const FIXAS = [
    ['ALUGUEL IMOBILIARIA CENTRAL', -285000, 5, 0],
    ['CONDOMINIO EDIFICIO AURORA', -74500, 10, 0.02],
    ['ENEL DISTRIBUICAO SP', -18900, 12, 0.22],
    ['SABESP SANEAMENTO', -9800, 15, 0.15],
    ['VIVO FIBRA INTERNET', -12990, 8, 0],
    ['UNIMED PLANO DE SAUDE', -68000, 20, 0.01],
    ['COLEGIO SAO JUDAS MENSALIDADE', -142000, 7, 0]
  ];

  const ASSINATURAS = [
    ['NETFLIX.COM', -5990, 14],
    ['SPOTIFY BRASIL', -2190, 3],
    ['AMAZON PRIME BR', -1990, 22],
    ['GOOGLE ONE', -990, 18],
    ['SMARTFIT ACADEMIA', -11990, 6],
    ['OPENAI CHATGPT SUBSCR', -11500, 25]
  ];

  const MERCADO = ['CARREFOUR HIPER', 'PAO DE ACUCAR', 'ASSAI ATACADISTA', 'SUPERMERCADO ZAFFARI', 'HORTIFRUTI DA ESQUINA'];
  const COMIDA = ['IFD*IFOOD', 'PG *RESTAURANTE DA MARIA', 'MC DONALDS', 'PADARIA SAO JOAO', 'THE COFFEE', 'OUTBACK STEAKHOUSE'];
  const TRANSPORTE = ['UBER *TRIP', '99 TECNOLOGIA', 'AUTO POSTO IPIRANGA', 'SHELL BOX', 'ESTAPAR ESTACIONAMENTO', 'SEM PARAR PEDAGIO'];
  const COMPRAS = ['MERCADO LIVRE', 'AMAZON BR', 'RENNER LOJAS', 'MAGAZINE LUIZA', 'DROGARIA SAO PAULO', 'PETZ PET SHOP', 'KABUM COMERCIO'];
  const LAZER = ['CINEMARK', 'BAR DO ALEMAO', 'INGRESSO.COM', 'AIRBNB PAYMENTS'];

  function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function vary(base, pct) { return Math.round(base * (1 + (Math.random() * 2 - 1) * pct)); }

  function build(months) {
    const today = U.today();
    const contaRecords = [];
    const cartaoRecords = [];
    let saldo = 480000;

    for (let m = months - 1; m >= 0; m--) {
      const ref = U.addMonths(today, -m);
      const [y, mm] = ref.split('-').map(Number);
      const isLast = m === 0;
      const maxDay = isLast ? +today.split('-')[2] : U.daysInMonth(U.monthKey(ref));

      // Salário
      if (maxDay >= 5) {
        contaRecords.push({
          date: U.clampDay(y, mm, 5),
          amountCents: vary(1180000, 0.02),
          descriptor: 'PAGAMENTO DE SALARIO EMPRESA XYZ LTDA',
          externalId: 'sal' + y + mm
        });
      }
      // Freelance ocasional
      if (Math.random() < 0.35 && maxDay >= 18) {
        contaRecords.push({
          date: U.clampDay(y, mm, 18),
          amountCents: vary(180000, 0.4),
          descriptor: 'PIX RECEBIDO CONSULTORIA ACME',
          externalId: 'fre' + y + mm
        });
      }
      // Contas fixas
      FIXAS.forEach((f, i) => {
        if (f[2] > maxDay) return;
        contaRecords.push({
          date: U.clampDay(y, mm, f[2]),
          amountCents: f[3] ? vary(f[0 + 1], f[3]) : f[1],
          descriptor: (i % 3 === 0 ? 'DEBITO AUTOMATICO ' : 'PAGAMENTO BOLETO ') + f[0],
          externalId: 'fix' + i + y + mm
        });
      });
      // Aporte mensal
      if (maxDay >= 6) {
        contaRecords.push({
          date: U.clampDay(y, mm, 6),
          amountCents: -150000,
          descriptor: 'APLICACAO CDB LIQUIDEZ DIARIA',
          externalId: 'apo' + y + mm
        });
      }
      // Saque
      if (Math.random() < 0.5) {
        contaRecords.push({
          date: U.clampDay(y, mm, Math.min(maxDay, 3 + Math.floor(Math.random() * 20))),
          amountCents: -vary(20000, 0.4),
          descriptor: 'SAQUE BANCO24HORAS',
          externalId: 'saq' + y + mm
        });
      }
      // Tarifa
      contaRecords.push({
        date: U.clampDay(y, mm, Math.min(maxDay, 2)),
        amountCents: -3490,
        descriptor: 'TARIFA CESTA DE SERVICOS',
        externalId: 'tar' + y + mm
      });

      // ── Cartão ──
      ASSINATURAS.forEach((a, i) => {
        if (a[2] > maxDay) return;
        cartaoRecords.push({
          date: U.clampDay(y, mm, a[2]),
          amountCents: a[1],
          descriptor: a[0],
          externalId: 'ass' + i + y + mm
        });
      });

      const nCompras = 22 + Math.floor(Math.random() * 14);
      for (let k = 0; k < nCompras; k++) {
        const day = 1 + Math.floor(Math.random() * maxDay);
        const r = Math.random();
        let desc, cents;
        if (r < 0.24) { desc = rnd(MERCADO); cents = -vary(18000, 0.6); }
        else if (r < 0.5) { desc = rnd(COMIDA); cents = -vary(7000, 0.7); }
        else if (r < 0.68) { desc = rnd(TRANSPORTE); cents = -vary(9000, 0.8); }
        else if (r < 0.86) { desc = rnd(COMPRAS); cents = -vary(16000, 1.1); }
        else { desc = rnd(LAZER); cents = -vary(14000, 0.9); }
        cartaoRecords.push({
          date: U.clampDay(y, mm, day),
          amountCents: cents,
          descriptor: desc,
          externalId: 'c' + y + mm + k
        });
      }

    }

    // Compras parceladas no cartão
    const parceladas = [
      ['MAGAZINE LUIZA NOTEBOOK', 41200, 12, 8],
      ['CVC VIAGENS PACOTE', 28900, 6, 4],
      ['ODONTOCOMPANY TRATAMENTO', 34000, 10, 3]
    ];
    parceladas.forEach((p, pi) => {
      const inicio = U.addMonths(U.today(), -p[3]);
      for (let n = 1; n <= p[2]; n++) {
        const dt = U.addMonths(inicio, n - 1);
        if (dt > U.today()) break;
        cartaoRecords.push({
          date: dt,
          amountCents: -p[1],
          descriptor: p[0] + ' PARC ' + n + '/' + p[2],
          externalId: 'parc' + pi + n
        });
      }
    });

    // Pagamento das faturas, calculado só depois que todas as compras
    // (inclusive as parcelas) existem. O ciclo vai do dia 3 ao dia 2,
    // igual ao que o app vai deduzir do cartão.
    for (let m = months - 2; m >= 0; m--) {
      const ref = U.addMonths(today, -m);
      const [y, mm] = ref.split('-').map(Number);
      const venc = U.clampDay(y, mm, 10);
      if (venc > today) continue;
      const fim = U.clampDay(y, mm, 2);
      const inicio = U.addDays(U.addMonths(fim, -1), 1);
      const total = cartaoRecords
        .filter(r => r.date >= inicio && r.date <= fim)
        .reduce((a, r) => a + r.amountCents, 0);
      if (!total) continue;
      contaRecords.push({
        date: venc,
        amountCents: -Math.abs(total),
        descriptor: 'PAGAMENTO FATURA CARTAO DE CREDITO',
        externalId: 'pag' + y + mm
      });
    }

    contaRecords.sort((a, b) => a.date.localeCompare(b.date));
    cartaoRecords.sort((a, b) => a.date.localeCompare(b.date));
    saldo += contaRecords.reduce((a, r) => a + r.amountCents, 0);

    return { contaRecords, cartaoRecords, saldo };
  }

  UI.actions.demo = async function () {
    UI.confirm('Carregar demonstração?',
      'Vou criar cerca de 10 meses de lançamentos fictícios em duas contas e um cartão, ' +
      'com parcelas, assinaturas e salário — só para você ver o sistema funcionando. ' +
      'Dá para apagar tudo depois em Ajustes.',
      async () => {
        const { contaRecords, cartaoRecords, saldo } = build(10);
        const hoje = U.today();

        const parsedConta = {
          format: 'demo',
          institution: RULES.institutionById('nubank'),
          warnings: [],
          statements: [{
            kind: 'account', bankId: '260', acctId: '00012345678', acctType: 'checking',
            currency: 'BRL', periodStart: contaRecords[0].date, periodEnd: hoje,
            balanceCents: saldo, balanceDate: hoje, records: contaRecords
          }]
        };
        const parsedCartao = {
          format: 'demo',
          institution: RULES.institutionById('nubank'),
          warnings: [],
          statements: [{
            kind: 'card', bankId: '260', acctId: '5432109876544471', acctType: 'creditcard',
            currency: 'BRL', periodStart: cartaoRecords[0].date, periodEnd: hoje,
            balanceCents: null, balanceDate: null, records: cartaoRecords
          }]
        };

        const f1 = new File([JSON.stringify(contaRecords)], 'demo-conta.ofx', { type: 'text/plain' });
        const f2 = new File([JSON.stringify(cartaoRecords)], 'demo-cartao.ofx', { type: 'text/plain' });

        await ENGINE.importParsed(parsedConta, f1, {});
        await ENGINE.importParsed(parsedCartao, f2, {});

        // Configura o cartão para liberar ciclo, limite e previsão.
        const card = DB.data.cards[DB.data.cards.length - 1];
        if (card) {
          card.name = 'Nubank ·4471 (demonstração)';
          card.limitCents = 2000000;
          card.closingDay = 2;
          card.dueDay = 10;
          card.cycleLocked = true;
          card.cycleConfidence = 'alta';
          card.status = 'active';
          card.paymentAccountId = (DB.data.accounts[0] || {}).id || null;
        }
        DB.data.accounts.forEach(a => {
          a.status = 'active';
          if (!a.name.includes('demonstração')) a.name = a.name + ' (demonstração)';
        });
        DB.data.goals.push(
          { id: U.uid(), type: 'emergency_fund', name: 'Reserva de emergência', targetCents: 6000000, targetDate: '' },
          { id: U.uid(), type: 'net_worth', name: 'Patrimônio de R$ 500 mil', targetCents: 50000000, targetDate: '' }
        );
        DB.data.investPositions.push(
          { id: U.uid(), name: 'CDB 110% CDI', assetClass: 'renda-fixa', investedCents: 4200000, currentCents: 4680000, createdAt: new Date().toISOString(), updatedAt: hoje },
          { id: U.uid(), name: 'Carteira de FIIs', assetClass: 'fii', investedCents: 2800000, currentCents: 3010000, createdAt: new Date().toISOString(), updatedAt: hoje },
          { id: U.uid(), name: 'ETF BOVA11', assetClass: 'etf', investedCents: 1500000, currentCents: 1712000, createdAt: new Date().toISOString(), updatedAt: hoje }
        );

        ENGINE.recomputeCardCycles();
        ENGINE.linkTransfers();
        ENGINE.detectRecurrences();
        await DB.flush();
        UI.toast('Demonstração carregada. Explore à vontade — depois apague em Ajustes.', 'good');
        UI.go('painel');
      }, 'Carregar demonstração');
  };

})(window);
