// Offline cache for immutable build assets only.
//
// API responses and pages are live and per-user (they depend on the session
// cookie and role), so they always go to the network — caching them served one
// user's data to the next person who signed in on the same browser.
const CACHE = 'dc-north-01-static-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.origin === self.location.origin && (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  );
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (!isStaticAsset(url)) return; // network only

  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(e.request).then((hit) =>
        hit || fetch(e.request).then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }),
      ),
    ),
  );
});
