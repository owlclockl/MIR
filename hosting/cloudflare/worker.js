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

import { corsHeaders, createHubCore } from '../../server/hub-core.mjs';

/* Как часто записывать «был в сети» (сердцебиения приходят каждые
   30 секунд от каждого устройства, а бесплатный тариф считает
   записи). Пропущенная отметка присутствия ничего не ломает:
   следующая придёт через полминуты. */
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
      this.db = { users, requests };
      this.core = createHubCore({
        db: this.db,
        persist: (_db, { immediate }) => this.persist(immediate),
        /* Панель админа на хостинге включается только своим секретом:
           адрес тут публичный, и ключа по умолчанию быть не должно.
           Секрет задаётся командой
             npx wrangler secret put MIR_ADMIN_KEY
           или переменной [vars] в wrangler.toml. */
        adminKey: String(this.env?.MIR_ADMIN_KEY || '').trim(),
      });
    });
  }

  /** Записываем только то, что изменилось: экономим квоту записей. */
  async flush() {
    const puts = {};
    const alive = new Set();
    for (const user of this.db.users) {
      const key = `u:${user.id}`;
      alive.add(key);
      const text = JSON.stringify(user);
      if (this.snapshot.get(key) !== text) {
        puts[key] = user;
        this.snapshot.set(key, text);
      }
    }
    const requests = JSON.stringify(this.db.requests);
    if (this.snapshot.get('reqs') !== requests) {
      puts.reqs = this.db.requests;
      this.snapshot.set('reqs', requests);
    }
    const gone = [...this.snapshot.keys()].filter((key) => key.startsWith('u:') && !alive.has(key));
    /* Больше 128 ключей за раз хранилище не принимает. */
    const keys = Object.keys(puts);
    for (let i = 0; i < keys.length; i += 100) {
      const slice = {};
      for (const key of keys.slice(i, i + 100)) slice[key] = puts[key];
      await this.state.storage.put(slice);
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

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return json(204, null);
    let body = {};
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const text = await request.text();
        body = text ? JSON.parse(text) : {};
      } catch {
        return json(400, { error: 'Тело запроса — не JSON.' });
      }
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
    if (url.pathname.startsWith('/api/')) {
      /* Хаб один на весь мир: все игроки должны видеть одни и те же
         аккаунты, поэтому имя объекта фиксированное. */
      const id = env.HUB.idFromName('mir');
      return env.HUB.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
