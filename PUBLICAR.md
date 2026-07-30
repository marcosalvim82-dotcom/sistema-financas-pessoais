# Como publicar na internet

O app é totalmente estático — não existe servidor, banco remoto nem API.
Publicar significa apenas servir estes arquivos. Custo: **R$ 0/mês**.

O que você ganha publicando:

- abrir do celular, do trabalho, de qualquer lugar;
- instalar como aplicativo (ícone na tela inicial, abre sem barra de endereço);
- funcionar **offline**, porque o service worker guarda o app inteiro no dispositivo.

O que você **não** ganha:

- **sincronização.** Os lançamentos ficam no IndexedDB de cada navegador. O celular
  terá um banco vazio, separado do desktop. Para levar dados de um para o outro,
  use *Ajustes › Baixar backup* e arraste o `.json` no outro dispositivo.

---

## Passo a passo — Cloudflare Pages (recomendado)

Banda ilimitada no plano gratuito, HTTPS automático, sem cartão de crédito.

1. Crie uma conta em **dash.cloudflare.com** (grátis).
2. No menu lateral: **Workers & Pages** → **Create** → aba **Pages** →
   **Upload assets**.
3. Dê um nome ao projeto (ex.: `financas`). Ele vira `financas.pages.dev`.
4. **Arraste a pasta `Financas` inteira** para a área de upload. Suba tudo:
   `index.html`, `sw.js`, `manifest.webmanifest`, `_headers`, e as pastas
   `css`, `js` e `icons`.
5. Clique em **Deploy**. Em cerca de 20 segundos o endereço está no ar.

Pronto. Abra o endereço no celular e o navegador vai oferecer instalar o app.

> **Importante:** o arquivo `_headers` precisa estar na raiz do upload.
> É ele que aplica a política de segurança e faz o `sw.js` nunca ficar preso em cache.

### Publicando uma versão nova

Repita o upload (**Create new deployment**) e, antes, **mude a linha
`const VERSAO = 'v1.0.0';` no início do `sw.js`** — por exemplo para `v1.0.1`.
Sem isso, o navegador continua servindo o app antigo do cache.
Quem estiver com o app aberto recebe o aviso *"Nova versão disponível"*.

---

## Proteger o endereço com senha (grátis)

Sem isso, qualquer pessoa com a URL abre o app — vazio, sem os seus dados, mas
ainda assim é desconfortável.

1. No painel da Cloudflare: **Zero Trust** → **Access** → **Applications** →
   **Add an application** → **Self-hosted**.
2. Domínio: o seu `financas.pages.dev` (ou o domínio próprio).
3. Em **Policies**, crie uma regra do tipo *Allow* com **Emails** → o seu e-mail.
4. Salve.

A partir daí, abrir o endereço pede um código enviado ao seu e-mail. O plano
gratuito do Zero Trust cobre até 50 usuários.

> Se você usar o Access, a primeira visita passa por uma tela de login da
> Cloudflare. O service worker continua funcionando normalmente depois disso.

---

## Domínio próprio (opcional)

| Onde | Extensão | Preço aproximado |
|---|---|---|
| Registro.br | `.com.br` | R$ 40 / ano |
| Cloudflare Registrar | `.com` | R$ 60–90 / ano (vendem a preço de custo) |

Depois de comprar: **Pages → seu projeto → Custom domains → Set up a domain**.
O certificado HTTPS é emitido sozinho.

---

## Alternativas equivalentes

Se preferir outro provedor, o custo continua zero. Todos servem arquivos estáticos:

| Provedor | Banda no plano free | Observação |
|---|---|---|
| **Netlify** | 100 GB/mês | Lê o mesmo arquivo `_headers`. Arrasta e solta igual. |
| **GitHub Pages** | 100 GB/mês | Precisa de repositório Git. **Ignora o `_headers`** — sem CSP personalizada. |
| **Vercel** | 100 GB/mês | O plano Hobby proíbe uso comercial; uso pessoal é permitido. |

Para o volume de um app pessoal, qualquer um deles sobra: o app inteiro tem
menos de 300 KB e, depois da primeira visita, carrega do cache local.

---

## Rodando localmente, sem publicar

Continua funcionando: **duplo clique em `index.html`**.

A diferença é que service workers só funcionam em HTTPS (ou `localhost`), então
no modo arquivo local não existe instalação como app nem cache offline — mas
todo o resto é idêntico, e os dados são os mesmos de sempre.
