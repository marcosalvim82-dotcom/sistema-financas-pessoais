/* ══════════════════════════════════════════════════════════════════
   rules.js — taxonomia de categorias, regras semeadas para o Brasil
   e assinaturas de instituições financeiras.

   As regras cobrem o que de fato aparece em extratos e faturas
   brasileiras. É isto que faz o sistema já classificar bem no
   primeiro arquivo, antes de aprender qualquer coisa com você.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const R = {};

  /* ── Taxonomia ───────────────────────────────────────────────── */
  // kind: expense | income | transfer | investment | debt
  R.CATEGORIES = [
    ['moradia', 'Moradia', 'expense', '#7C6A46', [
      ['aluguel', 'Aluguel'], ['condominio', 'Condomínio'], ['iptu', 'IPTU'],
      ['energia', 'Energia'], ['agua', 'Água'], ['gas', 'Gás'],
      ['internet', 'Internet e telefone'], ['manutencao', 'Manutenção e reforma'],
      ['financiamento', 'Financiamento imobiliário'], ['seguro', 'Seguro residencial'],
      ['servicos', 'Serviços domésticos']
    ]],
    ['alimentacao', 'Alimentação', 'expense', '#4E7C59', [
      ['supermercado', 'Supermercado'], ['restaurante', 'Restaurante'],
      ['delivery', 'Delivery'], ['padaria', 'Padaria'], ['cafeteria', 'Cafeteria'],
      ['feira', 'Feira e hortifrúti'], ['acougue', 'Açougue'],
      ['bebidas', 'Bebidas'], ['lanche', 'Lanches e fast-food']
    ]],
    ['transporte', 'Transporte', 'expense', '#3F6C8C', [
      ['combustivel', 'Combustível'], ['aplicativo', 'App de mobilidade'],
      ['publico', 'Transporte público'], ['estacionamento', 'Estacionamento'],
      ['pedagio', 'Pedágio'], ['manutencao', 'Manutenção do veículo'],
      ['ipva', 'IPVA e licenciamento'], ['seguro', 'Seguro do veículo'],
      ['financiamento', 'Financiamento do veículo'], ['multas', 'Multas']
    ]],
    ['saude', 'Saúde', 'expense', '#8C5B6E', [
      ['plano', 'Plano de saúde'], ['consultas', 'Consultas'], ['exames', 'Exames'],
      ['farmacia', 'Farmácia'], ['odontologia', 'Odontologia'],
      ['terapia', 'Terapia'], ['academia', 'Academia e esportes'],
      ['oticas', 'Óticas'], ['pet', 'Saúde do pet']
    ]],
    ['educacao', 'Educação', 'expense', '#6B5B95', [
      ['mensalidade', 'Mensalidade'], ['cursos', 'Cursos'], ['livros', 'Livros'],
      ['material', 'Material escolar'], ['idiomas', 'Idiomas'],
      ['pos', 'Pós-graduação']
    ]],
    ['lazer', 'Lazer', 'expense', '#B07500', [
      ['viagens', 'Viagens e passagens'], ['hospedagem', 'Hospedagem'],
      ['bares', 'Bares e baladas'], ['eventos', 'Cinema, shows e eventos'],
      ['hobbies', 'Hobbies'], ['jogos', 'Jogos'], ['esporte', 'Esporte e ar livre']
    ]],
    ['compras', 'Compras', 'expense', '#A8582E', [
      ['vestuario', 'Vestuário'], ['eletronicos', 'Eletrônicos'],
      ['casa', 'Casa e decoração'], ['presentes', 'Presentes'],
      ['beleza', 'Beleza e cuidados'], ['pets', 'Pets'],
      ['livraria', 'Livraria e papelaria'], ['diversos', 'Diversos'],
      ['marketplace', 'Marketplace']
    ]],
    ['assinaturas', 'Assinaturas', 'expense', '#5F7A8C', [
      ['streaming', 'Streaming'], ['software', 'Software'], ['nuvem', 'Nuvem'],
      ['jornais', 'Jornais e revistas'], ['clubes', 'Clubes e associações'],
      ['musica', 'Música'], ['ia', 'Inteligência artificial']
    ]],
    ['impostos', 'Impostos e tarifas', 'expense', '#8A7B4F', [
      ['ir', 'Imposto de renda'], ['darf', 'DARF e DAS'],
      ['tarifa', 'Tarifa bancária'], ['iof', 'IOF'],
      ['anuidade', 'Anuidade de cartão'], ['multas', 'Multas e encargos'],
      ['cartorio', 'Cartório e taxas']
    ]],
    ['emprestimos', 'Empréstimos', 'debt', '#A83A2C', [
      ['parcela', 'Parcela de empréstimo'], ['juros', 'Juros de cheque especial'],
      ['rotativo', 'Rotativo do cartão'], ['consignado', 'Consignado'],
      ['fatura-parcelada', 'Parcelamento de fatura']
    ]],
    ['investimentos', 'Investimentos', 'investment', '#A87B2E', [
      ['renda-fixa', 'Aporte em renda fixa'], ['renda-variavel', 'Aporte em renda variável'],
      ['previdencia', 'Previdência'], ['cripto', 'Criptomoedas'],
      ['resgate', 'Resgate'], ['corretagem', 'Taxas e corretagem']
    ]],
    ['salario', 'Salário', 'income', '#2F7D5A', [
      ['salario', 'Salário'], ['decimo', '13º salário'], ['ferias', 'Férias'],
      ['plr', 'PLR e bônus'], ['prolabore', 'Pró-labore'],
      ['freelance', 'Freelance e autônomo'], ['beneficios', 'Benefícios e vale']
    ]],
    ['dividendos', 'Dividendos e rendimentos', 'income', '#3E8E6B', [
      ['dividendos', 'Dividendos'], ['jcp', 'Juros sobre capital'],
      ['fii', 'Rendimento de FII'], ['juros', 'Juros de renda fixa'],
      ['aluguel', 'Aluguel recebido'], ['cashback', 'Cashback e pontos']
    ]],
    ['transferencias', 'Transferências', 'transfer', '#7C8089', [
      ['entre-contas', 'Entre contas próprias'], ['fatura', 'Pagamento de fatura'],
      ['reembolso', 'Reembolso'], ['estorno', 'Estorno'],
      ['terceiros', 'Para terceiros'], ['recebido', 'Recebido de terceiros']
    ]],
    ['outros', 'Outros', 'expense', '#94908A', [
      ['nao-classificado', 'Não classificado'], ['doacoes', 'Doações'],
      ['diversos', 'Diversos'], ['saque', 'Saque em dinheiro']
    ]]
  ];

  // Gera a lista plana usada pelo banco de dados.
  R.buildCategories = function () {
    const out = [];
    R.CATEGORIES.forEach((c, i) => {
      const [slug, name, kind, color, subs] = c;
      out.push({ id: slug, parentId: null, name, kind, color, system: true, order: i });
      subs.forEach((s, j) => {
        out.push({
          id: slug + '.' + s[0], parentId: slug, name: s[1], kind,
          color, system: true, order: j
        });
      });
    });
    return out;
  };

  /* ── Regras semeadas ─────────────────────────────────────────── */
  // m: termos que devem aparecer no descritor normalizado
  // cat: categoria folha
  // sign: '-' só despesa, '+' só receita, undefined = qualquer
  // p: prioridade (maior vence). Padrão 50.
  const S = (m, cat, opts) => Object.assign({ m: Array.isArray(m) ? m : [m], cat }, opts || {});

  R.SEED_RULES = [
    /* Delivery e restaurantes */
    S(['IFOOD', 'IFD'], 'alimentacao.delivery'),
    S(['RAPPI'], 'alimentacao.delivery'),
    S(['UBER EATS', 'UBEREATS'], 'alimentacao.delivery', { p: 60 }),
    S(['ZE DELIVERY', 'ZEDELIVERY'], 'alimentacao.bebidas'),
    S(['AIQFOME', 'JAMES DELIVERY', 'DAKI', 'GETNINJAS FOOD'], 'alimentacao.delivery'),
    S(['MCDONALD', 'MC DONALD', 'BURGER KING', 'BOB S', 'BOBS', 'SUBWAY', 'HABIBS', 'GIRAFFAS',
      'KFC', 'POPEYES', 'SPOLETO', 'CHINA IN BOX', 'DIVINO FOGAO'], 'alimentacao.lanche'),
    S(['OUTBACK', 'MADERO', 'COCO BAMBU', 'FOGO DE CHAO', 'RESTAURANTE', 'RESTAUR',
      'CHURRASCARIA', 'PIZZARIA', 'CANTINA', 'TRATTORIA', 'SUSHI', 'TEMAKI',
      'COMIDA', 'SELF SERVICE', 'BUFFET'], 'alimentacao.restaurante'),
    S(['STARBUCKS', 'CAFETERIA', 'CAFE ', 'COFFEE', 'THE COFFEE', 'KOPENHAGEN',
      'CACAU SHOW', 'BRIGADEIRO'], 'alimentacao.cafeteria'),
    S(['PADARIA', 'PANIFICADORA', 'PAO ', 'CONFEITARIA'], 'alimentacao.padaria'),
    S(['ACOUGUE', 'CASA DE CARNES', 'FRIGORIFICO'], 'alimentacao.acougue'),
    S(['HORTIFRUTI', 'SACOLAO', 'FEIRA LIVRE', 'QUITANDA', 'EMPORIO'], 'alimentacao.feira'),

    /* Supermercados */
    S(['CARREFOUR', 'PAO DE ACUCAR', 'EXTRA ', 'ASSAI', 'ATACADAO', 'SENDAS',
      'BIG BOMPRECO', 'SONDA', 'ZAFFARI', 'ANGELONI', 'SUPERMERCADO', 'SUPERMERC',
      'MERCADO ', 'MERCEARIA', 'HIPERMERCADO', 'MAKRO', 'TENDA ATACADO',
      'SAM S CLUB', 'SAMS CLUB', 'MUFFATO', 'CONDOR', 'SAVEGNAGO', 'DIA SUPERMERC',
      'MINI EXTRA', 'SUPER NOSSO', 'VERDEMAR', 'ST MARCHE', 'HORTIGIL',
      'GBARBOSA', 'COMPER', 'GIASSI', 'FORT ATACADISTA', 'MATEUS'], 'alimentacao.supermercado'),

    /* Bebidas e bares */
    S(['BAR ', 'BOTECO', 'CERVEJARIA', 'CHOPERIA', 'PUB ', 'DISTRIBUIDORA DE BEBIDAS',
      'ADEGA', 'EMPORIO DA CERVEJA'], 'lazer.bares'),

    /* Transporte */
    S(['UBER', 'UBER TRIP', 'UBER *'], 'transporte.aplicativo', { p: 40 }),
    S(['99APP', '99 APP', '99POP', '99 TECNOLOGIA', 'CABIFY', 'INDRIVE'], 'transporte.aplicativo'),
    S(['POSTO ', 'IPIRANGA', 'SHELL', 'PETROBRAS', 'BR MANIA', 'ALE COMBUST',
      'AUTO POSTO', 'COMBUSTIVEL', 'GASOLINA', 'ETANOL', 'SHELL BOX'], 'transporte.combustivel'),
    S(['ESTAPAR', 'ESTACIONAMENTO', 'PARKING', 'MULTIPARK', 'ZONA AZUL'], 'transporte.estacionamento'),
    S(['SEM PARAR', 'CONECTCAR', 'VELOE', 'PEDAGIO', 'AUTOPISTA', 'ECORODOVIAS',
      'CCR ', 'ARTERIS'], 'transporte.pedagio'),
    S(['METRO ', 'BILHETE UNICO', 'RIOCARD', 'BOM CARTAO', 'VEM CARTAO',
      'CPTM', 'SPTRANS', 'RECARGA BILHETE', 'BUSER', 'CLICKBUS', 'RODOVIARIA'], 'transporte.publico'),
    S(['DETRAN', 'IPVA', 'LICENCIAMENTO', 'CRLV'], 'transporte.ipva'),
    S(['AUTO CENTER', 'OFICINA', 'PNEUS', 'MECANICA', 'LAVA RAPIDO', 'LAVA JATO',
      'AUTO PECAS', 'PECAS E SERV', 'BOSCH CAR'], 'transporte.manutencao'),
    S(['PORTO SEGURO AUTO', 'SEGURO AUTO', 'AZUL SEGUROS', 'SEGURO VEICULO'], 'transporte.seguro'),

    /* Viagem */
    S(['LATAM', 'GOL LINHAS', 'AZUL LINHAS', 'VOEAZUL', 'PASSAGEM AEREA',
      'DECOLAR', 'MAXMILHAS', 'SUBMARINO VIAGENS', 'KAYAK', 'SKYSCANNER',
      '123MILHAS', 'CVC '], 'lazer.viagens'),
    S(['AIRBNB', 'BOOKING', 'HOTEL', 'POUSADA', 'HOSTEL', 'RESORT', 'HOTEIS'], 'lazer.hospedagem'),

    /* Farmácia e saúde */
    S(['DROGARIA', 'DROGASIL', 'RAIA', 'PACHECO', 'PAGUE MENOS', 'FARMACIA',
      'ULTRAFARMA', 'PANVEL', 'NISSEI', 'VENANCIO', 'EXTRAFARMA', 'DROGA RAIA'], 'saude.farmacia'),
    S(['UNIMED', 'AMIL', 'BRADESCO SAUDE', 'SULAMERICA SAUDE', 'HAPVIDA', 'NOTREDAME',
      'PORTO SEGURO SAUDE', 'PLANO DE SAUDE', 'GOLDEN CROSS', 'PREVENT SENIOR',
      'ASSIM SAUDE', 'SEGUROS UNIMED'], 'saude.plano'),
    S(['LABORATORIO', 'FLEURY', 'DASA', 'DELBONI', 'SABIN', 'HERMES PARDINI',
      'EXAME ', 'DIAGNOSTICO'], 'saude.exames'),
    S(['HOSPITAL', 'CLINICA', 'CONSULTORIO', 'DR ', 'DRA ', 'MEDICO'], 'saude.consultas'),
    S(['ODONTO', 'DENTISTA', 'ORTODONT', 'IMPLANTE DENT'], 'saude.odontologia'),
    S(['PSICOLOG', 'TERAPIA', 'PSIQUIATR', 'ANALISE'], 'saude.terapia'),
    S(['SMARTFIT', 'SMART FIT', 'BLUEFIT', 'BODYTECH', 'ACADEMIA', 'GYMPASS',
      'TOTALPASS', 'WELLHUB', 'CROSSFIT', 'PILATES'], 'saude.academia'),
    S(['OTICA', 'CHILLI BEANS', 'LENTES DE CONTATO'], 'saude.oticas'),

    /* Assinaturas */
    S(['NETFLIX'], 'assinaturas.streaming'),
    S(['SPOTIFY', 'DEEZER', 'TIDAL', 'APPLE MUSIC'], 'assinaturas.musica'),
    S(['DISNEY', 'HBO', 'MAX ', 'PARAMOUNT', 'GLOBOPLAY', 'PRIME VIDEO',
      'AMAZON PRIME', 'APPLE TV', 'CRUNCHYROLL', 'MUBI', 'TELECINE', 'DIRECTV',
      'YOUTUBE PREMIUM'], 'assinaturas.streaming'),
    S(['OPENAI', 'CHATGPT', 'ANTHROPIC', 'CLAUDE AI', 'MIDJOURNEY', 'PERPLEXITY',
      'GITHUB COPILOT', 'CURSOR AI'], 'assinaturas.ia'),
    S(['ADOBE', 'MICROSOFT 365', 'OFFICE 365', 'CANVA', 'NOTION', 'FIGMA',
      'JETBRAINS', 'GITHUB', 'SLACK', 'ZOOM', 'AUTODESK', 'SPOTIFY DUO'], 'assinaturas.software'),
    S(['GOOGLE ONE', 'ICLOUD', 'DROPBOX', 'ONEDRIVE', 'GOOGLE STORAGE',
      'AWS ', 'AMAZON WEB', 'DIGITALOCEAN', 'VERCEL', 'CLOUDFLARE'], 'assinaturas.nuvem'),
    S(['FOLHA DE S', 'ESTADAO', 'O GLOBO', 'VALOR ECONOMICO', 'THE ECONOMIST',
      'NEW YORK TIMES', 'MEDIUM', 'SUBSTACK'], 'assinaturas.jornais'),
    S(['APPLE.COM/BILL', 'APPLE COM BILL', 'GOOGLE PLAY', 'PLAYSTATION',
      'XBOX', 'NINTENDO', 'STEAM'], 'lazer.jogos'),

    /* Casa */
    S(['ALUGUEL', 'IMOBILIARIA', 'LOCACAO IMOVEL'], 'moradia.aluguel'),
    S(['CONDOMINIO', 'CONDOM ', 'TAXA CONDOMINIAL'], 'moradia.condominio'),
    S(['ENEL', 'CPFL', 'LIGHT SESA', 'CEMIG', 'COPEL', 'CELESC', 'COELBA',
      'ELEKTRO', 'ENERGISA', 'EQUATORIAL', 'NEOENERGIA', 'AMAZONAS ENERGIA',
      'ENERGIA ELETRICA', 'EDP SP', 'RGE SUL'], 'moradia.energia'),
    S(['SABESP', 'CEDAE', 'COPASA', 'SANEPAR', 'CAESB', 'EMBASA', 'CAGECE',
      'AGUAS DE', 'SANEAMENTO', 'BRK AMBIENTAL'], 'moradia.agua'),
    S(['COMGAS', 'NATURGY', 'ULTRAGAZ', 'LIQUIGAS', 'SUPERGASBRAS', 'COPERGAS'], 'moradia.gas'),
    S(['VIVO', 'CLARO', 'TIM ', 'OI FIXO', 'OI MOVEL', 'NET SERVICOS', 'SKY ',
      'ALGAR', 'NEXTEL', 'INTERNET', 'BANDA LARGA', 'FIBRA', 'DESKTOP INTERNET',
      'SUMICITY', 'VERO INTERNET'], 'moradia.internet'),
    S(['IPTU', 'PREFEITURA'], 'moradia.iptu'),
    S(['LEROY MERLIN', 'TELHANORTE', 'C C CONSTRUCAO', 'MATERIAL DE CONSTRUCAO',
      'CASA E CONSTRUCAO', 'OBRAMAX', 'CHATUBA'], 'moradia.manutencao'),
    S(['DIARISTA', 'FAXINA', 'EMPREGADA'], 'moradia.servicos'),

    /* Compras */
    S(['MERCADO LIVRE', 'MERCADOLIVRE', 'MERCADOPAGO', 'MERCADO PAGO', 'MERPAGO',
      'SHOPEE', 'ALIEXPRESS', 'SHEIN', 'TEMU', 'WISH'], 'compras.marketplace'),
    S(['AMAZON', 'AMZN'], 'compras.marketplace', { p: 40 }),
    S(['MAGAZINE LUIZA', 'MAGALU', 'AMERICANAS', 'CASAS BAHIA', 'PONTO FRIO',
      'SUBMARINO', 'FAST SHOP', 'EXTRA COM'], 'compras.eletronicos'),
    S(['KABUM', 'PICHAU', 'TERABYTE', 'APPLE STORE', 'IPLACE', 'SAMSUNG'], 'compras.eletronicos'),
    S(['RENNER', 'C A ', 'CEA MODAS', 'RIACHUELO', 'ZARA', 'HERING', 'MARISA',
      'YOUCOM', 'FARM ', 'RESERVA', 'NIKE', 'ADIDAS', 'CENTAURO', 'DECATHLON',
      'NETSHOES', 'ARZEN', 'LOJAS RENNER', 'PERNAMBUCANAS'], 'compras.vestuario'),
    S(['SEPHORA', 'BOTICARIO', 'NATURA', 'AVON', 'EUDORA', 'BELEZA NA WEB',
      'BARBEARIA', 'SALAO', 'CABELEIREIRO', 'MANICURE', 'ESTETICA'], 'compras.beleza'),
    S(['PETZ', 'COBASI', 'PETLOVE', 'PET SHOP', 'PETSHOP', 'AGROPECUARIA'], 'compras.pets'),
    S(['TOK STOK', 'MOBLY', 'MADEIRA MADEIRA', 'CAMICADO', 'ETNA', 'OPPA',
      'WESTWING', 'IKEA'], 'compras.casa'),
    S(['SARAIVA', 'CULTURA', 'LIVRARIA', 'PAPELARIA', 'KALUNGA'], 'compras.livraria'),

    /* Lazer */
    S(['CINEMARK', 'CINEPOLIS', 'UCI CINEMAS', 'KINOPLEX', 'CINEMA',
      'INGRESSO', 'SYMPLA', 'EVENTIM', 'TICKETMASTER', 'TEATRO', 'SHOW '], 'lazer.eventos'),

    /* Educação */
    S(['COLEGIO', 'ESCOLA', 'FACULDADE', 'UNIVERSIDADE', 'ANHANGUERA', 'ESTACIO',
      'UNIP ', 'FGV', 'INSPER', 'PUC ', 'MENSALIDADE ESCOLAR', 'CRECHE'], 'educacao.mensalidade'),
    S(['UDEMY', 'COURSERA', 'ALURA', 'ROCKETSEAT', 'HOTMART', 'EDUZZ', 'KIWIFY',
      'DOMESTIKA', 'CURSO '], 'educacao.cursos'),
    S(['WIZARD', 'CCAA', 'CULTURA INGLESA', 'FISK', 'ROSETTA', 'DUOLINGO',
      'CAMBLY', 'OPEN ENGLISH'], 'educacao.idiomas'),

    /* Impostos, tarifas e encargos */
    S(['TARIFA', 'CESTA DE SERVICOS', 'MANUTENCAO DE CONTA', 'PACOTE DE SERVICOS',
      'TAR ', 'TAXA BANCARIA'], 'impostos.tarifa'),
    S(['ANUIDADE'], 'impostos.anuidade'),
    S(['IOF'], 'impostos.iof'),
    S(['DARF', 'DAS SIMPLES', 'SIMPLES NACIONAL', 'GPS ', 'INSS'], 'impostos.darf'),
    S(['IMPOSTO DE RENDA', 'IRPF', 'RECEITA FEDERAL'], 'impostos.ir'),
    S(['CARTORIO', 'JUNTA COMERCIAL', 'TAXA DE EMISSAO'], 'impostos.cartorio'),
    S(['MULTA', 'JUROS DE MORA', 'ENCARGOS'], 'impostos.multas'),

    /* Dívidas */
    S(['JUROS CHEQUE ESPECIAL', 'CHEQUE ESPECIAL', 'LIS ', 'ADIANTAMENTO A DEPOSITANTE',
      'JUROS ADIANT'], 'emprestimos.juros'),
    S(['CREDITO ROTATIVO', 'ROTATIVO', 'ENCARGOS DE FATURA', 'PAGAMENTO MINIMO'], 'emprestimos.rotativo'),
    S(['EMPRESTIMO', 'CREDITO PESSOAL', 'CDC ', 'FINANCIAMENTO'], 'emprestimos.parcela'),
    S(['CONSIGNADO'], 'emprestimos.consignado'),
    S(['PARCELAMENTO DE FATURA', 'FATURA PARCELADA'], 'emprestimos.fatura-parcelada'),

    /* Investimentos */
    S(['APLICACAO', 'APLIC ', 'CDB ', 'TESOURO DIRETO', 'TESOURO NACIONAL',
      'LCI ', 'LCA ', 'RDB ', 'POUPANCA', 'RENDA FIXA'], 'investimentos.renda-fixa'),
    S(['RESGATE', 'RESG ', 'LIQUIDACAO ANTECIPADA'], 'investimentos.resgate'),
    S(['XP INVESTIMENTOS', 'CLEAR CORRETORA', 'RICO INVEST', 'BTG PACTUAL',
      'NUINVEST', 'EASYNVEST', 'MODALMAIS', 'AVENUE', 'TORO INVEST',
      'GENIAL INVEST', 'INTER INVEST', 'B3 SA'], 'investimentos.renda-variavel'),
    S(['BINANCE', 'MERCADO BITCOIN', 'FOXBIT', 'COINBASE', 'BITYBANK', 'NOVADAX',
      'BITPRECO', 'CRYPTO'], 'investimentos.cripto'),
    S(['PREVIDENCIA', 'PGBL', 'VGBL', 'BRASILPREV', 'ITAU VIDA E PREV',
      'ICATU', 'PREV '], 'investimentos.previdencia'),
    S(['CORRETAGEM', 'EMOLUMENTOS', 'TAXA DE CUSTODIA'], 'investimentos.corretagem'),

    /* Receitas */
    S(['SALARIO', 'PAGAMENTO DE SALARIO', 'FOLHA DE PAGAMENTO', 'REMUNERACAO',
      'PROVENTOS', 'VENCIMENTOS', 'ORDENADO'], 'salario.salario', { sign: '+', p: 70 }),
    S(['13 SALARIO', 'DECIMO TERCEIRO', '13o SALARIO'], 'salario.decimo', { sign: '+' }),
    S(['FERIAS'], 'salario.ferias', { sign: '+' }),
    S(['PLR', 'PARTICIPACAO NOS LUCROS', 'BONUS', 'PREMIACAO'], 'salario.plr', { sign: '+' }),
    S(['PRO LABORE', 'PROLABORE'], 'salario.prolabore', { sign: '+' }),
    S(['VALE ALIMENTACAO', 'VALE REFEICAO', 'ALELO', 'SODEXO', 'TICKET ',
      'VR BENEFICIOS', 'CAJU', 'FLASH BENEFICIOS', 'SWILE'], 'salario.beneficios'),
    S(['DIVIDENDOS', 'DIVIDENDO'], 'dividendos.dividendos', { sign: '+' }),
    S(['JUROS SOBRE CAPITAL', 'JCP'], 'dividendos.jcp', { sign: '+' }),
    S(['RENDIMENTO', 'RENDIMENTOS', 'REND PAGO'], 'dividendos.juros', { sign: '+' }),
    S(['CASHBACK', 'ESTORNO DE PONTOS', 'PROGRAMA DE PONTOS'], 'dividendos.cashback', { sign: '+' }),

    /* Transferências e meios de pagamento */
    S(['PAGAMENTO DE FATURA', 'PAGTO FATURA', 'PAGAMENTO FATURA', 'PAG FATURA',
      'PAGAMENTO CARTAO', 'PAGTO CARTAO DE CREDITO', 'PAGAMENTO DE CARTAO'],
      'transferencias.fatura', { p: 90 }),
    S(['TRANSFERENCIA ENTRE CONTAS', 'TRANSF ENTRE CONTAS', 'APLICACAO AUTOMATICA'],
      'transferencias.entre-contas', { p: 80 }),
    S(['ESTORNO', 'DEVOLUCAO', 'REEMBOLSO', 'CANCELAMENTO DE COMPRA'],
      'transferencias.estorno', { p: 75 }),
    S(['SAQUE', 'SAQUE 24H', 'BANCO24HORAS', 'RETIRADA EM DINHEIRO'], 'outros.saque'),
    S(['DOACAO', 'DIZIMO', 'OFERTA', 'IGREJA', 'ONG '], 'outros.doacoes')
  ];

  /* ── Meio de pagamento a partir do descritor ─────────────────── */
  R.detectMethod = function (norm) {
    if (/\bPIX\b/.test(norm)) return 'pix';
    if (/\bTED\b/.test(norm)) return 'ted';
    if (/\bDOC\b/.test(norm)) return 'doc';
    if (/BOLETO|TIT(ULO)? ?COBRANCA|COBRANCA BANCARIA|DEB(ITO)? AUTOM/.test(norm)) return 'boleto';
    if (/SAQUE|BANCO24|24 ?HORAS/.test(norm)) return 'cash';
    if (/TARIFA|ANUIDADE|IOF|JUROS|ENCARGO/.test(norm)) return 'fee';
    if (/RENDIMENTO|REND ?PAGO|DIVIDENDO|JCP/.test(norm)) return 'yield';
    return null;
  };

  // Nome da contraparte num PIX/TED, que é o que realmente identifica
  // o "estabelecimento" nesses casos.
  R.extractCounterparty = function (norm) {
    let m = norm.match(/\b(?:PIX|TED|DOC)\b[\s\-]*(?:ENVIADO|RECEBIDO|TRANSF(?:ERENCIA)?|QRS|QRE|CRED|DEB)?[\s\-:]*(?:PARA|DE)?[\s\-:]*(.{3,})$/);
    if (m) return m[1].replace(/^(CP|CC|POUP)\s+/, '').trim();
    return null;
  };

  /* ── Assinaturas de instituições ─────────────────────────────── */
  // compe: código do banco no OFX <BANKID>; hints: termos no arquivo
  R.INSTITUTIONS = [
    { id: 'nubank', name: 'Nubank', compe: ['260'], color: '#820AD1', hints: ['NUBANK', 'NU PAGAMENTOS', 'NU FINANCEIRA', 'NUCONTA'] },
    { id: 'itau', name: 'Itaú', compe: ['341', '652'], color: '#EC7000', hints: ['ITAU', 'ITAÚ', 'ITAUCARD', 'BANCO ITAU'] },
    { id: 'bradesco', name: 'Bradesco', compe: ['237', '036'], color: '#CC092F', hints: ['BRADESCO', 'BANCO BRADESCO', 'NEXT '] },
    { id: 'bb', name: 'Banco do Brasil', compe: ['001'], color: '#FBE100', hints: ['BANCO DO BRASIL', 'BB ', 'OUROCARD'] },
    { id: 'santander', name: 'Santander', compe: ['033'], color: '#EC0000', hints: ['SANTANDER'] },
    { id: 'caixa', name: 'Caixa', compe: ['104'], color: '#0070AF', hints: ['CAIXA ECONOMICA', 'CAIXA ECONÔMICA', 'CEF '] },
    { id: 'inter', name: 'Banco Inter', compe: ['077'], color: '#FF7A00', hints: ['BANCO INTER', 'INTER '] },
    { id: 'c6', name: 'C6 Bank', compe: ['336'], color: '#242424', hints: ['C6 BANK', 'BANCO C6', 'C6 CARBON'] },
    { id: 'btg', name: 'BTG Pactual', compe: ['208'], color: '#00284B', hints: ['BTG PACTUAL', 'BTG '] },
    { id: 'xp', name: 'XP', compe: ['102', '348'], color: '#0A0A0A', hints: ['XP INVESTIMENTOS', 'BANCO XP', 'XP CORRETORA'] },
    { id: 'picpay', name: 'PicPay', compe: ['380'], color: '#21C25E', hints: ['PICPAY'] },
    { id: 'mercadopago', name: 'Mercado Pago', compe: ['323'], color: '#00B1EA', hints: ['MERCADO PAGO', 'MERCADOPAGO'] },
    { id: 'pagbank', name: 'PagBank', compe: ['290'], color: '#4CAF50', hints: ['PAGBANK', 'PAGSEGURO'] },
    { id: 'neon', name: 'Neon', compe: ['735', '655'], color: '#00A9F4', hints: ['BANCO NEON', 'NEON PAGAMENTOS'] },
    { id: 'original', name: 'Banco Original', compe: ['212'], color: '#00A335', hints: ['BANCO ORIGINAL'] },
    { id: 'safra', name: 'Safra', compe: ['422'], color: '#003057', hints: ['BANCO SAFRA', 'SAFRA '] },
    { id: 'sicoob', name: 'Sicoob', compe: ['756'], color: '#003641', hints: ['SICOOB'] },
    { id: 'sicredi', name: 'Sicredi', compe: ['748'], color: '#3FA110', hints: ['SICREDI'] },
    { id: 'banrisul', name: 'Banrisul', compe: ['041'], color: '#0072BC', hints: ['BANRISUL'] },
    { id: 'brb', name: 'BRB', compe: ['070'], color: '#005CA9', hints: ['BRB ', 'BANCO DE BRASILIA'] },
    { id: 'will', name: 'Will Bank', compe: ['280'], color: '#FFD400', hints: ['WILL BANK', 'WILLBANK'] },
    { id: 'stone', name: 'Stone', compe: ['197'], color: '#0DB14B', hints: ['STONE PAGAMENTOS', 'TON '] },
    { id: 'rico', name: 'Rico', compe: ['102'], color: '#F5A623', hints: ['RICO INVESTIMENTOS'] },
    { id: 'clear', name: 'Clear', compe: ['102'], color: '#1D1D1B', hints: ['CLEAR CORRETORA'] },
    { id: 'binance', name: 'Binance', compe: [], color: '#F0B90B', hints: ['BINANCE'] },
    { id: 'outro', name: 'Outra instituição', compe: [], color: '#7C8089', hints: [] }
  ];

  R.institutionById = function (id) {
    return R.INSTITUTIONS.find(i => i.id === id) || R.INSTITUTIONS[R.INSTITUTIONS.length - 1];
  };

  R.detectInstitution = function (text, compe) {
    if (compe) {
      const code = String(compe).replace(/\D/g, '').padStart(3, '0');
      const byCode = R.INSTITUTIONS.filter(i => i.compe.includes(code));
      if (byCode.length === 1) return byCode[0];
      if (byCode.length > 1 && text) {
        const up = U.stripAccents(String(text)).toUpperCase();
        const better = byCode.find(i => i.hints.some(h => up.includes(h)));
        if (better) return better;
        return byCode[0];
      }
      if (byCode.length) return byCode[0];
    }
    if (text) {
      const up = U.stripAccents(String(text)).toUpperCase();
      let best = null, bestLen = 0;
      R.INSTITUTIONS.forEach(inst => {
        inst.hints.forEach(h => {
          if (up.includes(h) && h.length > bestLen) { best = inst; bestLen = h.length; }
        });
      });
      if (best) return best;
    }
    return null;
  };

  /* ── Marcadores de fatura de cartão dentro de um arquivo ─────── */
  R.looksLikeCardFile = function (text, filename) {
    const up = U.stripAccents(String(text || '')).toUpperCase();
    const fn = U.stripAccents(String(filename || '')).toUpperCase();
    let score = 0;
    if (/FATURA|CREDITCARD|CCSTMT|CREDIT CARD/.test(up)) score += 2;
    if (/FATURA|CARTAO|CREDITO|INVOICE/.test(fn)) score += 2;
    if (/LIMITE (DE CREDITO|DISPONIVEL)|VENCIMENTO DA FATURA|FECHAMENTO/.test(up)) score += 2;
    if (/\b\d{1,2}\s*\/\s*\d{1,2}\b/.test(up)) score += 1;   // parcelas
    if (/SALDO ANTERIOR|SALDO DISPONIVEL|EXTRATO/.test(up)) score -= 1;
    return score >= 2;
  };

  global.RULES = R;
})(window);
