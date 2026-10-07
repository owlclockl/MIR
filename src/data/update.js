/* Обновления игры: узнать, что на сервере вышла новая сборка, сказать об
   этом игроку и применить её по его команде.

   Зачем отдельный модуль. Service worker обновлял кэш молча: игрок узнавал
   о новой версии разве что по изменившемуся подвалу, а на телефоне — вообще
   никогда, потому что установленное приложение не перезагружают. Здесь
   собраны все способы узнать новость и одно правило проекта: ни один из них
   не перезагружает открытую игру сам. Обновление применяет игрок — кнопкой,
   либо оно ждёт следующего запуска (как и было).

   Откуда берётся знание:
     · service worker — браузер скачал новый sw.js и держит его в waiting.
       Имя кэша и содержимое sw.js зависят от хеша сборки, поэтому новый
       sw.js означает новую сборку;
     · сервер — файл /mir-build.json (версия и метка сборки, записанные
       сборщиком). Он нужен там, где service worker недоступен: голый http
       по локальной сети, чужая статика, старый браузер;
     · своя сборка — версия из package.json (__APP_VERSION__) и метка
       сборки из разметки (meta name="mir-build").

   Сборка считается новой, если отличается её метка (или версия там, где
   метки нет, — например, в однофайловом mir.html). Откат — версия на сервере
   меньше своей — обновлением не считается: перезагрузка вернула бы игрока
   назад. */

const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

const BUILD_INFO_PATH = '/mir-build.json';

/* Расписания. Свою сборку сравниваем часто (файл на сотню байт), а браузер о
   новом sw.js спрашиваем реже: он всё равно сам сдерживает частые проверки. */
const SERVER_CHECK_MS = 5 * 60 * 1000;
const WORKER_CHECK_MS = 30 * 60 * 1000;
const RESUME_CHECK_MS = 60 * 1000;

const meta = (name) =>
  document.querySelector(`meta[name="${name}"]`)?.content?.trim() || '';

/* Метку сборки подставляет сборщик в разметку (scripts/lib/vite-mir.mjs).
   В однофайловой версии её нет — там остаётся сравнение версий. */
const BUILD = meta('mir-build');

const info = {
  started: false,
  supported: false, // service worker доступен на этой странице
  checkable: true, // есть чем проверить: worker или сервер по http(s)
  registration: null,
  phase: 'idle', // idle | checking | downloading | ready | stale | error | unavailable
  latest: null, // { version, build } — то, что нашлось на сервере
  available: false,
  dismissed: false, // «Позже» — до конца сеанса
  announceKey: '', // про какую сборку уже сказали игроку
  notify: false, // настройка «уведомления на телефон»
  permission: '', // Notification.permission
  workerWaiting: false, // новый worker скачан и ждёт команды
  lastCheck: 0,
  lastWorkerCheck: 0,
  pending: null,
  applying: false,
};

const listeners = new Set();
let emittedKey = '';

export const currentVersion = () => VERSION;

/* Снимок без внутренностей: наблюдателю нужны только факты. */
const snapshot = () => ({
  phase: info.phase,
  latest: info.latest ? { ...info.latest } : null,
  available: info.available,
  dismissed: info.dismissed,
  announceKey: info.announceKey,
  notify: info.notify,
  permission: info.permission,
  lastCheck: info.lastCheck,
  supported: info.supported,
  checkable: info.checkable,
  /* Новая версия уже скачана и ждёт команды: от этого зависит текст строки,
     и во время проверки он меняться не должен — иначе «готова к запуску»
     мигало бы на «вышла новая версия» каждые пять минут. */
  waiting: info.available && info.workerWaiting,
});

export const getUpdateInfo = () => snapshot();

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/* Наблюдателей зовём только когда что-то изменилось по существу: проверка
   идёт каждые пять минут, и перерисовывать на неё окно настроек нельзя. */
const emitIfChanged = () => {
  const key = [
    info.phase,
    info.available,
    info.dismissed,
    info.latest?.build ?? '',
    info.latest?.version ?? '',
    info.notify,
    info.permission,
    info.lastCheck,
    info.available && info.workerWaiting,
  ].join('|');
  if (key === emittedKey) return;
  emittedKey = key;
  const state = snapshot();
  for (const fn of [...listeners]) {
    try {
      fn(state);
    } catch {
      /* Наблюдатель не должен ломать проверку обновлений. */
    }
  }
};

/* ---------- service worker ------------------------------------ */

/* Регистрация разрешена только там, где браузер её вообще даёт: https,
   localhost и петлевой адрес. По голому http в локальной сети её нет —
   тогда работает проверка по серверу. */
const swSupported = () =>
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '[::1]');

const watched = new WeakSet();

/* Следим за состоянием новой версии: скачивается → установлена и ждёт.
   Ждущий worker — это и есть «обновление готово»: новая оболочка уже в его
   кэше, осталась команда перейти на неё. */
