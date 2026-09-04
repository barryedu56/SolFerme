/*
 * Service worker SolFerme — mise en cache de l'« app shell » (HTML + JS + WASM
 * SQLite + assets statiques) pour un lancement 100% hors-ligne.
 *
 * Le hors-ligne des DONNÉES est déjà géré par SQLite/OPFS (indépendant de ce SW).
 * Ce SW ne s'occupe QUE des fichiers de l'application.
 *
 * 🔧 Le SW ne contrôle PAS la page qui l'enregistre lors de sa toute première
 * visite (spec navigateur) : les requêtes du gros bundle JS, des polices et du
 * WASM SQLite, faites AVANT que le SW soit actif, ne passent jamais par lui et
 * ne sont donc jamais mises en cache par le simple mode « stale-while-revalidate »
 * ci-dessous. Résultat observé : après installation, 1ʳᵉ ouverture hors-ligne →
 * page blanche (seule la page HTML avait été pré-chargée). Fix : au moment de
 * l'installation, précharger explicitement TOUS les fichiers listés dans
 * precache-manifest.json (généré à chaque build par scripts/build-pwa-manifest.js).
 *
 * Stratégies :
 *   - Navigation (documents)      → network-first, repli sur la dernière page en cache.
 *   - Assets statiques même-origine → stale-while-revalidate (rattrapage best-effort).
 *   - Tout le reste (API, autres origines) → passe-plat (jamais intercepté).
 *
 * CACHE_VERSION est tamponné avec un identifiant de build à chaque déploiement
 * (scripts/build-pwa-manifest.js) : le contenu de ce fichier change donc à
 * chaque déploiement, ce qui déclenche la détection de mise à jour du SW par
 * le navigateur (sinon un SW dont le code ne change jamais n'est jamais
 * réinstallé, et precache-manifest.json ne serait relu qu'au hasard).
 */
const CACHE_VERSION = 'solferme-__BUILD_ID__';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = '/';
const MANIFEST_URL = '/precache-manifest.json';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(RUNTIME_CACHE).then(async (cache) => {
      // Toujours garantir la page d'entrée, même si le manifeste est absent.
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' })).catch(() => {});

      // Préchargement complet de l'app (JS, CSS, polices, WASM, icônes) listée
      // au moment du build → démarrage 100% hors-ligne dès la 1ʳᵉ visite.
      try {
        const res = await fetch(new Request(MANIFEST_URL, { cache: 'reload' }));
        if (res.ok) {
          const files = await res.json();
          await Promise.all(
            files.map((f) => cache.add(new Request(f, { cache: 'reload' })).catch(() => {}))
          );
        }
      } catch {
        // Pas de manifeste (ex: dev local sans build) : le mode
        // stale-while-revalidate rattrapera au mieux au fil des visites.
      }

      return self.skipWaiting();
    })
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
