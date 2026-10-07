/* Service worker: офлайн-кэш без автоматических перезагрузок. Новый worker
   не отбирает управление у открытой игры — версия ждёт закрытия вкладок и
   включается при следующем запуске, поэтому ничего не перезагружаем и не
   вызываем skipWaiting.

   Этот файл — шаблон: сборщик подставляет в него имя кэша и список файлов
   оболочки (см. scripts/lib/vite-mir.mjs). Имя кэша включает версию и хеш
   содержимого сборки, поэтому «забыть поднять ключ кэша» больше нельзя, а
   неизменившаяся сборка не гонит пользователю новый worker.

   Документы берём из сети (свежесть важнее), остальное — stale-while-
   revalidate: экран не мигает, а следующий запуск получает обновление.
   /api/* не кэшируем вовсе: это аккаунты и живые данные хаба. */

const CACHE = '__MIR_CACHE__';
const PRECACHE = __MIR_PRECACHE__;

self.addEventListener('install', (event) => {
  /* Каждый файл кладём отдельно: один недоступный ресурс (например, иконка,
     которую владелец хостинга убрал) не должен срывать установку целиком —
     иначе офлайн ломается из-за мелочи. */
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE && name.startsWith('mir-app-'))
          .map((name) => caches.delete(name)),
      ),
    ),
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

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    })(),
  );
});
