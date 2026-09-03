/*
 * Service worker SolFerme — mise en cache de l'« app shell » (HTML + JS + WASM
 * SQLite + assets statiques) pour un lancement 100% hors-ligne.
 *
 * Le hors-ligne des DONNÉES est déjà géré par SQLite/OPFS (indépendant de ce SW).
 * Ce SW ne s'occupe QUE des fichiers de l'application.
 *
 * Stratégies :
 *   - Navigation (documents)      → network-first, repli sur la dernière page en cache.
 *   - Assets statiques même-origine → stale-while-revalidate.
 *   - Tout le reste (API, autres origines) → passe-plat (jamais intercepté).
 *
 * Bumper CACHE_VERSION à chaque changement structurel de ce fichier.
 */
const CACHE_VERSION = 'solferme-v1';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  // Pré-charge la page d'entrée pour garantir un boot hors-ligne.
  event.waitUntil(
    caches.open(RUNTIME_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== RUNTIME_CACHE && k.startsWith('solferme-'))
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

const isStaticAsset = (url) =>
  url.origin === self.location.origin && (
    url.pathname.startsWith('/_expo/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/pwa/') ||
    /\.(js|css|png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf|otf|wasm|json)$/i.test(url.pathname)
  );

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Requêtes vers l'API / une autre origine (backend Django) : jamais interceptées.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigation : network-first, repli cache (dernière page connue ou OFFLINE_URL).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(RUNTIME_CACHE);
          return (await cache.match(request)) || (await cache.match(OFFLINE_URL)) || Response.error();
        })
    );
    return;
  }

  // Assets statiques : stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

// Permet à la page de forcer l'activation d'une nouvelle version.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
