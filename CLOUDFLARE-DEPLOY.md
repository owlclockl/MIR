# Деплой и обновления на Cloudflare Workers — руководство для переноса в новый проект

Этот документ описывает полную схему бесплатного хостинга и доставки обновлений, которая использовалась в проекте, в виде готового руководства и шаблонов кода для переноса в **любой новый проект с нуля**.

---

## 1. Как это работает (архитектура)

Один **Cloudflare Worker** на бесплатном тарифе (`https://<имя-проекта>.<ваш-аккаунт>.workers.dev`) обслуживает сразу всё приложение по одному адресу:

1. **Статический сайт / PWA (`dist/`)** — раздаётся платформой через механизм **Cloudflare Workers Static Assets** (`[assets]` в `wrangler.toml`) бесплатно и без вызова JS-кода воркера на обычные файлы.
2. **Серверный API и живой канал (`/api/*`, WebSocket `/api/ws`)** — перехватываются воркером до статики (`run_worker_first = ["/api/*"]`) и направляются в единый глобальный экземпляр **Durable Object**.
3. **Постоянная база данных (Durable Object + встроенный SQLite)** — на бесплатном тарифе Cloudflare доступны SQLite-классы (`new_sqlite_classes`, до 5 ГБ хранения и 100 000 запросов в сутки без привязки банковской карты). Данные и секреты воркера живут на стороне Cloudflare и **не стираются при повторных деплоях**.
4. **Два способа публикации обновлений**:
   - **Вручную с ПК:** `npm run host` (или `.bat`-меню на Windows) собирает `dist/` и публикует статику + код воркера командой `npx --yes wrangler@4 deploy`.
   - **Автоматически из GitHub Actions:** при каждом `push` / мерже PR в ветку `main` workflow прогоняет тесты, собирает `dist/` и вызывает `npx --yes wrangler@4 deploy` с секретами `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`.
5. **Бесшовное обновление у открытых клиентов:** сборщик генерирует короткий SHA-256 хеш содержимого сборки (`buildId`), кладёт его в `<meta name="app-build">`, в `/app-build.json` и в имя кэша Service Worker (`/sw.js`). Открытое приложение проверяет `/app-build.json` с `cache: 'no-store'`, сообщает пользователю о выходе новой версии и применяет её по кнопке без принудительного сброса сессии.

### Главный архитектурный принцип: отделение ядра от адаптера

Чтобы один и тот же сервер работал и локально на ПК (Node.js), и в Cloudflare Workers, разделите сервер на два слоя:

- **`server/core.mjs`** — чистая бизнес-логика без импортов `node:*` (использует только стандартные Web API: `fetch`, `URL`, `crypto.subtle`, `TextEncoder`, `setTimeout`).
- **`hosting/cloudflare/worker.js`** — тонкий адаптер Cloudflare: проверяет лимит размера тела запроса, держит состояние в `state.storage` Durable Object, принимает `WebSocketPair` и передаёт вызовы в `core`.

---

## 2. Минимальная структура файлов в новом проекте

```text
my-new-project/
├─ .github/
│  └─ workflows/
│     └─ deploy.yml               # Автопроверка и автодеплой в Cloudflare при пуше в main
├─ hosting/
│  └─ cloudflare/
│     └─ worker.js                # Входной Worker + класс Durable Object (SQLite + WebSocket)
├─ server/
│  └─ core.mjs                    # Чистая серверная логика (без node:*, общая для ПК и Cloudflare)
├─ scripts/
│  └─ vite-build-plugin.mjs       # Генерация метки сборки, /app-build.json и dist/sw.js
├─ public/
│  └─ _headers                    # Заголовки кэширования статики для Cloudflare Assets
├─ src/
│  ├─ main.js                     # Клиентский код приложения
│  ├─ update.js                   # Проверка выхода новой версии на сервере и обновление по кнопке
│  └─ sw.js                       # Шаблон Service Worker (офлайн-кэш + фоновая проверка)
├─ index.html                     # Точка входа Vite
├─ vite.config.js                 # Сборка веб-версии в dist/
├─ wrangler.toml                  # Конфигурация Cloudflare Workers, Assets и Durable Object
├─ package.json                   # Скрипты сборки, деплоя, секретов и логов
└─ ДЕПЛОЙ.bat                     # (Опционально) Меню публикации в один клик для Windows
```