const watch = (registration) => {
  if (watched.has(registration)) return;
  watched.add(registration);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    /* Без управляющего worker'а это не обновление, а первая установка. */
    if (!info.available && navigator.serviceWorker.controller) {
      info.phase = 'downloading';
      emitIfChanged();
    }
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' || installing.state === 'redundant') {
        evaluateWorker(registration);
        emitIfChanged();
      }
    });
  });
  evaluateWorker(registration);
};

/* Готовый к запуску worker — обновление. Условие «страницей уже управляет
   service worker» отсекает первую установку: тогда новый worker — это не
   новая версия, а первая.

   Один worker сам по себе ещё не новость: сразу после перезагрузки на свежую
   сборку он может просто догонять кэш. Поэтому не объявляем обновление сами,
   а сразу переспрашиваем сервер — он знает точнее (см. check). */
const evaluateWorker = (registration) => {
  const ready = Boolean(registration.waiting) && Boolean(navigator.serviceWorker.controller);
  info.workerWaiting = ready;
  if (!ready) return false;
  check();
  return true;
};

const registerWorker = async () => {
  if (!swSupported()) {
    info.supported = false;
    return null;
  }
  info.supported = true;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    info.registration = registration;
    watch(registration);
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    syncNotifyPreference();
    return registration;
  } catch {
    /* Регистрация не удалась (например, страница открыта по http в
       локальной сети) — остаётся проверка по серверу. */
    info.supported = false;
    return null;
  }
};

const onControllerChange = () => {
  syncNotifyPreference();
  /* Управление перешло к новому worker. Если это сделали мы по кнопке
     «Обновить» — перезагружаем страницу: без перезагрузки она осталась бы
     со старым кодом и новым worker. Само по себе обновление страницу не
     трогает. */
  if (info.applying) reload();
};

const reload = () => {
  try {
    location.reload();
  } catch {
    /* Среда без навигации (например, проверка интерфейса) — молча. */
  }
};

/* ---------- сервер -------------------------------------------- */

const parseVersion = (value) =>
  String(value || '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);

const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
};

/* Что на сервере. Не получилось (офлайн, нет такого файла, открыт не по
   http) — значит просто ничего не знаем. */
const fetchBuildInfo = async () => {
  if (!/^https?:$/.test(location.protocol) || typeof fetch !== 'function') return null;
  try {
    const response = await fetch(BUILD_INFO_PATH, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || typeof data !== 'object') return null;
    return { version: String(data.version ?? ''), build: String(data.build ?? '') };
  } catch {
    return null;
  }
};

/* Новее ли то, что на сервере. Метка сборки — точный ответ: она меняется от
   любого изменения кода. Там, где метки нет (однофайловая версия), сверяем
   версии. */
const verdictFor = (server) => {
  if (!server) return null;
  if (BUILD && server.build) {
    if (server.build === BUILD) return null;
    if (server.version && compareVersions(server.version, VERSION) < 0) return null; // откат
    return server;
  }
  if (server.version && server.version !== VERSION) {
    if (compareVersions(server.version, VERSION) < 0) return null;
    return server;
  }
  return null;
};

/* ---------- проверка ------------------------------------------ */

export const check = ({ manual = false } = {}) => {
  /* Явная проверка — это ещё и «покажи новость, если она есть»: игрок,
     который раньше нажал «Позже», ждёт ответа на своё действие. */
  if (manual) info.dismissed = false;
  /* Проверять нечем (открыт файл с диска: mir.html, приложение внутри .apk):
     говорим об этом прямо, а не показываем «проверено только что». */
  if (!info.checkable) {
    info.phase = 'unavailable';
    emitIfChanged();
    return Promise.resolve(snapshot());
  }
  if (info.pending) return info.pending;

  const run = (async () => {
    info.phase = 'checking';
    emitIfChanged();
    try {
      const registration = info.registration ?? (await registerWorker());
      if (registration && Date.now() - info.lastWorkerCheck > WORKER_CHECK_MS) {
        info.lastWorkerCheck = Date.now();
        try {
          await registration.update();
        } catch {
          /* Нет сети — узнаем при следующей попытке. */
        }
      }
      const workerWaiting = Boolean(registration?.waiting) && Boolean(navigator.serviceWorker?.controller);
      info.workerWaiting = workerWaiting;
      const server = await fetchBuildInfo();
      const serverLatest = verdictFor(server);
      /* Сервер — главный свидетель: он про то, что лежит на сервере сейчас.
         Если он ответил и наша сборка для него уже текущая, ждущий worker —
         не новая версия, а догоняющий кэш. Если сервер промолчал (нет файла,
         офлайн), верим worker'у. */
      const workerIsNews = workerWaiting && (!server || Boolean(serverLatest));

      info.available = Boolean(serverLatest || workerIsNews);
      info.latest = serverLatest ?? (info.available ? { version: '', build: '' } : null);
      info.phase = info.available
        ? workerIsNews
          ? 'ready'
          : 'stale'
        : manual && !server
          ? 'error'
          : 'idle';
      info.lastCheck = Date.now();
      info.announceKey = info.available
        ? info.latest?.build || info.latest?.version || 'waiting'
        : '';
    } catch {
      info.phase = manual ? 'error' : info.phase === 'checking' ? 'idle' : info.phase;
    }
    emitIfChanged();
    return snapshot();
  })();

  info.pending = run.finally(() => {
    info.pending = null;
  });
  return info.pending;
};

