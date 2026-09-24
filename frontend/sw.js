/*
 * Service worker do app instalado (ERP no celular/computador como aplicativo).
 * Não guarda telas nem scripts em cache: tudo continua vindo do servidor a cada acesso, como no navegador
 * (senão uma atualização do ERP podia ficar presa numa versão velha). A única coisa guardada é a página
 * "sem conexão", mostrada quando a internet cai no meio do uso.
 */
const CACHE = 'erp-offline-v1';
const PAGINA_OFFLINE = 'offline.html';

self.addEventListener('install', (evento) => {
    evento.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll([PAGINA_OFFLINE, 'img/app/icone-192.png']))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (evento) => {
    evento.waitUntil(
        caches.keys()
            .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (evento) => {
    // Só a abertura de telas passa por aqui; API (outro domínio), imagens e scripts seguem direto.
    if (evento.request.mode !== 'navigate') return;
    evento.respondWith(
        fetch(evento.request).catch(() => caches.match(PAGINA_OFFLINE))
    );
});