---

## 3. Готовые шаблоны файлов для нового проекта

> Во всех шаблонах ниже замените идентификаторы `myapp` / `MyAppHub` / `MYAPP_ADMIN_KEY` на название вашего нового проекта.

### 3.1. `wrangler.toml`

```toml
# Конфигурация Cloudflare Workers (бесплатный тариф).
#   npm run host      — собрать dist/ и залить обновление в интернет
#   npm run host:dev  — запустить локально через workerd без публикации

name = "myapp"
main = "hosting/cloudflare/worker.js"
compatibility_date = "2026-09-01"
workers_dev = true

# Логи ошибок без записи query string (защита токенов в URL).
[observability]
enabled = true
redact_query_string = true

[observability.logs]
enabled = true
head_sampling_rate = 1
invocation_logs = false

[observability.traces]
enabled = true
head_sampling_rate = 0.01

# Статические файлы фронтенда из dist/.
# Все запросы к /api/* идут сначала в код воркера, а не в SPA-страницу.
[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]

# Секреты (например, MYAPP_ADMIN_KEY) НЕ вписываются в [vars], чтобы не попасть в Git.
# Они задаются один раз командой:
#   npm run host:secret   (npx wrangler secret put MYAPP_ADMIN_KEY)
# и сохраняются при всех последующих деплоях и автодеплоях из GitHub Actions.

[[durable_objects.bindings]]
name = "HUB"
class_name = "MyAppHub"

# На бесплатном тарифе обязательно использовать new_sqlite_classes.
[[migrations]]
tag = "v1"
new_sqlite_classes = ["MyAppHub"]
```

---

### 3.2. `package.json`

```json
{
  "name": "myapp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0",
    "host": "npm run build && npx --yes wrangler@4 deploy",
    "host:login": "npx --yes wrangler@4 login",
    "host:dev": "npm run build && npx --yes wrangler@4 dev",
    "host:secret": "npx --yes wrangler@4 secret put MYAPP_ADMIN_KEY",
    "host:secrets": "npx --yes wrangler@4 secret list",
    "host:logs": "npx --yes wrangler@4 tail"
  },
  "devDependencies": {
    "vite": "^7.1.9"
  }
}
```

---

### 3.3. `public/_headers`

Хешированные бандлы Vite (`/assets/*`) можно кэшировать навечно, тогда как `index.html`, `/sw.js` и `/app-build.json` всегда проверяются на свежесть:

```text
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/sw.js
  Cache-Control: no-cache

/app-build.json
  Cache-Control: no-store
```

---

### 3.4. `server/core.mjs` (каркас платформонезависимого ядра)

