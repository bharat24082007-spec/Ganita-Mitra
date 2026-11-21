// Offline cache for the app shell and chapter data.
const CACHE = 'ganita-mitra-v3';
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/data/chapter.json'];

self.addEventListener('install', (event) => {
  // Do not skip waiting here: a new version waits until the user accepts the update prompt.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

// The page posts this after the user taps "Update now".
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Drop old cache versions so storage does not grow on a shared phone.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Never intercept API calls; let them go straight to the network
  if (new URL(event.request.url).pathname.startsWith('/api/')) return;

  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Network-first so page updates arrive quickly; fall back to the cached shell offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache only complete, same-origin 200 responses, matching the cache-first branch.
          if (res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for assets: saves low data on repeat visits.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          // Cache only complete, same-origin 200 responses; never cache API paths.
          const path = new URL(req.url).pathname;
          if (res.status === 200 && res.type === 'basic' && !path.startsWith('/api/')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
