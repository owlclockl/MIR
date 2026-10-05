/* ===========================================================
   Хаб общих аккаунтов для локальной сети.
   ПК, на котором запущен serve.mjs, становится «сервером» для
   друзей в той же Wi-Fi: общие аккаунты, друзья, заявки и
   код-приглашения. Без зависимостей — встроенные модули Node.
   Данные — один JSON-файл (data/mir-hub.json), пишется атомарно.
   =========================================================== */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_BODY_BYTES = 512 * 1024; // аватарки до ~300 КБ в base64
const MAX_AVATAR_CHARS = 300 * 1024;
const TOKEN_TOKENS_PER_USER = 8; // одновременных устройств хватит всем

/* В интернете хаб без защиты — приманка для ботов. Простой лимит
   по IP на минутное окно: для друзей за глаза, для парсера — мало. */
const DEFAULT_LIMITS = {
  '/api/register': 10,
  '/api/login': 20,
  '/api/salt': 30,
  default: 400,
};
const RATE_WINDOW_MS = 60_000;

const clientIp = (req) =>
  String(req.headers['cf-connecting-ip'] || '')
    .trim() ||
  String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim() ||
  req.socket.remoteAddress ||
  'unknown';

const NAME_RE = /^[A-Za-zА-Яа-яЁё0-9_-]{3,16}$/;
const RESERVED_NAMES = new Set(['гость', 'guest', 'игрок', 'player']);
const NAME_RULE =
  'Имя: 3–16 символов — буквы, цифры, дефис и подчёркивание, без пробелов.';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const hex = (bytes) => randomBytes(bytes).toString('hex');

const makeInviteCode = () => {
  const bytes = randomBytes(8);
  const raw = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};

