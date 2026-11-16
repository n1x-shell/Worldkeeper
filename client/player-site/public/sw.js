/*
 * The Player Handbook's service worker: keeps the handbook on the device so it works with no signal.
 * - The page and its data (index.html, data/player.json) are fetched fresh whenever there's a connection, and the
 *   saved copy is used only when offline, so players always see the latest publish.
 * - Everything else (scripts, styles, fonts, map images) never changes under the same name, so the saved copy is used.
 * - precache.json, written when the handbook is published, lists every file, so the whole handbook (maps included)
 *   is saved on the first visit, not just the pages someone happened to open.
 */
const CACHE = 'worldkeeper-handbook';

async function precache() {
  const cache = await caches.open(CACHE);
  let list = [];
  try {
    list = await (await fetch('precache.json', { cache: 'no-store' })).json();
  } catch {
    return;
  }
  const keep = new Set(list.map((p) => new URL(p, self.registration.scope).href));
  await Promise.all(
    list.map(async (p) => {
      const url = new URL(p, self.registration.scope).href;
      const fresh = /\/(index\.html|data\/player\.json)$/.test(url) || url === self.registration.scope;
      if (!fresh && (await cache.match(url))) return;
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res.ok) await cache.put(url, res);
      } catch {
        /* offline: try again next visit */
      }
    }),
  );
  // Forget files from older publishes.
  for (const req of await cache.keys()) if (!keep.has(req.url) && req.url !== self.registration.scope) await cache.delete(req);
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(precache());
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'precache') e.waitUntil(precache());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const fresh = req.mode === 'navigate' || /\/(index\.html|data\/player\.json|precache\.json)$/.test(url.pathname) || url.href === self.registration.scope;
  if (fresh) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(new URL('index.html', self.registration.scope).href)) || Response.error()),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
