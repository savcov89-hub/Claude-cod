// Keeps the app itself on the phone so it opens without a network. The page is fetched from the network
// first (a new version shows up as soon as it is published) and from the cache when offline; the built
// files have unique names, so they are served from the cache. Server data is handled by the app (src/offline.ts).
const CACHE = 'tl-shell-v1';
const PAGE = './index.html';
// Servers add "Vary" (Origin, Accept-Encoding): a stored file must still match a module or CORS request.
const match = (req) => caches.match(req, { ignoreVary: true, ignoreSearch: false });

const assetsOf = (html) => Array.from(html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g), (m) => m[1]);

/** Stores the page and every file it needs; drops files of older versions. */
async function storePage(response) {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  const assets = assetsOf(html);
  // The page is kept only together with all its files: a page without them would open blank offline.
  const got = await Promise.all(assets.map((a) => cache.match(a, { ignoreVary: true }).then((hit) => !!hit || cache.add(a).then(() => true, () => false))));
  if (got.includes(false)) return;
  await cache.put(PAGE, response.clone());
  const keep = new Set(assets.map((a) => new URL(a, self.registration.scope).href));
  for (const req of await cache.keys()) if (req.url.includes('/assets/') && !keep.has(req.url)) await cache.delete(req);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(['./manifest.webmanifest', './icon.svg', './icon-192.png'].map((u) => cache.add(u).catch(() => undefined)));
      const res = await fetch('./', { cache: 'no-store' }).catch(() => null);
      if (res && res.ok) await storePage(res);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Fonts: from the cache once loaded.
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req, { ignoreVary: true });
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await withTimeout(fetch(req), 6000);
          if (res.ok) event.waitUntil(storePage(res.clone()));
          return res;
        } catch {
          return (await match(PAGE)) || Response.error();
        }
      })(),
    );
    return;
  }
  if (url.pathname.includes('/assets/') || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
  }
});