/* ---------- применение ---------------------------------------- */

/* Обновляемся: новый worker берёт управление и страница перезагружается.
   Если worker не ждёт (например, новость пришла от сервера, а service worker
   ещё не успел скачаться), достаточно обычной перезагрузки: документ
   страница всегда берёт из сети. */
export const apply = () => {
  const registration = info.registration;
  const waiting = registration?.waiting;
  if (!waiting || !navigator.serviceWorker?.controller) {
    reload();
    return;
  }
  info.applying = true;
  try {
    registration.waiting.postMessage({ type: 'mir:skip-waiting' });
  } catch {
    reload();
    return;
  }
  /* Перезагрузка случится по controllerchange. Но если браузер новый worker
     так и не поднял, через три секунды перезагружаемся сами — хуже от этого
     не будет, страница всё равно возьмётся из сети. */
  setTimeout(() => {
    if (info.applying) reload();
  }, 3000);
};

export const dismiss = () => {
  info.dismissed = true;
  emitIfChanged();
};

/* ---------- уведомления на телефон ---------------------------- */

const notificationSupported = () =>
  info.supported && typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function';

export const notificationState = () => ({
  supported: notificationSupported(),
  permission: typeof Notification !== 'undefined' ? Notification.permission : '',
  enabled: info.notify,
});

/* Настройка живёт в localStorage страницы, а service worker его не видит:
   чтобы фоновая проверка не спорила с выбором игрока, передаём значение
   сообщением, а worker держит его у себя (см. src/sw.js). */
const syncNotifyPreference = () => {
  try {
    navigator.serviceWorker?.controller?.postMessage({
      type: 'mir:notify-preference',
      value: info.notify,
    });
  } catch {
    /* Нет управляющего worker — передадим после controllerchange. */
  }
};

const closeDeviceNotifications = () => {
  try {
    info.registration
      ?.getNotifications?.({ tag: 'mir-update' })
      .then((list) => list.forEach((note) => note.close()))
      .catch(() => {});
  } catch {
    /* Нечего закрывать. */
  }
};

/**
 * Включить или выключить уведомления телефона.
 * @param {boolean} enabled
 * @param {{ ask?: boolean }} [options] ask — спросить разрешение (только из
 *   обработчика действия игрока: браузер показывает запрос лишь по жесту).
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'|'off'>}
 */
export const setNotify = async (enabled, { ask = false } = {}) => {
  if (!enabled) {
    info.notify = false;
    syncNotifyPreference();
    closeDeviceNotifications();
    emitIfChanged();
    return 'off';
  }
  if (!notificationSupported()) return 'unsupported';
  if (info.permission !== 'granted' && ask) {
    try {
      info.permission = await Notification.requestPermission();
    } catch {
      info.permission = 'denied';
    }
  }
  if (info.permission !== 'granted') {
    info.notify = false;
    emitIfChanged();
    return info.permission || 'denied';
  }
  info.notify = true;
  syncNotifyPreference();
  emitIfChanged();
  return 'granted';
};

/** Уведомление в шторке телефона — если игрок это разрешил. */
export const notifyDevice = ({ title, body }) => {
  if (!info.notify || !notificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  const registration = info.registration;
  if (typeof registration?.showNotification !== 'function') return false;
  try {
    registration
      .showNotification(title, {
        body,
        tag: 'mir-update',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: '/' },
      })
      .catch(() => {});
    return true;
  } catch {
    return false;
  }
};

/* ---------- запуск -------------------------------------------- */

export const start = () => {
  if (info.started) return;
  info.started = true;
  info.permission = typeof Notification !== 'undefined' ? Notification.permission : '';
  info.notify = false;
  info.checkable = swSupported() || /^https?:$/.test(location.protocol);

  /* Открыли файл с диска (mir.html, .apk): сверять не с чем — такую копию
     обновляют целиком, новой сборкой. */
  if (!info.checkable) {
    info.phase = 'unavailable';
    emitIfChanged();
    return;
  }

  /* Регистрация и первая проверка — сразу; расписание подключаем независимо,
     чтобы проверка работала и без service worker (по локальной сети, в
     однофайловой сборке). */
  registerWorker().then(() => check());

  setInterval(() => {
    if (document.visibilityState === 'visible') check();
  }, SERVER_CHECK_MS);

  /* Телефон не закрывает приложение — он его сворачивает. Возврат в игру
     проверяем отдельно: за время в фоне сборка могла смениться. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - info.lastCheck < RESUME_CHECK_MS) return;
    check();
  });

  window.addEventListener('online', () => check());
};