```js
export const MAX_REQUEST_BYTES = 512 * 1024; // 512 КиБ

export const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
});

export function createHubCore({ db, persist, adminKey = '' }) {
  const sockets = new Set();

  return {
    stats: () => ({ sockets: sockets.size }),

    tick() {
      // Периодическая очистка неактивных комнат/сокетов (вызывается раз в 15 с, пока есть сокеты)
    },

    socket: {
      open(conn) {
        sockets.add(conn);
      },
      message(conn, data) {
        // data: строка (JSON) или ArrayBuffer (бинарный кадр)
        if (typeof data === 'string') {
          conn.send(JSON.stringify({ type: 'pong', echo: data }));
        }
      },
      close(conn) {
        sockets.delete(conn);
      },
    },

    async handle({ method, path, query, headers, body, ip }) {
      if (path === '/api/ping') {
        return { status: 200, json: { ok: true, time: Date.now() } };
      }

      if (path === '/api/admin/state') {
        const effectiveKey = db.adminKey || adminKey;
        if (!effectiveKey || headers['x-admin-key'] !== effectiveKey) {
          return { status: 403, json: { error: 'Доступ запрещён.' } };
        }
        return { status: 200, json: { usersCount: db.users.length, settings: db.settings } };
      }

      // Добавляйте свои маршруты /api/* здесь.
      // После изменения важных данных вызывайте: await persist(db, { immediate: true });
      // Для некритичных отметок («был в сети»): persist(db, { immediate: false });

      return { status: 404, json: { error: 'Маршрут не найден.' } };
    },
  };
}
```

---

### 3.5. `hosting/cloudflare/worker.js` (адаптер Worker + Durable Object)

Ключевые механизмы, уже встроенные в этот шаблон:
- **`state.blockConcurrencyWhile(...)`** — запросы ждут полной выгрузки данных из хранилища при пробуждении объекта.
- **Раздельное хранение записей (`u:<id>`, `f:<path>`)** — обходит лимит 2 МБ на одно значение в Durable Object Storage.
- **Дифф-запись чанками по 100 ключей (`flush()`)** — пишет в SQLite только реально изменившиеся ключи и не превышает лимит Cloudflare в 128 ключей за один `storage.put()`.
- **Отложенная запись через `state.storage.setAlarm(...)`** — экономит квоту записей на частых heartbeat-запросах и не теряется, если объект уснёт.
- **WebSocket `/api/ws` с конвертацией `Blob → ArrayBuffer`** — локальный `wrangler dev` (`workerd`) отдаёт бинарные сообщения как `Blob`, а продакшен — как `ArrayBuffer`; очередь `inbox` гарантирует строгий порядок сообщений.