const normalizeCode = (code) =>
  String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^(.{4})(.{4}).*$/, '$1-$2');

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
  const persistNow = () => {
    mkdirSync(dirname(dbFile), { recursive: true });
    const tmp = `${dbFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(db, null, 1));
    renameSync(tmp, dbFile);
  };
  /* Сердцебиения приходят часто — их дебаунсим, мутации пишем сразу. */
  const persistSoon = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 1000);
    saveTimer.unref?.();
  };

  /* ---------- помощники ---------- */

  const byId = (id) => db.users.find((u) => u.id === id) || null;
  const byName = (name) => {
    const key = String(name || '').trim().toLowerCase();
    return db.users.find((u) => u.nameKey === key) || null;
  };
  const byToken = (token) =>
    db.users.find((u) => Array.isArray(u.tokens) && u.tokens.includes(token)) || null;

  const publicUser = (u, selfId) => ({
    id: u.id,
    name: u.name,
    nameKey: u.nameKey,
    avatar: u.avatar ?? null,
    friends: u.friends ?? [],
    createdAt: u.createdAt,
    seenAt: u.seenAt,
    online: !!u.online,
    /* собственный код-приглашение виден только владельцу */
    ...(u.id === selfId ? { inviteCode: u.inviteCode } : {}),
  });

  const stateFor = (user) => ({
    users: db.users.map((u) => publicUser(u, user.id)),
    requests: db.requests
      .filter((r) => r.from === user.id || r.to === user.id)
      .sort((a, b) => b.at - a.at),
  });

  const linkFriends = (a, b) => {
    if (!a.friends.includes(b.id)) a.friends.push(b.id);
    if (!b.friends.includes(a.id)) b.friends.push(a.id);
  };
  const unlinkFriends = (a, b) => {
    a.friends = a.friends.filter((id) => id !== b.id);
    b.friends = b.friends.filter((id) => id !== a.id);
  };
  const dropRequestsBetween = (aId, bId) => {
    db.requests = db.requests.filter(
      (r) => !(r.from === aId && r.to === bId) && !(r.from === bId && r.to === aId),
    );
  };

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

  function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  const send = (res, status, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  };

  const auth = (req, body) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : body.token || reqTokenFromQuery(req);
    if (!token) throw httpError(401, 'Нет токена сессии — войдите заново.');
    const user = byToken(token);
    if (!user) throw httpError(401, 'Сессия не найдена — войдите заново.');
    return user;
  };

  const reqTokenFromQuery = (req) => {
    try {
      return new URL(req.url, 'http://x').searchParams.get('token');
    } catch {
      return null;
    }
  };

  /* ---------- лимиты по IP ---------------------------------- */

  const buckets = new Map(); // "ip путь" → { count, resetAt }
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }, RATE_WINDOW_MS);
  sweeper.unref?.();

  const rateLimited = (req, path) => {
    const limit = limits[path] ?? limits.default;
    if (!limit) return false;
    const key = `${clientIp(req)} ${path}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    bucket.count += 1;
    buckets.set(key, bucket);
    return bucket.count > limit;
  };

  const validName = (name) => {
    if (!NAME_RE.test(String(name || '').trim())) throw httpError(400, NAME_RULE);
    if (RESERVED_NAMES.has(String(name).trim().toLowerCase()))
      throw httpError(409, 'Это имя занято.');
  };

  /* ---------- обработчики маршрутов ---------- */

  const routes = {
    'GET /api/ping': () => ({ ok: true, hub: 'mir', users: db.users.length }),

    'GET /api/salt': (req) => {
      const name = new URL(req.url, 'http://x').searchParams.get('name');
      const user = byName(name);
      if (!user) throw httpError(404, 'Игрок с таким именем не найден.');
      return { salt: user.salt };
    },

    'GET /api/state': (req) => stateFor(auth(req, {})),

    'POST /api/register': async (req, body) => {
      const name = String(body.name || '').trim();
      validName(name);
      if (byName(name)) throw httpError(409, 'Это имя занято.');
      if (!/^[0-9a-f]{32}$/.test(body.salt || '') || !/^[0-9a-f]{64}$/.test(body.passHash || ''))
        throw httpError(400, 'Некорректные данные аккаунта.');
      const token = hex(16);
      const user = {
        id: `u_${hex(8)}`,
        name,
        nameKey: name.toLowerCase(),
        salt: body.salt,
        passHash: body.passHash,
        tokens: [token],
        avatar: null,
        friends: [],
        inviteCode: makeInviteCode(),
        createdAt: Date.now(),
        seenAt: Date.now(),
        online: true,
      };
      db.users.push(user);
      persistNow();
      return { token, state: stateFor(user) };
    },

    'POST /api/login': async (req, body) => {
      const user = byName(body.name);
      if (!user) throw httpError(404, 'Игрок с таким именем не найден.');
      if (body.passHash !== user.passHash) throw httpError(401, 'Неверный пароль.');
      const token = hex(16);
      user.tokens.push(token);
      user.tokens = user.tokens.slice(-TOKEN_TOKENS_PER_USER);
      user.online = true;
      user.seenAt = Date.now();
      persistNow();
      return { token, state: stateFor(user) };
    },

    'POST /api/heartbeat': async (req, body) => {
      const user = auth(req, body);
      user.online = true;
      user.seenAt = Date.now();
      persistSoon();
      return { ok: true };
    },

    'POST /api/offline': async (req, body) => {
      const user = auth(req, body);
      user.online = false;
      user.tokens = user.tokens.filter((t) => t !== (body.token || null)) || user.tokens;
      persistNow();
      return { ok: true };
    },

    'POST /api/password': async (req, body) => {
      const user = auth(req, body);
      if (body.oldHash !== user.passHash) throw httpError(401, 'Текущий пароль не подходит.');
      if (!/^[0-9a-f]{32}$/.test(body.newSalt || '') || !/^[0-9a-f]{64}$/.test(body.newHash || ''))
        throw httpError(400, 'Некорректные данные пароля.');
      user.salt = body.newSalt;
      user.passHash = body.newHash;
      /* Смена пароля выкидывает остальные устройства. */
      const keep = user.tokens.slice(-1);
      user.tokens = keep;
      persistNow();
      return { state: stateFor(user) };
    },

    'POST /api/avatar': async (req, body) => {
      const user = auth(req, body);
      const avatar = body.avatar ?? null;
      if (avatar !== null && (!String(avatar).startsWith('data:image/') || avatar.length > MAX_AVATAR_CHARS))
        throw httpError(400, 'Картинка слишком тяжёлая даже после сжатия.');
      user.avatar = avatar;
      persistNow();
      return { state: stateFor(user) };
    },

    'POST /api/request': async (req, body) => {
      const me = auth(req, body);
      const target = byId(body.to);
      if (!target) throw httpError(404, 'Игрок не найден.');
      if (target.id === me.id) throw httpError(400, 'Нельзя добавить самого себя.');
      if (me.friends.includes(target.id)) throw httpError(409, `${target.name} уже у вас в друзьях.`);
      if (db.requests.some((r) => r.from === me.id && r.to === target.id))
        throw httpError(409, `Заявка игроку ${target.name} уже отправлена.`);
      const reciprocal = db.requests.find((r) => r.from === target.id && r.to === me.id);
      let accepted = false;
      if (reciprocal) {
        db.requests = db.requests.filter((r) => r.id !== reciprocal.id);
        linkFriends(me, target);
        accepted = true;
      } else {
        db.requests.push({ id: `r_${hex(6)}`, from: me.id, to: target.id, at: Date.now() });
      }
      persistNow();
      return { state: stateFor(me), result: { accepted, targetId: target.id, targetName: target.name } };
    },

    'POST /api/respond': async (req, body) => {
      const me = auth(req, body);
      const request = db.requests.find((r) => r.id === body.requestId && r.to === me.id);
      if (!request) throw httpError(404, 'Заявка не найдена.');
      const from = byId(request.from);
      db.requests = db.requests.filter((r) => r.id !== request.id);
      if (body.accept && from) linkFriends(me, from);
      persistNow();
      return {
        state: stateFor(me),
        result: { accepted: !!body.accept, fromId: from?.id ?? null, fromName: from?.name ?? '' },
      };
    },

    'POST /api/friend/remove': async (req, body) => {
      const me = auth(req, body);
      const friend = byId(body.friendId);
      if (friend) unlinkFriends(me, friend);
      persistNow();
      return { state: stateFor(me), result: { friendName: friend?.name ?? '' } };
    },

    'POST /api/invite/use': async (req, body) => {
      const me = auth(req, body);
      const code = normalizeCode(body.code);
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw httpError(400, 'Код выглядит как XXXX-XXXX.');
      const owner = db.users.find((u) => u.inviteCode === code);
      if (!owner) throw httpError(404, 'Такой код никому не выдан.');
      if (owner.id === me.id) throw httpError(400, 'Это ваш собственный код.');
      if (me.friends.includes(owner.id)) throw httpError(409, `${owner.name} уже у вас в друзьях.`);
      dropRequestsBetween(me.id, owner.id);
      linkFriends(me, owner);
      persistNow();
      return { state: stateFor(me), result: { ownerId: owner.id, ownerName: owner.name } };
    },

    'POST /api/invite/regen': async (req, body) => {
      const me = auth(req, body);
      me.inviteCode = makeInviteCode();
      persistNow();
      return { state: stateFor(me), result: { code: me.inviteCode } };
    },
  };

  /* ---------- точка входа ---------- */

  return {
    /** true, если запрос был про API. */
    async handle(req, res) {
      const path = (req.url || '').split('?')[0];
      if (!path.startsWith('/api/')) return false;
      const route = routes[`${req.method} ${path}`];
      if (!route) {
        send(res, 404, { error: 'Нет такого метода хаба.' });
        return true;
      }
      if (rateLimited(req, path)) {
        send(res, 429, { error: 'Слишком много запросов. Подождите минуту.' });
        return true;
      }
      try {
        const body = req.method === 'GET' ? {} : await readBody(req);
        send(res, 200, await route(req, body));
      } catch (error) {
        send(res, error.status || 500, { error: error.message || 'Внутренняя ошибка хаба.' });
      }
      return true;
    },
    stats: () => ({ users: db.users.length, requests: db.requests.length }),
    dbFile,
  };
}
