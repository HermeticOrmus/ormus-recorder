const CACHE = 'recorder-v1';
const ASSETS = ['/static/logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Never cache API calls or page navigations -- always network
  if (e.request.url.includes('/api/') || e.request.mode === 'navigate') return;
  // Cache-first for static assets only (images, icons)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
