/* Service worker: офлайн-кэш без автоматических перезагрузок. Новый worker
   не отбирает управление у открытой игры сам — версия ждёт закрытия вкладок
   и включается при следующем запуске. Перейти на неё раньше можно только по
   просьбе страницы (сообщение mir:skip-waiting): так работает кнопка
   «Обновить сейчас» — открытую игру она не прерывает сама, её нажимает игрок.

   Этот файл — шаблон: сборщик подставляет в него имя кэша, список файлов
   оболочки, метку и версию сборки (см. scripts/lib/vite-mir.mjs). Имя кэша
   включает версию и хеш содержимого сборки, поэтому «забыть поднять ключ
   кэша» больше нельзя, а неизменившаяся сборка не гонит пользователю новый
   worker.

   Документы берём из сети (свежесть важнее), остальное — stale-while-
   revalidate: экран не мигает, а следующий запуск получает обновление.
   /api/* не кэшируем вовсе: это аккаунты и живые данные хаба, а
   /mir-build.json — свежие новости о версии: отдать его из кэша значит
   сравнивать старую сборку со старой же и никогда не увидеть новую. */

const CACHE = '__MIR_CACHE__';
const PRECACHE = __MIR_PRECACHE__;
const BUILD = '__MIR_BUILD__';
const VERSION = '__MIR_VERSION__';

/* Файл, по которому приложение узнаёт о новой сборке на сервере. */
const BUILD_INFO_PATH = '/mir-build.json';
/* Тег фоновой проверки: по нему браузер будит worker (periodicsync). */
const UPDATE_TAG = 'mir-update-check';
/* Кэш настроек: страница присылает сюда выбор игрока («уведомления на
   телефон»), потому что localStorage service worker не видит. Отдельное имя,
   чтобы чистка версий его не задевала. */
const PREFS_CACHE = 'mir-prefs';
const PREF_URL = '/mir-notify-preference';

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
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== CACHE && name.startsWith('mir-app-'))
          .map((name) => caches.delete(name)),
      );
      /* Фоновая проверка обновлений: там, где браузер это умеет (Chrome на
         Android для установленного приложения), worker просыпается по
         расписанию системы и может сказать о новой сборке даже с полностью
         закрытой игрой — см. periodicsync ниже. Разрешения здесь не
         спрашивают: не готов браузер — просто ничего не произойдёт. */
      try {
        if (self.registration.periodicSync) {
          await self.registration.periodicSync.register(UPDATE_TAG, {
            minInterval: 12 * 60 * 60 * 1000,
          });
        }
      } catch {
        /* Браузер не даёт фоновую проверку — о версии скажет страница. */
      }
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname === BUILD_INFO_PATH) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    /* Основной экран — SPA (`/`), но встроенный редактор Azgaar — отдельный
       документ (`/fmg/index.html`). Не кладём её в ключ `/`: иначе обычная
       страница игры при следующем офлайн-запуске превращается в карту. */
    const documentPath =
      url.pathname === '/fmg' || url.pathname === '/fmg/'
        ? '/fmg/index.html'
        : url.pathname.startsWith('/fmg/') ? url.pathname : '/';
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok)
            caches.open(CACHE).then((cache) => cache.put(documentPath, response.clone())).catch(() => {});
          return response;
        })
        .catch(async () => (await caches.match(documentPath)) || Response.error()),
    );
    return;
  }

  event.respondWith(
    (async () => {
      /* Azgaar annotates fixed-path assets with ?v=...; the offline precache
         stores their canonical path without that query. */
      const cached = await caches.match(request, { ignoreSearch: url.pathname.startsWith('/fmg/') });
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

/* ---------- просьбы страницы ---------------------------------- */

self.addEventListener('message', (event) => {
  const data = event.data || {};
  /* «Обновить сейчас»: страница просит нового worker'а взять управление.
     Только по её команде — сам worker этого не делает никогда. */
  if (data.type === 'mir:skip-waiting') {
    self.skipWaiting();
    return;
  }
  /* Настройка «уведомления на телефон»: запоминаем, чтобы фоновая проверка
     не спорила с выбором игрока. */
  if (data.type === 'mir:notify-preference') {
    event.waitUntil(writeNotifyPreference(Boolean(data.value)));
  }
});

/* ---------- уведомление в шторке телефона --------------------- */

const writeNotifyPreference = async (value) => {
  try {
    const cache = await caches.open(PREFS_CACHE);
    await cache.put(PREF_URL, new Response(value ? 'on' : 'off'));
  } catch {
    /* Нет доступа к Cache Storage — тогда фоновая проверка промолчит. */
  }
};

const readNotifyPreference = async () => {
  try {
    const cache = await caches.open(PREFS_CACHE);
    const stored = await cache.match(PREF_URL);
    return stored ? (await stored.text()) === 'on' : false;
  } catch {
    return false;
  }
};

const updateNotification = () => ({
  tag: 'mir-update',
  icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png',
  data: { url: '/' },
});

/* Открыть (или найти) игру, когда игрок нажал на уведомление. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = all.find((client) => client.url.startsWith(self.location.origin));
      if (open) {
        await open.focus();
        return;
      }
      await clients.openWindow(target);
    })(),
  );
});

/* Фоновая проверка: будит систему, а не игрока. Событие приходит только в
   тех браузерах, где это вообще разрешено, и по расписанию системы. */
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== UPDATE_TAG) return;
  event.waitUntil(checkInBackground());
});

const checkInBackground = async () => {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!(await readNotifyPreference())) return;
    const response = await fetch(BUILD_INFO_PATH, { cache: 'no-store' });
    if (!response.ok) return;
    const info = await response.json();
    /* Метка та же — сборка не менялась, будить игрока незачем. */
    if (!info || !info.build || info.build === BUILD) return;
    await self.registration.showNotification('Вышло обновление', {
      ...updateNotification(),
      body: `The civilization of the sages — сборка ${info.version || VERSION}. Откройте игру и нажмите «Обновить».`,
    });
  } catch {
    /* Офлайн или нет прав — о версии скажет страница при запуске. */
  }
};
