
const CACHE_NAME = 'zentime-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/zentime_icon.png'
];

// Precache assets during install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Serve cached content when offline
self.addEventListener('fetch', (event) => {
  // For navigation requests (HTML pages), always serve index.html to allow client-side routing
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html')
        .then(response => {
          return response || fetch(event.request);
        })
    );
    return;
  }

  // For other requests, try network first, fall back to cache
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then(response => {
        return response || caches.match('/index.html');
      });
    })
  );
});

// Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
});