```js
import { corsHeaders, createHubCore, MAX_REQUEST_BYTES } from '../../server/core.mjs';

const PRESENCE_WRITE_MS = 15_000;

const json = (status, payload) =>
  new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(),
    },
  });

const readRequestText = async (request) => {
  const contentLength = request.headers.get('Content-Length');
  const declaredOversized = Boolean(contentLength && Number(contentLength) > MAX_REQUEST_BYTES);
  if (!request.body) {
    return declaredOversized ? { status: 413, error: 'Слишком большой запрос.' } : { text: '' };
  }

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  let oversized = declaredOversized;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) oversized = true;
      if (!oversized) chunks.push(value);
    }
  } catch {
    return { status: 400, error: 'Некорректное тело запроса.' };
  } finally {
    reader.releaseLock();
  }

  if (oversized) return { status: 413, error: 'Слишком большой запрос.' };
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes) };
};

const readJsonBody = async (request) => {
  const result = await readRequestText(request);
  if (result.error) return result;
  try {
    return { body: result.text ? JSON.parse(result.text) : {} };
  } catch {
    return { status: 400, error: 'Тело запроса — не JSON.' };
  }
};

export class MyAppHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.snapshot = new Map();
    this.lastPresenceWrite = 0;
    this.pending = null;
    this.ticker = null;

    state.blockConcurrencyWhile(async () => {
      const users = [];
      for (const [key, value] of await state.storage.list({ prefix: 'u:' })) {
        users.push(value);
        this.snapshot.set(key, JSON.stringify(value));
      }
      const adminKey = (await state.storage.get('adminKey')) ?? '';
      this.snapshot.set('adminKey', JSON.stringify(adminKey));
      const settings = (await state.storage.get('settings')) ?? {};
      this.snapshot.set('settings', JSON.stringify(settings));

      this.db = {
        users,
        adminKey: typeof adminKey === 'string' ? adminKey : '',
        settings: settings && typeof settings === 'object' ? settings : {},
      };

      this.core = createHubCore({
        db: this.db,
        persist: (_db, { immediate } = {}) => this.persist(immediate),
        adminKey: String(this.env?.MYAPP_ADMIN_KEY || '').trim(),
      });
    });
  }

  async flush() {
    const puts = {};
    const nextSnapshots = new Map();
    const aliveUsers = new Set();

    for (const user of this.db.users) {
      const key = `u:${user.id}`;
      aliveUsers.add(key);
      const serialized = JSON.stringify(user);
      if (this.snapshot.get(key) !== serialized) {
        puts[key] = user;
        nextSnapshots.set(key, serialized);
      }
    }

    const adminKey = JSON.stringify(this.db.adminKey ?? '');
    if (this.snapshot.get('adminKey') !== adminKey) {
      puts.adminKey = this.db.adminKey ?? '';
      nextSnapshots.set('adminKey', adminKey);
    }

    const settings = JSON.stringify(this.db.settings ?? {});
    if (this.snapshot.get('settings') !== settings) {
      puts.settings = this.db.settings ?? {};
      nextSnapshots.set('settings', settings);
    }

    const deletedKeys = [...this.snapshot.keys()].filter(
      (key) => key.startsWith('u:') && !aliveUsers.has(key),
    );

    const keys = Object.keys(puts);
    for (let i = 0; i < keys.length; i += 100) {
      const slice = {};
      for (const key of keys.slice(i, i + 100)) slice[key] = puts[key];
      await this.state.storage.put(slice);
      for (const key of Object.keys(slice)) {
        this.snapshot.set(key, nextSnapshots.get(key));
      }
    }

    if (deletedKeys.length) {
      await this.state.storage.delete(deletedKeys);
      for (const key of deletedKeys) this.snapshot.delete(key);
    }
  }

  persist(immediate) {
    if (immediate) return this.flush();
    const now = Date.now();
    const wait = PRESENCE_WRITE_MS - (now - this.lastPresenceWrite);
    if (wait > 0) {
      return this.state.storage.setAlarm(Date.now() + wait);
    }
    this.lastPresenceWrite = now;
    this.pending = this.flush().catch(() => {});
    return undefined;
  }

  async alarm() {
    this.lastPresenceWrite = Date.now();
    await this.flush();
  }

  ensureTicker() {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      this.core.tick();
      if (this.core.stats().sockets === 0) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
    }, 15_000);
  }

  upgrade() {
    if (!this.core) return json(503, { error: 'Сервер временно недоступен.' });
    this.ensureTicker();
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();

    const conn = {
      send: (payload) => server.send(payload),
      close: (code, reason) => {
        try {
          server.close(code, reason);
        } catch {
          /* уже закрыт */
        }
      },
    };

    let inbox = Promise.resolve();
    server.addEventListener('message', (event) => {
      inbox = inbox
        .then(async () => {
          const data =
            event.data && typeof event.data === 'object' && typeof event.data.arrayBuffer === 'function'
              ? await event.data.arrayBuffer()
              : event.data;
          this.core.socket.message(conn, data);
        })
        .catch(() => {});
    });
    server.addEventListener('close', () => this.core.socket.close(conn));
    server.addEventListener('error', () => this.core.socket.close(conn));
    this.core.socket.open(conn);
    return new Response(null, { status: 101, webSocket: client });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return json(204, null);
    if (url.pathname === '/api/ws' && request.headers.get('Upgrade') === 'websocket') {
      return this.upgrade();
    }

    let body = {};
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const parsed = await readJsonBody(request);
      if (parsed.error) return json(parsed.status, { error: parsed.error });
      body = parsed.body;
    }

    const result = await this.core.handle({
      method: request.method,
      path: url.pathname,
      query: url.searchParams,
      headers: {
        authorization: request.headers.get('Authorization') || '',
        'x-admin-key': request.headers.get('X-Admin-Key') || '',
      },
      body,
      ip: request.headers.get('CF-Connecting-IP') || 'unknown',
      signal: request.signal,
    });

    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      await pending;
    }
    return json(result.status, result.json);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      const hubId = env.HUB.idFromName('myapp');
      if (url.pathname === '/api/ws' && request.headers.get('Upgrade') === 'websocket') {
        return await env.HUB.get(hubId).fetch(request);
      }

      let requestForHub = request;
      if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
        const boundedBody = await readRequestText(request);
        if (boundedBody.error) return json(boundedBody.status, { error: boundedBody.error });
        const headers = new Headers(request.headers);
        headers.delete('Content-Length');
        headers.delete('Host');
        headers.delete('Transfer-Encoding');
        requestForHub = new Request(request.url, {
          method: request.method,
          headers,
          body: boundedBody.text,
          signal: request.signal,
        });
      }

      return await env.HUB.get(hubId).fetch(requestForHub);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'hub_request_failed',
          method: request.method,
          path: url.pathname,
          error: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
      return json(503, { error: 'Сервер временно недоступен.' });
    }
  },
};
```

