/* ══════════════════════════════════════════════════════════════════
   sw.js — service worker

   Guarda o app inteiro em cache para abrir instantâneo e funcionar
   sem internet. Nenhum dado financeiro passa por aqui: o cache é só
   do código; os lançamentos vivem no IndexedDB da página.

   Para publicar uma versão nova, mude VERSAO. O navegador detecta a
   diferença no próximo acesso, baixa tudo de novo e a página mostra
   o aviso de atualização.
   ══════════════════════════════════════════════════════════════════ */

const VERSAO = 'v1.4.1';
const CACHE = 'financas-' + VERSAO;

const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/util.js',
  './js/store.js',
  './js/rules.js',
  './js/pdf.js',
  './js/pdftx.js',
  './js/parse.js',
  './js/engine.js',
  './js/insights.js',
  './js/charts.js',
  './js/xlsx.js',
  './js/ui.js',
  './js/views.js',
  './js/views2.js',
  './js/gmail.js',
  './js/demo.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-180.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll falha inteiro se um arquivo faltar; adiciona um a um para
    // que um recurso opcional ausente não impeça a instalação.
    await Promise.all(ARQUIVOS.map(async url => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (e) { console.warn('[sw] não consegui cachear', url, e); }
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.map(n => {
      if (n.startsWith('financas-') && n !== CACHE) return caches.delete(n);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: rede primeiro, para pegar versão nova assim que existir;
  // cai para o cache quando está sem internet.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const resp = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, resp.clone());
        return resp;
      } catch (e) {
        return (await caches.match(req)) ||
          (await caches.match('./index.html')) ||
          new Response('Sem conexão e sem cópia local.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  // Demais recursos: cache primeiro (são versionados pelo nome do cache).
  event.respondWith((async () => {
    const emCache = await caches.match(req);
    if (emCache) return emCache;
    try {
      const resp = await fetch(req);
      if (resp && resp.status === 200 && resp.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, resp.clone());
      }
      return resp;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});

// A página pede para assumir imediatamente quando você clica em atualizar.
self.addEventListener('message', event => {
  if (event.data && event.data.tipo === 'ASSUMIR_AGORA') self.skipWaiting();
});
