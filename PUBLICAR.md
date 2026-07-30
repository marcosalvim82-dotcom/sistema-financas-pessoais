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

## Configuração — Cloudflare Pages conectado ao GitHub

Banda ilimitada no plano gratuito, HTTPS automático, sem cartão de crédito.
Depois de configurado, **todo `git push` publica sozinho** em cerca de 30 segundos.

O repositório já está apontado para:
`https://github.com/marcosalvim82-dotcom/sistema-financas-pessoais`

### Passo 1 — primeiro envio (uma vez só)

**Dê duplo clique em `publicar.cmd`.**

Ele mostra o que ainda não foi publicado, roda o teste de fumaça, pergunta se você
confirma e só então envia. Se o teste falhar, ele se recusa a publicar.

No primeiro uso vai abrir uma janela do GitHub pedindo login. Autorize e volte.
A credencial fica salva pelo Git Credential Manager; os próximos envios não pedem nada.

<details>
<summary>Prefere fazer pelo terminal?</summary>

Abra o Explorador de Arquivos na pasta `C:\Users\marco\Financas`, clique na barra
de endereço, apague o caminho, escreva `cmd` e aperte Enter. Abre um terminal já
dentro da pasta. Aí:

```bash
git push -u origin main
```
</details>

### Passo 2 — conectar a Cloudflare (uma vez só)

1. Entre em **dash.cloudflare.com** (conta gratuita).
2. **Workers & Pages** → **Create** → aba **Pages** → **Connect to Git**.
3. Autorize o acesso da Cloudflare ao GitHub e escolha o repositório
   `sistema-financas-pessoais`.
4. Nas configurações de build:
   - **Framework preset:** `None`
   - **Build command:** deixe **vazio**
   - **Build output directory:** `/`

   É um site estático puro; não existe etapa de build.
5. **Save and Deploy.**

O endereço fica `sistema-financas-pessoais.pages.dev` (ou o nome que você escolher).

> O arquivo `_headers` precisa continuar na raiz. É ele que aplica a política de
> segurança, marca o site como `noindex` e impede o `sw.js` de ficar preso em cache.

### Depois disso: publicar é só empurrar

```bash
git push
```

A Cloudflare detecta o commit e publica. Você acompanha em *Deployments*.

Se algo sair errado, dá para voltar: em *Deployments*, qualquer versão anterior
tem a opção **Rollback to this deployment**. O histórico do git dá a mesma
garantia do lado do código.

### A regra que não pode ser esquecida

**Toda alteração nos arquivos do app exige incrementar `const VERSAO` no topo do
`sw.js`** (`v1.0.0` → `v1.0.1`). Sem isso o navegador continua servindo a versão
antiga do cache e parece que a mudança não funcionou. Quem estiver com o app
aberto recebe o aviso *"Nova versão disponível"*.

Isso está registrado no `CLAUDE.md`, então o Claude faz automaticamente a cada
alteração que peça publicação.

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