---

### 3.6. Доставка обновлений клиентам (Vite-плагин + Service Worker + клиент)

#### `vite.config.js`

```js
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { appUpdatePlugin } from './scripts/vite-build-plugin.mjs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [appUpdatePlugin({ version })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

#### `scripts/vite-build-plugin.mjs`

```js
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

const BUILD_INFO_FILE = 'app-build.json';
const shortHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 8);
const toText = (src) => (typeof src === 'string' ? src : Buffer.from(src).toString('utf8'));

const listPublicFiles = (dir = 'public') => {
  const out = [];
  const walk = (cur, prefix) => {
    for (const name of readdirSync(cur)) {
      const full = join(cur, name);
      if (statSync(full).isDirectory()) walk(full, posix.join(prefix, name));
      else out.push(posix.join(prefix, name));
    }
  };
  try {
    walk(dir, '');
  } catch {
    /* нет каталога public */
  }
  return out.sort();
};

export function appUpdatePlugin({ version }) {
  return {
    name: 'myapp:update-plugin',
    enforce: 'post',
    apply: 'build',

    generateBundle(_options, bundle) {
      const bundleDigest = Object.keys(bundle)
        .sort()
        .map((name) => `${name}\n${toText(bundle[name].type === 'chunk' ? bundle[name].code : bundle[name].source)}`)
        .join('\n');

      const publicPaths = listPublicFiles();
      const publicDigest = publicPaths
        .map((name) => `${name}\n${createHash('sha256').update(readFileSync(join('public', name))).digest('hex')}`)
        .join('\n');
      const swTemplate = readFileSync('src/sw.js', 'utf8');
      const buildId = shortHash(`${bundleDigest}\n${publicDigest}\n${swTemplate}`);
      const cacheName = `myapp-${version}-${buildId}`;

      const metadataFiles = new Set(['_headers', '_redirects']);
      const bundleFiles = Object.keys(bundle)
        .filter((name) => name !== 'index.html' && name !== BUILD_INFO_FILE && !name.endsWith('.map'))
        .map((name) => `/${name}`);
      const precache = [
        ...new Set([
          '/',
          ...publicPaths.filter((name) => !metadataFiles.has(name)).map((name) => `/${name}`),
          ...bundleFiles,
        ]),
      ];

      bundle['sw.js'] = {
        type: 'asset',
        fileName: 'sw.js',
        source: swTemplate
          .replace('__APP_CACHE__', cacheName)
          .replace('__APP_PRECACHE__', JSON.stringify(precache, null, 2)),
      };

      for (const name of Object.keys(bundle)) {
        if (name.endsWith('.html') && bundle[name].type === 'asset') {
          bundle[name].source = String(bundle[name].source).replace(
            '</head>',
            `  <meta name="app-version" content="${version}" />\n  <meta name="app-build" content="${buildId}" />\n</head>`,
          );
        }
      }

      bundle[BUILD_INFO_FILE] = {
        type: 'asset',
        fileName: BUILD_INFO_FILE,
        source: `${JSON.stringify({ version, build: buildId, builtAt: new Date().toISOString() }, null, 2)}\n`,
      };
    },
  };
}
```

#### `src/sw.js`

```js
const CACHE = '__APP_CACHE__';
const PRECACHE = __APP_PRECACHE__;
const BUILD_INFO_PATH = '/app-build.json';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE && n.startsWith('myapp-')).map((n) => caches.delete(n))),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Паспорт сборки никогда не берётся из кэша — иначе клиент не узнает о новой версии.
  if (url.pathname === BUILD_INFO_PATH) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // Навигация — сначала сеть, при офлайне — кэш оболочки.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put('/', res.clone())).catch(() => {});
          return res;
        })
        .catch(async () => (await caches.match('/')) || Response.error()),
    );
    return;
  }

  // Остальные ресурсы — stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone())).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'app:skip-waiting') {
    self.skipWaiting();
  }
});
```

#### `src/update.js`

```js
const CURRENT_BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

