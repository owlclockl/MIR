/* Офлайн-кэш без автоматических перезагрузок. Новый worker не отбирает
   управление у открытой игры: версия ждёт закрытия вкладок и включается
   при следующем запуске. Документы берём из сети, /api/* не кэшируем. */

const CACHE = 'mir-app-v4';
const PRECACHE = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put('/', response.clone())).catch(() => {});
          return response;
        })
        .catch(async () => (await caches.match('/')) || Response.error()),
    );
    return;
  }

  /* Stale-while-revalidate: экран не мигает в ожидании сети, но следующий
     запуск уже получает новые шрифты, звуки и манифест. */
  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
