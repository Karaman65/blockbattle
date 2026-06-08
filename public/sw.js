const CACHE_NAME = 'block-battle-v103';
const ASSETS = [
  '/',
  '/index.html',
  '/privacy.html',
  '/reset-password.html',
  '/delete-account.html',
  '/css/style.css',
  '/css/mobile-performance.css',
  '/css/figma-ui.css',
  '/js/firebase-config.js',
  '/js/economy-api.js',
  '/js/ui-header.js',
  '/js/blocks.js',
  '/js/audio.js',
  '/js/renderer.js',
  '/js/input.js',
  '/js/network.js',
  '/js/socket.io.min.js',
  '/js/auth.js',
  '/js/db.js',
  '/js/ad.js',
  '/js/iap.js',
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
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('firebaseapp') ||
      e.request.url.includes('googleapis') ||
      e.request.url.includes('socket.io') ||
      e.request.url.includes('gstatic.com')) {
    return;
  }

  const req = e.request;
  const isHtmlRequest = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHtmlRequest) {
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  const url = new URL(req.url);
  if (url.origin === self.location.origin && /\.(css|js)$/.test(url.pathname)) {
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(req, response.clone());
          return response;
        });
      });
    }).catch(() => caches.match(req))
  );
});