let registration = null;
let applying = false;

export async function checkUpdate(onAvailable) {
  try {
    const res = await fetch('/app-build.json', { cache: 'no-store' });
    if (!res.ok) return false;
    const server = await res.json();
    if (CURRENT_BUILD && server?.build && server.build !== CURRENT_BUILD) {
      onAvailable?.(server);
      return true;
    }
  } catch {
    /* офлайн */
  }
  return false;
}

export function applyUpdate() {
  const waiting = registration?.waiting;
  if (!waiting || !navigator.serviceWorker?.controller) {
    location.reload();
    return;
  }
  applying = true;
  waiting.postMessage({ type: 'app:skip-waiting' });
  setTimeout(() => {
    if (applying) location.reload();
  }, 3000);
}

export function startUpdateWatcher(onAvailable) {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      registration = reg;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (applying) location.reload();
      });
    }).catch(() => {});
  }

  checkUpdate(onAvailable);
  setInterval(() => {
    if (document.visibilityState === 'visible') checkUpdate(onAvailable);
  }, CHECK_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkUpdate(onAvailable);
  });
  window.addEventListener('online', () => checkUpdate(onAvailable));
}
```

---

### 3.7. Автоматический деплой из GitHub Actions (`.github/workflows/deploy.yml`)

```yaml
name: Validate and deploy to Cloudflare

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      # Добавьте сюда свои тесты (например: npm test)

  deploy:
    needs: verify
    if: github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main')
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Deploy Worker and static site
        run: npx --yes wrangler@4 deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

---

### 3.8. Меню для Windows без терминала (`ДЕПЛОЙ.bat`)

```bat
@echo off
chcp 65001 >nul
title Публикация на Cloudflare Workers
cd /d "%~dp0"

:menu
cls
echo ============================================================
echo   Публикация и обновление на Cloudflare Workers
echo ============================================================
echo.
echo   [1] Собрать и выложить обновление в интернет (npm run host)
echo   [2] Войти в аккаунт Cloudflare (один раз перед первой публикацией)
echo   [3] Задать секрет администратора (npm run host:secret)
echo   [4] Смотреть живые логи сервера (npm run host:logs)
echo   [5] Выход
echo.
choice /c 12345 /n /m "Выберите пункт 1-5: "
if errorlevel 5 exit /b 0
if errorlevel 4 (call npm run host:logs & pause & goto :menu)
if errorlevel 3 (call npm run host:secret & pause & goto :menu)
if errorlevel 2 (call npm run host:login & pause & goto :menu)
if errorlevel 1 (
  if not exist node_modules call npm install
  call npm run host
  echo.
  pause
  goto :menu
)
```

