/* ===========================================================
   Игра на бесплатном хостинге Cloudflare Workers.

   Один адрес вида https://mir.ИМЯ.workers.dev отдаёт сразу всё:

   — саму игру (файлы из `dist/`, собранные `npm run build`);
   — хаб общих аккаунтов и сигналинг P2P (`/api/*`).

   Зачем это нужно: туннель с домашнего ПК живёт, пока включён
   компьютер, и его рубят VPN и провайдеры. Здесь ссылка работает
   всегда, по https, и ставится как приложение на телефон.

   Логика хаба не дублируется: это адаптер над `server/hub-core.mjs`,
   тем же самым, что крутится на ПК в `server/hub.mjs`. Отличается
   только хранилище — вместо JSON-файла Durable Object со встроенной
   SQLite (на бесплатном тарифе доступны именно такие объекты).

   Данные: каждый игрок — отдельная запись `u:<id>` (аватарка до
   300 КБ, а на одно значение есть предел 2 МБ, поэтому одним куском
   всю базу хранить нельзя), заявки — одной записью `reqs`.

   Развёртывание: `npm run host` (см. README, раздел про хостинг).
   =========================================================== */

import { corsHeaders, createHubCore, MAX_REQUEST_BYTES } from '../../server/hub-core.mjs';

/* Как часто записывать «был в сети» (сердцебиения приходят каждые
   30 секунд от каждого устройства, а бесплатный тариф считает
   записи). Пропущенная отметка присутствия ничего не ломает:
   следующая придёт через полминуты. */
const PRESENCE_WRITE_MS = 15_000;

