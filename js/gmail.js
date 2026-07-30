/* ══════════════════════════════════════════════════════════════════
   gmail.js — busca extratos e faturas direto no seu Gmail

   Como funciona: o Google devolve um token de acesso só de leitura,
   que fica na memória da página (nunca é gravado em disco). Com ele o
   app procura e-mails das instituições financeiras que tenham anexo,
   baixa o arquivo escolhido e joga no mesmo pipeline de importação de
   sempre. Nenhum dado financeiro trafega para outro lugar: o Gmail
   entrega o arquivo, o processamento continua todo no seu navegador.

   Requer endereço https:// — login do Google não funciona em arquivo
   local (file://).
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const G = {};
  const d = () => DB.data;
  const esc = U.esc;

  const ESCOPO = 'https://www.googleapis.com/auth/gmail.readonly';
  const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const GIS = 'https://accounts.google.com/gsi/client';

  let token = null;          // só em memória, some ao fechar a aba
  let tokenExpiraEm = 0;
  let tokenClient = null;
  let gisCarregado = false;

  /* ═══════════════════════ Disponibilidade ═════════════════════ */

  G.disponivel = function () {
    return location.protocol === 'https:' ||
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  };

  // Defensivo de propósito: pode ser consultado antes de DB.load().
  G.configurado = function () {
    const s = DB.data && DB.data.settings;
    return !!(s && String(s.gmailClientId || '').trim());
  };

  G.conectado = function () {
    return !!token && Date.now() < tokenExpiraEm;
  };

  /* ═══════════════════════ Autenticação ════════════════════════ */

  function carregarGIS() {
    if (gisCarregado) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS;
      s.async = true;
      s.onload = () => { gisCarregado = true; resolve(); };
      s.onerror = () => reject(new Error(
        'Não consegui carregar o script de login do Google. ' +
        'Verifique sua conexão.'));
      document.head.appendChild(s);
    });
  }

  G.conectar = async function () {
    if (!G.disponivel()) {
      throw new Error('O login do Google exige um endereço https://. ' +
        'Abra o app pelo site publicado, não pelo arquivo local.');
    }
    const clientId = String((DB.data.settings || {}).gmailClientId || '').trim();
    if (!clientId) {
      throw new Error('Falta o Client ID do Google. Configure em Ajustes › Gmail.');
    }
    if (G.conectado()) return token;

    await carregarGIS();
    if (!global.google || !google.accounts || !google.accounts.oauth2) {
      throw new Error('O script do Google carregou, mas a biblioteca de login não apareceu.');
    }

    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: ESCOPO,
        callback: resp => {
          if (resp && resp.access_token) {
            token = resp.access_token;
            // Guarda margem de 5 minutos antes do vencimento real.
            tokenExpiraEm = Date.now() + ((resp.expires_in || 3600) - 300) * 1000;
            resolve(token);
          } else {
            reject(new Error('O Google não devolveu autorização. ' +
              'Se apareceu um aviso de "app não verificado", clique em ' +
              '"Avançado" e prossiga — é o seu próprio app.'));
          }
        },
        error_callback: err => {
          const tipo = err && err.type;
          if (tipo === 'popup_closed') reject(new Error(
            'A janela de login fechou sem autorizar.\n\n' +
            'Se dentro dela apareceu "Access blocked" ou "Erro 403: access_denied", ' +
            'falta liberar o seu e-mail como testador: no Google Cloud Console, ' +
            'em Tela de consentimento OAuth › Público-alvo › Usuários de teste, ' +
            'adicione o seu próprio endereço do Gmail e salve. ' +
            'Depois tente de novo.'));
          else if (tipo === 'popup_failed_to_open') reject(new Error(
            'O navegador bloqueou a janela de login. Libere pop-ups para este site e tente de novo.'));
          else reject(new Error('Falha no login: ' + (err && err.message || tipo || 'desconhecida')));
        }
      });
      tokenClient.requestAccessToken({ prompt: '' });
    });
  };

  G.desconectar = function () {
    if (token && global.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(token); } catch (e) { }
    }
    token = null;
    tokenExpiraEm = 0;
  };

  /* ═══════════════════════ Chamadas à API ══════════════════════ */

  async function api(caminho, params) {
    if (!G.conectado()) await G.conectar();
    const url = new URL(API + caminho);
    if (params) for (const k in params) {
      if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
    }
    const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (resp.status === 401) {
      token = null;
      throw new Error('A autorização expirou. Conecte de novo.');
    }
    if (resp.status === 403) {
      const corpo = await resp.text();
      if (corpo.includes('accessNotConfigured') || corpo.includes('has not been used')) {
        throw new Error('A Gmail API não está ativada no seu projeto do Google Cloud. ' +
          'Ative em APIs e Serviços › Biblioteca › Gmail API.');
      }
      throw new Error('O Google recusou o acesso (403). Confira se o seu e-mail está ' +
        'na lista de usuários de teste da tela de consentimento.');
    }
    if (!resp.ok) {
      throw new Error('Erro ' + resp.status + ' ao falar com o Gmail.');
    }
    return resp.json();
  }

  /* ═══════════════════════ Busca ═══════════════════════════════ */

  // Monta a consulta no formato de busca do próprio Gmail.
  G.montarConsulta = function (opts) {
    opts = opts || {};
    const meses = opts.meses || 6;
    const remetentes = RULES.EMAIL_SENDERS.map(dom => 'from:' + dom).join(' OR ');
    const assuntos = RULES.EMAIL_SUBJECTS.map(s => 'subject:(' + s + ')').join(' OR ');
    const partes = [
      'has:attachment',
      'newer_than:' + meses + 'm',
      '{' + remetentes + ' ' + assuntos + '}'
    ];
    if (!opts.incluirLixeira) partes.push('-in:trash');
    if (opts.extra) partes.push(opts.extra);
    return partes.join(' ');
  };

  function cabecalho(payload, nome) {
    const h = (payload.headers || []).find(x => x.name.toLowerCase() === nome.toLowerCase());
    return h ? h.value : '';
  }

  function extensao(nome) {
    const p = String(nome || '').toLowerCase().split('.');
    return p.length > 1 ? p[p.length - 1] : '';
  }

  // Anexos podem estar aninhados em multipart; percorre recursivo.
  function coletarAnexos(part, saida) {
    saida = saida || [];
    if (!part) return saida;
    if (part.filename && part.body && part.body.attachmentId) {
      const ext = extensao(part.filename);
      if (RULES.EMAIL_EXTENSIONS.includes(ext)) {
        saida.push({
          filename: part.filename,
          attachmentId: part.body.attachmentId,
          size: part.body.size || 0,
          ext
        });
      }
    }
    (part.parts || []).forEach(p => coletarAnexos(p, saida));
    return saida;
  }

  G.buscar = async function (opts) {
    opts = opts || {};
    const q = G.montarConsulta(opts);
    const lista = await api('/messages', { q, maxResults: opts.limite || 40 });
    const ids = (lista.messages || []).map(m => m.id);
    if (!ids.length) return { consulta: q, mensagens: [] };

    const mensagens = [];
    // Sequencial de propósito: em paralelo o Gmail devolve 429 fácil.
    for (const id of ids) {
      try {
        const msg = await api('/messages/' + id, { format: 'full' });
        const anexos = coletarAnexos(msg.payload);
        if (!anexos.length) continue;
        const de = cabecalho(msg.payload, 'From');
        const inst = RULES.detectInstitution(de + ' ' + cabecalho(msg.payload, 'Subject'), null);
        mensagens.push({
          id,
          assunto: cabecalho(msg.payload, 'Subject') || '(sem assunto)',
          de,
          remetente: (de.match(/<([^>]+)>/) || [null, de])[1],
          data: msg.internalDate ? new Date(+msg.internalDate).toISOString().slice(0, 10) : null,
          instituicao: inst,
          anexos
        });
      } catch (e) {
        console.warn('[gmail] falhei em ler a mensagem', id, e);
      }
    }
    mensagens.sort((a, b) => String(b.data).localeCompare(String(a.data)));
    return { consulta: q, mensagens };
  };

  /* ═══════════════════════ Download ════════════════════════════ */

  function base64UrlParaBytes(b64) {
    const normal = b64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normal + '='.repeat((4 - normal.length % 4) % 4);
    const bin = atob(pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  G.baixarAnexo = async function (msgId, anexo) {
    const resp = await api('/messages/' + msgId + '/attachments/' + anexo.attachmentId);
    if (!resp || !resp.data) throw new Error('O anexo veio vazio.');
    const bytes = base64UrlParaBytes(resp.data);
    return new File([bytes], anexo.filename, { type: 'application/octet-stream' });
  };

  /* ═══════════════════════ Interface ═══════════════════════════ */

  let ultimoResultado = null;

  UI.actions.gmail = async function () {
    if (!G.disponivel()) {
      return UI.modal('<h2>Precisa do site publicado</h2>' +
        '<p style="font-size:.9rem;color:var(--ink-2)">O login do Google só funciona em endereço ' +
        '<code>https://</code>. Você abriu o app pelo arquivo local, e nesse modo o Google recusa ' +
        'a autenticação.</p>' +
        '<p style="font-size:.9rem;color:var(--ink-2)">Abra pelo endereço publicado do seu site que ' +
        'esta busca funciona normalmente.</p>' +
        '<div class="modal-foot"><button class="btn primary" data-x="c">Entendi</button></div>',
        { onMount(m) { m.querySelector('[data-x=c]').onclick = UI.closeModal; } });
    }
    if (!G.configurado()) return telaConfiguracao();
    telaBusca();
  };

  function telaConfiguracao() {
    UI.modal('<h2>Conectar ao Gmail</h2>' +
      '<p style="font-size:.9rem;color:var(--ink-2)">Para o app falar com a sua conta, o Google exige ' +
      'uma credencial criada por <b>você</b>, na sua própria conta. É gratuito e feito uma única vez. ' +
      'Assim ninguém além de você tem acesso — nem eu.</p>' +
      '<ol style="font-size:.87rem;color:var(--ink-2);padding-left:1.2rem;display:flex;flex-direction:column;gap:.4rem">' +
      '<li>Acesse <b>console.cloud.google.com</b> e crie um projeto.</li>' +
      '<li>Em <b>APIs e Serviços › Biblioteca</b>, procure <b>Gmail API</b> e clique em Ativar.</li>' +
      '<li>Em <b>Tela de permissão OAuth</b>, escolha <b>Externo</b>, preencha o nome do app e ' +
      'adicione o seu próprio e-mail em <b>Usuários de teste</b>.</li>' +
      '<li>Em <b>Credenciais › Criar credencial › ID do cliente OAuth</b>, tipo ' +
      '<b>Aplicativo da Web</b>. Em <b>Origens JavaScript autorizadas</b>, cole exatamente:<br>' +
      '<code style="background:var(--sunken);padding:.15rem .3rem;border-radius:4px;word-break:break-all">' +
      esc(location.origin) + '</code></li>' +
      '<li>Copie o <b>ID do cliente</b> gerado e cole abaixo.</li>' +
      '</ol>' +
      '<label class="field" style="margin-top:.8rem">ID do cliente OAuth' +
      '<input type="text" id="gcid" placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com" ' +
      'value="' + esc(d().settings.gmailClientId || '') + '"></label>' +
      '<div class="note" style="margin-top:.6rem">Na primeira conexão o Google vai avisar que o app ' +
      '<b>não é verificado</b>. É esperado: o app é seu e está em modo de teste. Clique em ' +
      '<b>Avançado</b> e prossiga.</div>' +
      '<div class="modal-foot"><button class="btn" data-x="c">Cancelar</button>' +
      '<button class="btn primary" data-x="ok">Salvar e conectar</button></div>',
      {
        wide: true,
        onMount(m) {
          m.querySelector('[data-x=c]').onclick = UI.closeModal;
          m.querySelector('[data-x=ok]').onclick = () => {
            const v = m.querySelector('#gcid').value.trim();
            if (!v) return UI.toast('Cole o ID do cliente para continuar.', 'bad');
            if (!/\.apps\.googleusercontent\.com$/.test(v)) {
              return UI.toast('Esse ID parece incompleto. Ele termina em ' +
                '<code>.apps.googleusercontent.com</code>.', 'bad');
            }
            d().settings.gmailClientId = v;
            DB.save();
            UI.closeModal();
            telaBusca();
          };
        }
      });
  }

  function telaBusca() {
    const meses = d().settings.gmailMeses || 6;
    UI.modal('<h2>Buscar no Gmail</h2>' +
      '<p style="font-size:.88rem;color:var(--ink-2)">Vou procurar e-mails com anexo enviados pelas ' +
      'instituições financeiras que conheço (' + RULES.EMAIL_SENDERS.length + ' remetentes) ou com ' +
      'assunto de fatura, extrato e demonstrativo.</p>' +
      '<div class="row"><label class="field" style="max-width:12rem">Período' +
      '<select id="gmeses">' +
      [[1, 'último mês'], [3, 'últimos 3 meses'], [6, 'últimos 6 meses'], [12, 'último ano'], [24, 'últimos 2 anos']]
        .map(([v, l]) => '<option value="' + v + '"' + (v === meses ? ' selected' : '') + '>' + l + '</option>').join('') +
      '</select></label></div>' +
      '<div id="gres" style="margin-top:.8rem"></div>' +
      '<div class="modal-foot">' +
      '<button class="btn" data-x="cfg">Trocar credencial</button>' +
      '<button class="btn" data-x="c">Fechar</button>' +
      '<button class="btn primary" data-x="buscar">Buscar</button></div>',
      {
        wide: true,
        onMount(m) {
          const res = m.querySelector('#gres');
          m.querySelector('[data-x=c]').onclick = UI.closeModal;
          m.querySelector('[data-x=cfg]').onclick = () => { UI.closeModal(); telaConfiguracao(); };
          m.querySelector('[data-x=buscar]').onclick = async () => {
            const mm = +m.querySelector('#gmeses').value || 6;
            d().settings.gmailMeses = mm;
            DB.save();
            res.innerHTML = '<div class="muted" style="font-size:.86rem">Conectando e procurando…</div>';
            try {
              ultimoResultado = await G.buscar({ meses: mm });
              desenharResultado(res, ultimoResultado);
            } catch (e) {
              res.innerHTML = '<div class="note bad">' + esc(e.message) + '</div>';
            }
          };
          if (ultimoResultado) desenharResultado(res, ultimoResultado);
        }
      });
  }

  function desenharResultado(res, r) {
    if (!r.mensagens.length) {
      res.innerHTML = '<div class="note">Nenhum e-mail com anexo encontrado nesse período. ' +
        'Talvez os seus bancos não mandem arquivo por e-mail, ou o remetente não esteja na ' +
        'minha lista — nesse caso, me diga qual é e eu incluo.</div>';
      return;
    }

    const lidos = r.mensagens.filter(m => m.anexos.some(a => a.ext !== 'pdf'));
    const soPdf = r.mensagens.filter(m => m.anexos.every(a => a.ext === 'pdf'));

    let html = '<div class="note good"><b>' + r.mensagens.length + ' e-mails com anexo.</b> ' +
      lidos.length + ' com arquivo que eu sei ler' +
      (soPdf.length ? ' · ' + soPdf.length + ' só com PDF, que ainda não é suportado' : '') + '.</div>';

    html += '<div class="stack" style="max-height:44vh;overflow-y:auto;margin-top:.6rem">';
    r.mensagens.forEach(msg => {
      msg.anexos.forEach((a, i) => {
        const suportado = a.ext !== 'pdf';
        const id = msg.id + '|' + i;
        html += '<label class="row" style="justify-content:space-between;gap:.6rem;padding:.4rem .5rem;' +
          'border:1px solid var(--rule-soft);border-radius:6px;' + (suportado ? '' : 'opacity:.55') + '">' +
          '<span style="display:flex;gap:.5rem;align-items:flex-start;min-width:0">' +
          '<input type="checkbox" data-anexo="' + esc(id) + '"' +
          (suportado ? ' checked' : ' disabled') + ' style="margin-top:.25rem">' +
          '<span style="min-width:0">' +
          '<span style="display:block;font-size:.85rem;font-weight:600;overflow:hidden;' +
          'text-overflow:ellipsis;white-space:nowrap">' + esc(a.filename) + '</span>' +
          '<span style="display:block;font-size:.72rem;color:var(--ink-3)">' +
          (msg.instituicao ? esc(msg.instituicao.name) + ' · ' : '') +
          U.fmtDate(msg.data) + ' · ' + esc(msg.assunto.slice(0, 60)) + '</span>' +
          '</span></span>' +
          '<span class="pill ' + (suportado ? 'brass' : '') + '">' + a.ext +
          (a.size ? ' · ' + Math.round(a.size / 1024) + ' KB' : '') + '</span>' +
          '</label>';
      });
    });
    html += '</div>';
    html += '<div class="row" style="margin-top:.6rem">' +
      '<button class="btn primary" id="gimportar">Importar selecionados</button>' +
      '<span class="muted" style="font-size:.78rem">Reimportar não duplica nada — o sistema ' +
      'reconhece o que já entrou.</span></div>';

    res.innerHTML = html;

    res.querySelector('#gimportar').onclick = async () => {
      const marcados = Array.from(res.querySelectorAll('[data-anexo]:checked'))
        .map(cb => cb.dataset.anexo);
      if (!marcados.length) return UI.toast('Marque pelo menos um arquivo.', 'bad');

      const btn = res.querySelector('#gimportar');
      btn.disabled = true;
      const arquivos = [];
      for (let k = 0; k < marcados.length; k++) {
        const [msgId, idx] = marcados[k].split('|');
        const msg = r.mensagens.find(m => m.id === msgId);
        if (!msg) continue;
        btn.textContent = 'Baixando ' + (k + 1) + ' de ' + marcados.length + '…';
        try {
          arquivos.push(await G.baixarAnexo(msgId, msg.anexos[+idx]));
        } catch (e) {
          UI.toast('Falhei em baixar ' + esc(msg.anexos[+idx].filename) + ': ' + esc(e.message), 'bad');
        }
      }
      UI.closeModal();
      if (arquivos.length) UI.handleFiles(arquivos);
    };
  }

  global.GMAIL = G;
})(window);
