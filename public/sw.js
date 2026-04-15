const CACHE_NAME = 'entia-v3';

// Only cache static assets that actually exist in this project.
// Next.js bundles CSS/JS into /_next/static — those are handled by the
// network-first fetch strategy below and should NOT be pre-cached here
// because their hashed filenames change on every build.
const URLS_TO_PRECACHE = [
  '/images/favicon.ico',
  '/images/android-chrome-192x192.png',
  '/images/android-chrome-512x512.png',
  '/images/light_on.png',
  '/images/light_off.png',
  '/images/fan_on.png',
  '/images/fan_off.png',
  '/images/shade_up.png',
  '/images/shade_down.png',
];

// Install event — cache static image assets so the UI icons work offline.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_PRECACHE).catch((err) => {
        console.warn('[sw] precache failed (non-fatal):', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event — clean up caches from older versions of the service worker.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch event strategy:
//   - WebSocket / non-GET: skip entirely.
//   - /_next/static/** (JS/CSS bundles): network-first, no cache (hashed filenames).
//   - /images/**: cache-first (device icons rarely change).
//   - Everything else: network-first with cache fallback.
self.addEventListener('fetch', (event) => {
  /*const { request } = event;

  if (request.method !== 'GET') return;
  if (request.url.startsWith('ws://') || request.url.startsWith('wss://')) return;

  const url = new URL(request.url);

  // Image assets — cache-first.
  if (url.pathname.startsWith('/images/')) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ?? fetch(request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        }).catch(() => new Response('', { status: 503 }))
      )
    );
    return;
  }

  // Next.js built assets — network only (their names are content-hashed).
  if (url.pathname.startsWith('/_next/')) return;

  // Default — network-first, fall back to cache.
  event.respondWith(
    fetch(request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        return res;
      })
      .catch(() =>
        caches.match(request).then((cached) =>
          cached ?? new Response('Offline', { status: 503 })
        )
      )
  );*/
});