/* Общий лимит запроса — 512 КиБ: аватарки до 300 КиБ в base64 помещаются
   с запасом, а содержимое не буферизуется без границы. */

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
  if (!request.body)
    return declaredOversized ? { status: 413, error: 'Слишком большой запрос.' } : { text: '' };

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
      /* Дренируем без сохранения остатка, чтобы не держать неограниченный
         объём в памяти и не оставить входящий поток непрочитанным. */
      if (!oversized) chunks.push(value);
    }
  } catch {
    return { status: 400, error: 'Тело запроса — не JSON.' };
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

export class MirHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.snapshot = new Map(); // ключ хранилища → как он выглядел при последней записи
    this.lastPresenceWrite = 0;
    this.pending = null;

    /* Пока идёт загрузка, объект не обрабатывает запросы — иначе
       первый же игрок увидел бы пустой хаб и «зарегистрировался»
       поверх существующего имени. */
    state.blockConcurrencyWhile(async () => {
      const users = [];
      const stored = await state.storage.list({ prefix: 'u:' });
      for (const [key, value] of stored) {
        users.push(value);
        this.snapshot.set(key, JSON.stringify(value));
      }
      const requests = (await state.storage.get('reqs')) ?? [];
      this.snapshot.set('reqs', JSON.stringify(requests));
      const adminKey = (await state.storage.get('adminKey')) ?? '';
      this.snapshot.set('adminKey', JSON.stringify(adminKey));
      /* Настройки хаба и журнал панели: отдельные ключи — они маленькие,
         но меняются часто (журнал — при каждом событии), а игроков
         трогать лишний раз нельзя. */
      const settings = (await state.storage.get('settings')) ?? null;
      this.snapshot.set('settings', JSON.stringify(settings));
      const events = (await state.storage.get('events')) ?? [];
      this.snapshot.set('events', JSON.stringify(events));
      /* Состав лобби (без карт): переживает перезапуск объекта. */
      const lobbies = (await state.storage.get('lobbies')) ?? [];
      this.snapshot.set('lobbies', JSON.stringify(lobbies));
      this.db = {
        users,
        requests,
        adminKey: typeof adminKey === 'string' ? adminKey : '',
        settings: settings && typeof settings === 'object' ? settings : undefined,
        events: Array.isArray(events) ? events : [],
        lobbies: Array.isArray(lobbies) ? lobbies : [],
      };
      this.core = createHubCore({
        db: this.db,
        persist: (_db, { immediate }) => this.persist(immediate),
        /* Ключ панели: сменённый через панель лежит в хранилище объекта
           (adminKey выше), секрет воркера MIR_ADMIN_KEY задаёт свой
           начальный ключ, а по умолчанию действует заводской
           HUB_DEFAULT_ADMIN_KEY — адрес публичный, поэтому панель сама
           напоминает сменить заводской ключ. Секрет задаётся командой
             npx wrangler secret put MIR_ADMIN_KEY
           или переменной [vars] в wrangler.toml. */
        adminKey: String(this.env?.MIR_ADMIN_KEY || '').trim(),
      });
    });
  }

  /** Записываем только то, что изменилось: экономим квоту записей. */
  async flush() {
    const puts = {};
    const snapshotsAfterWrite = new Map();
    const alive = new Set();
    for (const user of this.db.users) {
      const key = `u:${user.id}`;
      alive.add(key);
      const text = JSON.stringify(user);
      if (this.snapshot.get(key) !== text) {
        puts[key] = user;
        snapshotsAfterWrite.set(key, text);
      }
    }
    const requests = JSON.stringify(this.db.requests);
    if (this.snapshot.get('reqs') !== requests) {
      puts.reqs = this.db.requests;
      snapshotsAfterWrite.set('reqs', requests);
    }
    /* Ключ панели админа, сменённый через панель, живёт в данных хаба. */
    const adminKey = JSON.stringify(this.db.adminKey ?? '');
    if (this.snapshot.get('adminKey') !== adminKey) {
      puts.adminKey = this.db.adminKey ?? '';
      snapshotsAfterWrite.set('adminKey', adminKey);
    }
    /* Настройки панели (открыта ли регистрация) и журнал событий. */
    const settings = JSON.stringify(this.db.settings ?? {});
    if (this.snapshot.get('settings') !== settings) {
      puts.settings = this.db.settings ?? {};
      snapshotsAfterWrite.set('settings', settings);
    }
    const events = JSON.stringify(this.db.events ?? []);
    if (this.snapshot.get('events') !== events) {
      puts.events = this.db.events ?? [];
      snapshotsAfterWrite.set('events', events);
    }
    const lobbies = JSON.stringify(this.db.lobbies ?? []);
    if (this.snapshot.get('lobbies') !== lobbies) {
      puts.lobbies = this.db.lobbies ?? [];
      snapshotsAfterWrite.set('lobbies', lobbies);
    }
    const gone = [...this.snapshot.keys()].filter((key) => key.startsWith('u:') && !alive.has(key));
    /* Больше 128 ключей за раз хранилище не принимает. */
    const keys = Object.keys(puts);
    for (let i = 0; i < keys.length; i += 100) {
      const slice = {};
      for (const key of keys.slice(i, i + 100)) slice[key] = puts[key];
      await this.state.storage.put(slice);
      /* Кеш считаем свежим только после подтверждённой записи: при сбое
         следующий запрос должен повторить попытку, а не пропустить данные. */
      for (const key of Object.keys(slice)) this.snapshot.set(key, snapshotsAfterWrite.get(key));
    }
    if (gone.length) {
      await this.state.storage.delete(gone);
      for (const key of gone) this.snapshot.delete(key);
    }
  }

  persist(immediate) {
    if (immediate) return this.flush();
    const now = Date.now();
    if (now - this.lastPresenceWrite < PRESENCE_WRITE_MS) return undefined;
    this.lastPresenceWrite = now;
    this.pending = this.flush().catch(() => {});
    return undefined;
  }

  /* Живой канал лобби: WebSocket на той же самой Durable Object, что и весь хаб.
     Соединение принимаем сами (не hibernation API): так кадр карты уходит
     без задержки на пробуждение объекта, а лобби работает только пока
     кто-то в нём открыл «Играть». */
  upgrade(request) {
    if (!this.core) return json(503, { error: 'Хаб временно недоступен.' });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const conn = {
      send: (payload) => server.send(payload),
      close: (code, reason) => {
        try {
          server.close(code, reason);
        } catch {
          /* соединение уже закрыто */
        }
      },
    };
    /* Текст приходит строкой, бинарь — Blob (так отдаёт локальный workerd;
       в продакшене — ArrayBuffer). Ядру нужны байты, поэтому Blob читаем до
       передачи. Очередь на соединение сохраняет порядок: авторизация и
       команды не обгоняют кадры карты, и наоборот. */
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
    if (url.pathname === '/api/ws' && request.headers.get('Upgrade') === 'websocket') return this.upgrade(request);
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
        /* Ключ панели админа передаём ядру: сам воркер его не проверяет. */
        'x-mir-admin': request.headers.get('X-Mir-Admin') || '',
      },
      body,
      ip: request.headers.get('CF-Connecting-IP') || 'unknown',
      signal: request.signal,
    });
    /* Отложенная запись «был в сети» должна успеть до того, как
       объект уснёт: ждём её вместе с ответом. */
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
      /* Обновление до WebSocket проходит без пересборки тела: поток нужен
         только для обычных запросов с JSON. */
      if (url.pathname === '/api/ws' && request.headers.get('Upgrade') === 'websocket') {
        return await env.HUB.get(env.HUB.idFromName('mir')).fetch(request);
      }

      let requestForHub = request;
      if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
        const contentLength = request.headers.get('Content-Length');
        if (contentLength && Number(contentLength) > MAX_REQUEST_BYTES)
          return json(413, { error: 'Слишком большой запрос.' });

        /* Сначала полностью читаем поток на входном Worker и отклоняем
           превышение, не пересылая тело в Durable Object. */
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

      /* Хаб один на весь мир: все игроки должны видеть одни и те же
         аккаунты, поэтому имя объекта фиксированное. */
      const id = env.HUB.idFromName('mir');
      return await env.HUB.get(id).fetch(requestForHub);
    } catch (error) {
      /* Не записываем query string или заголовки: в них могут быть сессии
         и ключ панели. Для диагноза хватает метода, пути и типа ошибки. */
      console.error(
        JSON.stringify({
          event: 'mir_hub_request_failed',
          method: request.method,
          path: url.pathname,
          error: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
      return json(503, { error: 'Хаб временно недоступен.' });
    }
  },
};