---

## 4. Пошаговый чеклист запуска в новом проекте

### Шаг 1. Первый деплой со своего компьютера
1. Установите зависимости: `npm install`.
2. Один раз авторизуйтесь в Cloudflare через браузер:
   ```bash
   npm run host:login
   ```
3. Соберите и выложите проект:
   ```bash
   npm run host
   ```
   В консоли появится постоянная ссылка вида `https://myapp.<ваш-аккаунт>.workers.dev`.

### Шаг 2. Настройка секретов на сервере Cloudflare
Если проекту нужен пароль администратора или внешние API-ключи, запишите их в секреты воркера (один раз после первого деплоя):
```bash
npm run host:secret
# или для любого другого секрета:
npx --yes wrangler@4 secret put ИМЯ_СЕКРЕТА
```
Проверить список установленных секретов: `npm run host:secrets`. Секреты хранятся у Cloudflare в зашифрованном виде и **не сбрасываются** при следующих `wrangler deploy`.

### Шаг 3. Включение автодеплоя через GitHub Actions
В репозитории GitHub откройте **Settings → Secrets and variables → Actions → New repository secret** и добавьте два секрета:
1. **`CLOUDFLARE_API_TOKEN`** — создаётся в панели Cloudflare: *My Profile → API Tokens → Create Token → шаблон «Edit Cloudflare Workers»*.
2. **`CLOUDFLARE_ACCOUNT_ID`** — копируется в панели Cloudflare справа на странице *Workers & Pages*.

После этого любое слияние PR или `git push` в ветку `main` (а также ручная кнопка **Run workflow** во вкладке **Actions**) автоматически проверит проект и выкатит обновление на Cloudflare.

### Шаг 4. Локальная проверка и отладка
- **Локальная копия Cloudflare окружения (`workerd`):** `npm run host:dev` — поднимает локальный Worker + локальный SQLite Durable Object без публикации в интернет.
- **Поток живых логов с продакшена:** `npm run host:logs` (`wrangler tail`).

---

## 5. Важные тонкости и ограничения (чтобы не потерять данные)

1. **Не меняйте `name` в `wrangler.toml` и строку в `env.HUB.idFromName('myapp')` без необходимости:**
   - Смена `name` меняет поддомен `https://<name>.<account>.workers.dev` и создаёт отдельный воркер.
   - Смена аргумента `idFromName(...)` создаёт **новый пустой экземпляр** Durable Object (старые данные останутся лежать под старым именем).
2. **Переименование класса Durable Object только через миграцию:**
   Если решите переименовать JS-класс `MyAppHub`, обязательно добавьте новый блок `[[migrations]]` в `wrangler.toml`:
   ```toml
   [[migrations]]
   tag = "v2"
   renamed_classes = [{ from = "MyAppHub", to = "NewAppHub" }]
   ```
3. **Лимиты хранилища Durable Object на бесплатном тарифе:**
   - Максимум **2 МБ на одно значение ключа** — храните пользователей и крупные сущности по отдельным ключам с префиксом (`u:<id>`, `f:<id>`), а не одним гигантским JSON-массивом.
   - Максимум **128 ключей за один вызов `state.storage.put(obj)`** — разбивайте массовую запись на пачки по 100 ключей (в шаблоне `flush()` это уже реализовано).
4. **Не кэшируйте `/app-build.json`, `/sw.js` и `/api/*` в Service Worker:**
   Если `/app-build.json` попадёт в офлайн-кэш, клиент будет вечно сравнивать старую сборку саму с собой и никогда не увидит вышедшее обновление.
5. **Следите за зелёным статусом стадии `verify` в GitHub Actions:**
   В `.github/workflows/deploy.yml` у задачи `deploy` указано `needs: verify` — если хотя бы один тест в `verify` упадёт, деплой на Cloudflare специально блокируется, чтобы сломанная сборка не попала в продакшен.
