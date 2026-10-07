/* ===========================================================
   Ядро хаба: общие аккаунты, друзья, заявки, коды-приглашения
   и сигналинг P2P. Здесь нет ни одного обращения к файлам,
   сокетам или модулям Node — только чистая логика поверх
   объекта данных и функции сохранения.

   Зачем так: один и тот же хаб обязан работать в трёх местах
   с одинаковым поведением —

   — на ПК игрока          (server/hub.mjs, данные в JSON-файле);
   — на бесплатном хостинге (hosting/cloudflare/worker.js,
                             данные в Durable Object);
   — в проверках           (scripts/test-hub.mjs).

   Дублировать правила по трём копиям нельзя: разойдутся молча.
   Поэтому адаптер отвечает только за «как пришёл запрос и куда
   писать данные», а что именно считать ошибкой и кого с кем
   дружить — решает этот файл.

   Интерфейс для адаптера:

     const core = createHubCore({ db, persist, limits });
     const { status, json } = await core.handle({
       method, path, query, headers, body, ip, signal,
     });

   db      — { users: [], requests: [] }, уже прочитанный с диска;
   persist — (db, { immediate }) => Promise|void. immediate=true
             означает «ответ клиенту ждёт записи», false — «можно
             отложить» (сердцебиения приходят часто).
   =========================================================== */

const MAX_AVATAR_CHARS = 300 * 1024;
const TOKEN_TOKENS_PER_USER = 8; // одновременных устройств хватит всем

/* ---------- сигналинг P2P ----------------------------------
   Хаб сводит друзей напрямую: через него идут только offer/answer/ICE
   (несколько килобайт на соединение), а дальше трафик течёт между
   устройствами. Если NAT не пробился, по этому же каналу работает
   запасная передача сообщений (kind: 'relay').
   Очередь живёт в памяти: сигналы бессмысленны после перезапуска. */
const SIGNAL_TTL_MS = 60_000;
const SIGNAL_MAX_QUEUE = 300; // на пользователя
const SIGNAL_MAX_CHARS = 64 * 1024; // sdp с кандидатами укладывается с запасом
const INBOX_WAIT_MS = 20_000; // предел длинного опроса

/* В интернете хаб без защиты — приманка для ботов. Простой лимит
   по IP на минутное окно: для друзей за глаза, для парсера — мало. */
export const DEFAULT_LIMITS = {
  '/api/register': 10,
  '/api/login': 20,
  '/api/salt': 30,
  /* Подбор ключа администратора не должен быть быстрым: обычному
     владельцу хватает, а перебору — нет. Лимит стоит на всех
     служебных маршрутах, а не только на «проверке ключа». */
  '/api/admin/ping': 20,
  '/api/admin/state': 60,
  '/api/admin/user': 60,
  '/api/admin/request': 60,
  /* Сигналинг шумный по своей природе: ICE-кандидаты летят пачками,
     а длинный опрос входящих висит по 20 секунд и сразу повторяется. */
  '/api/p2p/signal': 1200,
  '/api/p2p/inbox': 600,
  default: 400,
};
const RATE_WINDOW_MS = 60_000;

const NAME_RE = /^[A-Za-zА-Яа-яЁё0-9_-]{3,16}$/;
const RESERVED_NAMES = new Set(['гость', 'guest', 'игрок', 'player']);
const NAME_RULE =
  'Имя: 3–16 символов — буквы, цифры, дефис и подчёркивание, без пробелов.';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/* Случайность — через Web Crypto: она одинаково есть в Node 19+,
   в Deno и в воркерах Cloudflare. node:crypto сюда тащить нельзя. */
const randomBytes = (count) => {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

const hex = (count) =>
  [...randomBytes(count)].map((b) => b.toString(16).padStart(2, '0')).join('');

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

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/* Заголовки для чужого источника. Игра может быть открыта откуда
   угодно — с GitHub Pages, из APK, из mir.html на флешке, — а хаб
   жить на другом домене. Пароли по сети не ходят, вместо cookie —
   токен в заголовке Authorization, поэтому «*» здесь безопасно:
   без токена чужая вкладка не получит ничего, кроме /api/ping. */
export const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
});

