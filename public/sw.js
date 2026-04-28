const CACHE_NAME = 'block-battle-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/firebase-config.js',
  '/js/blocks.js',
  '/js/audio.js',
  '/js/renderer.js',
  '/js/input.js',
  '/js/network.js',
  '/js/auth.js',
  '/js/db.js',
  '/js/game.js',
  '/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Network first for API/socket calls, cache first for static assets
  if (e.request.url.includes('firebaseapp') || 
      e.request.url.includes('googleapis') ||
      e.request.url.includes('socket.io') ||
      e.request.url.includes('gstatic.com')) {
    return; // Let these pass through to network
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, response.clone());
          return response;
        });
      });
    }).catch(() => caches.match('/'))
  );
});
