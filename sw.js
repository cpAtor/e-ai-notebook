const CACHE_NAME = 'e-ai-notebook-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/src/app.js',
  '/src/notebook.js',
  '/src/persistence.js',
  '/src/styles.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => (
      cachedResponse ?? fetch(event.request)
    )),
  );
});
