/* ===========================================================
   Хаб общих аккаунтов на ПК игрока.

   Это адаптер вокруг `hub-core.mjs`: вся логика (аккаунты, друзья,
   заявки, коды, сигналинг) живёт там и одинакова на ПК и на
   бесплатном хостинге. Здесь — только то, что присуще Node:
   чтение тела запроса, заголовки ответа и хранение данных в одном
   JSON-файле (data/mir-hub.json), который пишется атомарно.

   ПК, на котором запущен serve.mjs, становится «сервером» для
   друзей в той же Wi-Fi. Без зависимостей — встроенные модули Node.
   =========================================================== */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { DEFAULT_LIMITS, corsHeaders, createHubCore, httpError } from './hub-core.mjs';

const MAX_BODY_BYTES = 512 * 1024; // аватарки до ~300 КБ в base64

const clientIp = (req) =>
  String(req.headers['cf-connecting-ip'] || '')
    .trim() ||
  String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim() ||
  req.socket.remoteAddress ||
  'unknown';

export function createHub({ dbFile, limits = DEFAULT_LIMITS }) {
  /* ---------- хранилище ---------- */

  const load = () => {
    try {
      const parsed = JSON.parse(readFileSync(dbFile, 'utf8'));
      return { users: parsed.users ?? [], requests: parsed.requests ?? [] };
    } catch {
      return { users: [], requests: [] };
    }
  };

  const db = load();

  let saveTimer = null;
  const writeFile = () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    mkdirSync(dirname(dbFile), { recursive: true });
    const tmp = `${dbFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(db, null, 1));
    renameSync(tmp, dbFile);
  };

  /* Сердцебиения приходят часто — их дебаунсим, мутации пишем сразу. */
  const persist = (_db, { immediate }) => {
    if (immediate) {
      writeFile();
      return;
    }
    if (saveTimer) return;
    saveTimer = setTimeout(writeFile, 1000);
    saveTimer.unref?.();
  };

  const core = createHubCore({ db, persist, limits });

  /* ---------- разбор запроса ---------- */

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(httpError(413, 'Слишком большой запрос.'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (chunks.length === 0) return resolve({});
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(httpError(400, 'Тело запроса — не JSON.'));
        }
      });
      req.on('error', () => reject(httpError(400, 'Не удалось прочитать запрос.')));
    });

  const send = (res, status, payload) => {
    /* Длинный опрос мог оборваться на стороне клиента — тогда писать некуда. */
    if (res.writableEnded || res.destroyed) return;
    const body = payload === null ? '' : JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(),
    });
    res.end(body);
  };

  return {
    /** true, если запрос был про API. */
    async handle(req, res) {
      const url = new URL(req.url || '/', 'http://x');
      if (!url.pathname.startsWith('/api/')) return false;
      /* Игра может быть открыта с другого адреса (GitHub Pages, APK,
         mir.html с флешки) — браузер сначала спросит разрешение. */
      if (req.method === 'OPTIONS') {
        send(res, 204, null);
        return true;
      }
      /* Клиент закрыл вкладку — длинный опрос должен отпустить ядро. */
      const abort = new AbortController();
      req.on('close', () => abort.abort());
      try {
        const body = req.method === 'GET' ? {} : await readBody(req);
        const { status, json } = await core.handle({
          method: req.method,
          path: url.pathname,
          query: url.searchParams,
          headers: req.headers,
          body,
          ip: clientIp(req),
          signal: abort.signal,
        });
        send(res, status, json);
      } catch (error) {
        send(res, error.status || 500, { error: error.message || 'Внутренняя ошибка хаба.' });
      }
      return true;
    },
    stats: core.stats,
    dbFile,
  };
}