/* Ключ администратора панели. Пусто — панель выключена: так ведёт себя
   хаб на хостинге, если владелец не задал секрет. На ПК-хабе ключ
   приходит из переменной окружения или из адаптера. */
const secretEquals = (a, b) => {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
};

export function createHubCore({ db, persist = () => {}, limits = DEFAULT_LIMITS, adminKey = '' }) {
  db.users ??= [];
  db.requests ??= [];

  /* ---------- сохранение ------------------------------------
     Мутации ждут записи (иначе перезапуск съест регистрацию),
     сердцебиения — нет: их много, и потеря последнего «был в сети»
     никому не вредит. */

  const persistNow = () => Promise.resolve(persist(db, { immediate: true }));
  /* Отложенная запись не держит ответ: ошибку глотаем молча —
     следующая мутация всё равно перезапишет данные целиком. */
  const persistSoon = () => {
    Promise.resolve(persist(db, { immediate: false })).catch(() => {});
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

  /* ---------- почтовые ящики сигналинга ----------------------
     Ящик на пользователя: короткая очередь + список ждущих запросов
     (длинный опрос). Доставка — только между друзьями, чужой человек
     не может даже постучаться. Ничего не пишем на диск. */

  const inboxes = new Map(); // userId → { queue: [], waiters: Set<fn> }
  let signalSeq = 0;

  const inboxOf = (userId) => {
    let box = inboxes.get(userId);
    if (!box) {
      box = { queue: [], waiters: new Set() };
      inboxes.set(userId, box);
    }
    return box;
  };

  const freshQueue = (box) => {
    const edge = Date.now() - SIGNAL_TTL_MS;
    box.queue = box.queue.filter((m) => m.at > edge);
    return box.queue;
  };

  const pushSignal = (toId, message) => {
    const box = inboxOf(toId);
    freshQueue(box).push(message);
    /* Переполнение бывает, когда адресат закрыл вкладку: держим хвост. */
    if (box.queue.length > SIGNAL_MAX_QUEUE) box.queue = box.queue.slice(-SIGNAL_MAX_QUEUE);
    for (const wake of [...box.waiters]) wake();
  };

  const takeSignals = (userId) => {
    const box = inboxOf(userId);
    const out = freshQueue(box);
    box.queue = [];
    return out;
  };

  /* Протухшее выметаем лениво, при каждом обращении к ящикам:
     таймеры живут не везде (в воркере объект засыпает между
     запросами), а результат нужен тот же. */
  const sweepInboxes = () => {
    for (const [userId, box] of inboxes) {
      freshQueue(box);
      if (box.queue.length === 0 && box.waiters.size === 0) inboxes.delete(userId);
    }
  };

  /* ---------- лимиты по IP ---------------------------------- */

  const buckets = new Map(); // "ip путь" → { count, resetAt }

  const rateLimited = (ip, path) => {
    const limit = limits[path] ?? limits.default;
    if (!limit) return false;
    const now = Date.now();
    if (buckets.size > 5000) for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
    const key = `${ip || 'unknown'} ${path}`;
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

  const auth = (req) => {
    const header = req.headers?.authorization || req.headers?.Authorization || '';
    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : req.body?.token || req.query?.get('token') || null;
    if (!token) throw httpError(401, 'Нет токена сессии — войдите заново.');
    const user = byToken(token);
    if (!user) throw httpError(401, 'Сессия не найдена — войдите заново.');
    return user;
  };

  /* ---------- панель админа ----------------------------------
     Служебные маршруты для владельца игры: список аккаунтов и правки.
     Вход — по ключу MIR_ADMIN_KEY в заголовке X-Mir-Admin. Без ключа
     маршруты отвечают «панель выключена»: открытой админки на хабе
     не бывает по умолчанию. Пароли и здесь не ходят открытым текстом —
     панель присылает готовый salt и хеш. */

  const adminAuth = (req) => {
    if (!adminKey)
      throw httpError(
        503,
        'Владелец хаба не задал ключ администратора — панель на этом хабе выключена.',
      );
    const given = req.headers?.['x-mir-admin'] || req.headers?.['X-Mir-Admin'] || '';
    if (!secretEquals(given, adminKey)) throw httpError(403, 'Неверный ключ администратора.');
  };

  const adminUserShape = (u) => ({
    id: u.id,
    name: u.name,
    avatar: u.avatar ?? null,
    friends: u.friends ?? [],
    createdAt: u.createdAt,
    seenAt: u.seenAt,
    online: !!u.online,
    inviteCode: u.inviteCode ?? null,
    tokens: Array.isArray(u.tokens) ? u.tokens.length : 0,
  });

  const adminStats = () => ({
    users: db.users.length,
    online: db.users.filter((u) => u.online && Date.now() - (u.seenAt ?? 0) < 90_000).length,
    avatars: db.users.filter((u) => u.avatar).length,
    requests: db.requests.length,
    links: Math.round(db.users.reduce((sum, u) => sum + (u.friends?.length ?? 0), 0) / 2),
    bytes: JSON.stringify({ users: db.users, requests: db.requests }).length,
  });

  const adminState = () => ({
    users: db.users.map(adminUserShape),
    requests: db.requests,
    stats: adminStats(),
  });

  const adminDropUser = (user) => {
    db.users = db.users.filter((u) => u.id !== user.id);
    for (const other of db.users) {
      if (other.friends?.includes(user.id))
        other.friends = other.friends.filter((id) => id !== user.id);
    }
    db.requests = db.requests.filter((r) => r.from !== user.id && r.to !== user.id);
  };

  /* ---------- обработчики маршрутов ----------------------------
     Возвращают тело ответа. Мутации сами просят сохранение:
     save.now() — ответ ждёт записи, save.soon() — можно отложить. */

  const routes = {
    'GET /api/ping': () => ({ ok: true, hub: 'mir', users: db.users.length }),

    'GET /api/salt': (req) => {
      const user = byName(req.query.get('name'));
      if (!user) throw httpError(404, 'Игрок с таким именем не найден.');
      return { salt: user.salt };
    },

    'GET /api/state': (req) => stateFor(auth(req)),

    'POST /api/register': async (req, body, save) => {
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
      save.now();
      return { token, state: stateFor(user) };
    },

    'POST /api/login': async (req, body, save) => {
      const user = byName(body.name);
      if (!user) throw httpError(404, 'Игрок с таким именем не найден.');
      if (body.passHash !== user.passHash) throw httpError(401, 'Неверный пароль.');
      const token = hex(16);
      user.tokens = [...(user.tokens ?? []), token].slice(-TOKEN_TOKENS_PER_USER);
      user.online = true;
      user.seenAt = Date.now();
      save.now();
      return { token, state: stateFor(user) };
    },

    'POST /api/heartbeat': async (req, body, save) => {
      const user = auth(req);
      user.online = true;
      user.seenAt = Date.now();
      save.soon();
      return { ok: true };
    },

    'POST /api/offline': async (req, body, save) => {
      const user = auth(req);
      user.online = false;
      user.tokens = user.tokens.filter((t) => t !== (body.token || null)) || user.tokens;
      save.now();
      return { ok: true };
    },

    'POST /api/name': async (req, body, save) => {
      const user = auth(req);
      const name = String(body.name || '').trim();
      validName(name);
      const owner = byName(name);
      if (owner && owner.id !== user.id) throw httpError(409, 'Это имя занято.');
      user.name = name;
      user.nameKey = name.toLowerCase();
      save.now();
      return { state: stateFor(user) };
    },

    'POST /api/password': async (req, body, save) => {
      const user = auth(req);
      if (body.oldHash !== user.passHash) throw httpError(401, 'Текущий пароль не подходит.');
      if (!/^[0-9a-f]{32}$/.test(body.newSalt || '') || !/^[0-9a-f]{64}$/.test(body.newHash || ''))
        throw httpError(400, 'Некорректные данные пароля.');
      user.salt = body.newSalt;
      user.passHash = body.newHash;
      /* Смена пароля выкидывает остальные устройства. */
      user.tokens = user.tokens.slice(-1);
      save.now();
      return { state: stateFor(user) };
    },

    'POST /api/avatar': async (req, body, save) => {
      const user = auth(req);
      const avatar = body.avatar ?? null;
      if (
        avatar !== null &&
        (!String(avatar).startsWith('data:image/') || avatar.length > MAX_AVATAR_CHARS)
      )
        throw httpError(400, 'Картинка слишком тяжёлая даже после сжатия.');
      user.avatar = avatar;
      save.now();
      return { state: stateFor(user) };
    },

    'POST /api/request': async (req, body, save) => {
      const me = auth(req);
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
      save.now();
      return {
        state: stateFor(me),
        result: { accepted, targetId: target.id, targetName: target.name },
      };
    },

    'POST /api/respond': async (req, body, save) => {
      const me = auth(req);
      const request = db.requests.find((r) => r.id === body.requestId && r.to === me.id);
      if (!request) throw httpError(404, 'Заявка не найдена.');
      const from = byId(request.from);
      db.requests = db.requests.filter((r) => r.id !== request.id);
      if (body.accept && from) linkFriends(me, from);
      save.now();
      return {
        state: stateFor(me),
        result: { accepted: !!body.accept, fromId: from?.id ?? null, fromName: from?.name ?? '' },
      };
    },

    'POST /api/friend/remove': async (req, body, save) => {
      const me = auth(req);
      const friend = byId(body.friendId);
      if (friend) unlinkFriends(me, friend);
      save.now();
      return { state: stateFor(me), result: { friendName: friend?.name ?? '' } };
    },

    'POST /api/invite/use': async (req, body, save) => {
      const me = auth(req);
      const code = normalizeCode(body.code);
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw httpError(400, 'Код выглядит как XXXX-XXXX.');
      const owner = db.users.find((u) => u.inviteCode === code);
      if (!owner) throw httpError(404, 'Такой код никому не выдан.');
      if (owner.id === me.id) throw httpError(400, 'Это ваш собственный код.');
      if (me.friends.includes(owner.id)) throw httpError(409, `${owner.name} уже у вас в друзьях.`);
      dropRequestsBetween(me.id, owner.id);
      linkFriends(me, owner);
      save.now();
      return { state: stateFor(me), result: { ownerId: owner.id, ownerName: owner.name } };
    },

    'POST /api/invite/regen': async (req, body, save) => {
      const me = auth(req);
      me.inviteCode = makeInviteCode();
      save.now();
      return { state: stateFor(me), result: { code: me.inviteCode } };
    },

    /* --- панель админа ------------------------------------- */

    'POST /api/admin/ping': (req) => {
      adminAuth(req);
      return { ok: true, hub: 'mir', stats: adminStats() };
    },

    'POST /api/admin/state': (req) => {
      adminAuth(req);
      return adminState();
    },

    'POST /api/admin/user': async (req, body, save) => {
      adminAuth(req);
      const user = byId(body.userId);
      if (!user) throw httpError(404, 'Аккаунт не найден.');
      switch (body.action) {
        case 'rename': {
          const name = String(body.name || '').trim();
          validName(name);
          const owner = byName(name);
          if (owner && owner.id !== user.id) throw httpError(409, 'Это имя занято.');
          user.name = name;
          user.nameKey = name.toLowerCase();
          break;
        }
        case 'password': {
          if (!/^[0-9a-f]{32}$/.test(body.salt || '') || !/^[0-9a-f]{64}$/.test(body.hash || ''))
            throw httpError(400, 'Некорректные данные пароля.');
          user.salt = body.salt;
          user.passHash = body.hash;
          /* Сброс пароля администратором выкидывает все устройства. */
          user.tokens = [];
          user.online = false;
          break;
        }
        case 'kick': {
          user.online = false;
          user.tokens = [];
          break;
        }
        case 'avatar': {
          const avatar = body.avatar ?? null;
          if (
            avatar !== null &&
            (!String(avatar).startsWith('data:image/') || String(avatar).length > MAX_AVATAR_CHARS)
          )
            throw httpError(400, 'Картинка слишком тяжёлая даже после сжатия.');
          user.avatar = avatar === null ? null : String(avatar);
          break;
        }
        case 'regen-code': {
          user.inviteCode = makeInviteCode();
          break;
        }
        case 'unlink': {
          const friend = byId(body.friendId);
          if (friend) unlinkFriends(user, friend);
          break;
        }
        case 'unlink-all': {
          for (const id of [...(user.friends ?? [])]) {
            const friend = byId(id);
            if (friend) unlinkFriends(user, friend);
          }
          user.friends = [];
          break;
        }
        case 'delete': {
          adminDropUser(user);
          break;
        }
        default:
          throw httpError(400, 'Неизвестное действие панели.');
      }
      save.now();
      return adminState();
    },

    'POST /api/admin/request': async (req, body, save) => {
      adminAuth(req);
      const before = db.requests.length;
      db.requests = db.requests.filter((r) => r.id !== body.requestId);
      if (db.requests.length === before) throw httpError(404, 'Заявка не найдена.');
      save.now();
      return adminState();
    },

    /* --- P2P: сведение друзей напрямую ---------------------- */

    'POST /api/p2p/signal': async (req, body, save) => {
      const me = auth(req);
      const items = Array.isArray(body.batch) ? body.batch : [body];
      if (items.length > 32) throw httpError(400, 'Слишком много сигналов за раз.');
      let sent = 0;
      for (const item of items) {
        const target = byId(item?.to);
        if (!target) throw httpError(404, 'Игрок не найден.');
        if (target.id === me.id) throw httpError(400, 'Нельзя звонить самому себе.');
        if (!me.friends.includes(target.id))
          throw httpError(403, 'Прямое соединение доступно только друзьям.');
        const kind = String(item.kind || '');
        if (!['offer', 'answer', 'ice', 'bye', 'relay'].includes(kind))
          throw httpError(400, 'Неизвестный тип сигнала.');
        const data = item.data ?? null;
        if (JSON.stringify(data ?? null).length > SIGNAL_MAX_CHARS)
          throw httpError(413, 'Сигнал слишком большой.');
        pushSignal(target.id, {
          id: `s_${(signalSeq += 1).toString(36)}`,
          from: me.id,
          kind,
          data,
          at: Date.now(),
        });
        sent += 1;
      }
      /* Живой сигналинг — тоже признак присутствия. */
      me.online = true;
      me.seenAt = Date.now();
      save.soon();
      return { ok: true, sent };
    },

    /* Длинный опрос: висим до первого сигнала или 20 секунд. Так
       соединение поднимается за доли секунды, а запросов — три в минуту. */
    'GET /api/p2p/inbox': (req, body, save) => {
      const me = auth(req);
      me.online = true;
      me.seenAt = Date.now();
      save.soon();
      sweepInboxes();
      const ready = takeSignals(me.id);
      const wants = req.query.get('wait') === '1';
      if (ready.length > 0 || !wants) return { messages: ready, self: me.id };
      const box = inboxOf(me.id);
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          box.waiters.delete(wake);
          req.signal?.removeEventListener?.('abort', finish);
          resolve({ messages: takeSignals(me.id), self: me.id });
        };
        /* Будим не мгновенно: пачка ICE-кандидатов приходит подряд,
           и забрать её одним ответом дешевле, чем тремя. */
        const wake = () => setTimeout(finish, 0);
        const timer = setTimeout(finish, INBOX_WAIT_MS);
        timer.unref?.();
        box.waiters.add(wake);
        /* Клиент закрыл вкладку — отпускаем ожидание сразу. */
        req.signal?.addEventListener?.('abort', finish, { once: true });
      });
    },
  };

  return {
    /** Разбор одного запроса к /api/*. Ответ — { status, json }. */
    async handle(req) {
      const path = req.path;
      const method = (req.method || 'GET').toUpperCase();
      if (method === 'OPTIONS') return { status: 204, json: null };
      const route = routes[`${method} ${path}`];
      if (!route) return { status: 404, json: { error: 'Нет такого метода хаба.' } };
      if (rateLimited(req.ip, path))
        return { status: 429, json: { error: 'Слишком много запросов. Подождите минуту.' } };
      let saveNow = false;
      const save = {
        now: () => {
          saveNow = true;
        },
        soon: persistSoon,
      };
      try {
        const body = method === 'GET' ? {} : req.body ?? {};
        const request = { ...req, body, query: req.query ?? new URLSearchParams() };
        const json = await route(request, body, save);
        if (saveNow) await persistNow();
        return { status: 200, json };
      } catch (error) {
        /* Данные могли измениться до броска исключения — не теряем их. */
        if (saveNow) await persistNow().catch(() => {});
        return {
          status: error.status || 500,
          json: { error: error.message || 'Внутренняя ошибка хаба.' },
        };
      }
    },

    stats: () => ({ users: db.users.length, requests: db.requests.length, p2p: inboxes.size }),
  };
}
