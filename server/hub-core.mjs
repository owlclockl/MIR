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
export const MAX_REQUEST_BYTES = 512 * 1024; // аватарки до ~300 КБ в base64
const TOKEN_TOKENS_PER_USER = 8; // одновременных устройств хватит всем

/* Журнал панели админа: последние события хаба — кто зарегистрировался,
   вошёл, подружился, кого отключили или заблокировали. Это не логи
   сервера, а короткая память для владельца: она лежит в данных хаба
   (значит, переживает перезапуск) и обрезается до MAX_EVENTS записей,
   чтобы файл данных не рос бесконечно. Пароли и ключи в журнал не
   попадают — только имена, id и повод. */
const MAX_EVENTS = 300;
/* Сколько записей журнала уезжает в панель за один снимок. */
const MAX_EVENTS_FOR_PANEL = 150;
const MAX_BAN_REASON = 140;
const MAX_LOG_TEXT = 160;

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
  '/api/logout': 30,
  '/api/salt': 30,
  /* Подбор ключа администратора не должен быть быстрым: обычному
     владельцу хватает, а перебору — нет. Лимит стоит на всех
     служебных маршрутах, а не только на «проверке ключа». */
  '/api/admin/ping': 20,
  '/api/admin/state': 60,
  '/api/admin/user': 60,
  '/api/admin/request': 60,
  '/api/admin/settings': 60,
  '/api/admin/events': 60,
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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Mir-Admin',
  'Access-Control-Max-Age': '86400',
});

/* Ключ администратора панели по умолчанию — заводской, публичный: он в
   открытом исходнике, поэтому панель сама напоминает его сменить. Владелец
   хаба может задать свой ключ переменной окружения / секретом воркера
   (MIR_ADMIN_KEY) или сменить его в панели — тогда ключ хранится в данных
   хаба и переживает перезапуск. */
export const HUB_DEFAULT_ADMIN_KEY = 'owlananaslwo';
const HUB_ADMIN_MIN_KEY = 6;

/* Сравнение секретов без раннего выхода по длине. */
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
  /* Журнал и настройки появились позже остальных данных: у старых хабов
     этих полей в файле/хранилище ещё нет — дописываем на месте. */
  if (!Array.isArray(db.events)) db.events = [];
  db.settings = { registrationOpen: db.settings?.registrationOpen !== false };

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

  /* ---------- журнал событий ----------------------------------
     Короткая память хаба для панели админа. Пишем только факты,
     которые владельцу важно видеть: регистрации, входы, дружбу,
     действия панели. Ничего лишнего — ни паролей, ни ключа. */

  let eventSeq = 0;

  const logEvent = (kind, fields = {}) => {
    const event = { id: `e_${(eventSeq += 1).toString(36)}`, at: Date.now(), kind };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null || value === '') continue;
      event[key] = typeof value === 'string' ? value.slice(0, MAX_LOG_TEXT) : value;
    }
    db.events.push(event);
    if (db.events.length > MAX_EVENTS) db.events.splice(0, db.events.length - MAX_EVENTS);
    return event;
  };

  /* ---------- блокировки аккаунтов ----------------------------
     Блокировка живёт на самом аккаунте (user.ban), поэтому уезжает
     вместе с ним при удалении и не требует отдельного списка. Время
     окончания необязательно: until = 0 — навсегда. Протухшая
     блокировка считается снятой сама собой. */

  const banOf = (user) => {
    const ban = user?.ban;
    if (!ban) return null;
    if (ban.until && ban.until <= Date.now()) return null;
    return { reason: ban.reason || '', at: ban.at ?? 0, until: ban.until ?? 0 };
  };

  const banMessage = (ban) =>
    ban.reason
      ? `Аккаунт заблокирован администратором: ${ban.reason}`
      : 'Аккаунт заблокирован администратором.';

  const settingsShape = () => ({ registrationOpen: db.settings.registrationOpen !== false });

  /* Токен приходит заголовком (обычный путь) либо телом/параметром —
     так же, как его ищет auth. Нужен и входу, и явному выходу. */
  const tokenOf = (req) => {
    const header = req.headers?.authorization || req.headers?.Authorization || '';
    if (header.startsWith('Bearer ')) return header.slice(7);
    return req.body?.token || req.query?.get('token') || null;
  };

  const auth = (req) => {
    const token = tokenOf(req);
    if (!token) throw httpError(401, 'Нет токена сессии — войдите заново.');
    const user = byToken(token);
    if (!user) throw httpError(401, 'Сессия не найдена — войдите заново.');
    const ban = banOf(user);
    if (ban) throw httpError(403, banMessage(ban));
    return user;
  };

  /* ---------- панель админа ----------------------------------
     Служебные маршруты для владельца игры: список аккаунтов и правки.
     Вход — по ключу администратора в заголовке X-Mir-Admin.

     Какой ключ действует, в порядке убывания: сменённый через панель
     (лежит в db.adminKey и сохраняется вместе с данными хаба), затем
     ключ из переменной окружения / секрета воркера (MIR_ADMIN_KEY),
     затем заводской HUB_DEFAULT_ADMIN_KEY. Панель на хабе включена
     всегда — заводской ключ публичный, панель сама напоминает сменить
     его. Пароли и здесь не ходят открытым текстом — панель присылает
     готовый salt и хеш. */

  const effectiveAdminKey = () => String(db.adminKey || adminKey || HUB_DEFAULT_ADMIN_KEY).trim();
  const adminKeyIsDefault = () => !String(db.adminKey || '').trim() && !String(adminKey || '').trim();

  const adminAuth = (req) => {
    const given = req.headers?.['x-mir-admin'] || req.headers?.['X-Mir-Admin'] || '';
    if (!secretEquals(given, effectiveAdminKey())) throw httpError(403, 'Неверный ключ администратора.');
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
    /* null — аккаунт свободен; иначе { reason, at, until } (until = 0 —
       навсегда). Протухшая блокировка сюда не попадает. */
    ban: banOf(u),
  });

  const adminStats = () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return {
      users: db.users.length,
      online: db.users.filter((u) => u.online && now - (u.seenAt ?? 0) < 90_000).length,
      avatars: db.users.filter((u) => u.avatar).length,
      requests: db.requests.length,
      links: Math.round(db.users.reduce((sum, u) => sum + (u.friends?.length ?? 0), 0) / 2),
      banned: db.users.filter((u) => banOf(u)).length,
      today: db.users.filter((u) => now - (u.createdAt ?? 0) < day).length,
      week: db.users.filter((u) => now - (u.createdAt ?? 0) < day * 7).length,
      activeDay: db.users.filter((u) => now - (u.seenAt ?? 0) < day).length,
      events: db.events.length,
      bytes: JSON.stringify({ users: db.users, requests: db.requests, events: db.events }).length,
    };
  };

  /* Снимок для панели. Журнал отдаём свежими записями вперёд — панель
     показывает его как ленту, и переворачивать её на клиенте незачем. */
  const adminState = () => ({
    users: db.users.map(adminUserShape),
    requests: db.requests,
    events: db.events.slice(-MAX_EVENTS_FOR_PANEL).reverse(),
    settings: settingsShape(),
    stats: adminStats(),
    /* Ключ ещё заводской — панель по этому признаку напоминает сменить. */
    key: { isDefault: adminKeyIsDefault() },
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
      if (db.settings.registrationOpen === false)
        throw httpError(403, 'Регистрация временно закрыта администратором.');
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
      logEvent('register', { userId: user.id, name: user.name });
      save.now();
      return { token, state: stateFor(user) };
    },

    'POST /api/login': async (req, body, save) => {
      const user = byName(body.name);
      if (!user) throw httpError(404, 'Игрок с таким именем не найден.');
      /* Заблокированному пароль не помогает: сначала говорим про
         блокировку, иначе он будет думать, что «пароль слетел». */
      const ban = banOf(user);
      if (ban) throw httpError(403, banMessage(ban));
      if (body.passHash !== user.passHash) throw httpError(401, 'Неверный пароль.');
      const token = hex(16);
      user.tokens = [...(user.tokens ?? []), token].slice(-TOKEN_TOKENS_PER_USER);
      user.online = true;
      user.seenAt = Date.now();
      logEvent('login', { userId: user.id, name: user.name });
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

    /* Игрок закрыл вкладку или свернул приложение: отмечаем его
       «не в меню», но токен устройства не трогаем. Это важно: браузер
       присылает beforeunload и при обычном обновлении страницы (F5),
       а вход должен пережить обновление — иначе игрока выбрасывает из
       аккаунта после каждого F5. Присутствие и так сгорает само:
       «в сети» — это online и свежий seenAt. */
    'POST /api/offline': async (req, body, save) => {
      const user = auth(req);
      user.online = false;
      user.seenAt = Date.now();
      save.now();
      return { ok: true };
    },

    /* Явный выход из аккаунта — вот здесь токен устройства отзывается.
       Другие устройства игрока продолжают работать: у каждого свой
       токен. Когда не осталось ни одного, аккаунт уходит из сети. */
    'POST /api/logout': async (req, body, save) => {
      const user = auth(req);
      const token = tokenOf(req);
      user.tokens = (user.tokens ?? []).filter((t) => t !== token);
      if (user.tokens.length === 0) user.online = false;
      save.now();
      return { ok: true };
    },

    'POST /api/name': async (req, body, save) => {
      const user = auth(req);
      const name = String(body.name || '').trim();
      validName(name);
      const owner = byName(name);
      if (owner && owner.id !== user.id) throw httpError(409, 'Это имя занято.');
      const before = user.name;
      user.name = name;
      user.nameKey = name.toLowerCase();
      logEvent('name', { userId: user.id, name: user.name, text: before });
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
      logEvent('password', { userId: user.id, name: user.name });
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
      logEvent(avatar ? 'avatar' : 'avatar-clear', { userId: user.id, name: user.name });
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
      logEvent(accepted ? 'friend' : 'request', {
        userId: me.id,
        name: me.name,
        targetId: target.id,
        targetName: target.name,
      });
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
      logEvent(body.accept ? 'friend' : 'request-decline', {
        userId: me.id,
        name: me.name,
        targetId: from?.id,
        targetName: from?.name,
      });
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
      logEvent('friend-remove', {
        userId: me.id,
        name: me.name,
        targetId: friend?.id,
        targetName: friend?.name,
      });
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
      logEvent('friend', {
        userId: me.id,
        name: me.name,
        targetId: owner.id,
        targetName: owner.name,
      });
      save.now();
      return { state: stateFor(me), result: { ownerId: owner.id, ownerName: owner.name } };
    },

    'POST /api/invite/regen': async (req, body, save) => {
      const me = auth(req);
      me.inviteCode = makeInviteCode();
      logEvent('code', { userId: me.id, name: me.name });
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
          const before = user.name;
          user.name = name;
          user.nameKey = name.toLowerCase();
          logEvent('admin:rename', {
            by: 'admin',
            userId: user.id,
            name: user.name,
            text: before,
          });
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
          logEvent('admin:password', { by: 'admin', userId: user.id, name: user.name });
          break;
        }
        case 'kick': {
          user.online = false;
          user.tokens = [];
          logEvent('admin:kick', { by: 'admin', userId: user.id, name: user.name });
          break;
        }
        case 'ban': {
          const reason = String(body.reason || '').trim().slice(0, MAX_BAN_REASON);
          const hours = Math.max(0, Math.min(24 * 365, Number(body.hours) || 0));
          user.ban = {
            reason,
            at: Date.now(),
            until: hours ? Date.now() + hours * 3_600_000 : 0,
          };
          /* Блокировка сразу отключает устройства: иначе игрок с живой
             сессией доиграл бы до её конца. */
          user.tokens = [];
          user.online = false;
          logEvent('admin:ban', {
            by: 'admin',
            userId: user.id,
            name: user.name,
            text: reason || (hours ? '' : 'навсегда'),
            until: user.ban.until,
          });
          break;
        }
        case 'unban': {
          delete user.ban;
          logEvent('admin:unban', { by: 'admin', userId: user.id, name: user.name });
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
          logEvent(avatar ? 'admin:avatar' : 'admin:avatar-clear', {
            by: 'admin',
            userId: user.id,
            name: user.name,
          });
          break;
        }
        case 'regen-code': {
          user.inviteCode = makeInviteCode();
          logEvent('admin:code', { by: 'admin', userId: user.id, name: user.name });
          break;
        }
        case 'unlink': {
          const friend = byId(body.friendId);
          if (friend) unlinkFriends(user, friend);
          logEvent('admin:unlink', {
            by: 'admin',
            userId: user.id,
            name: user.name,
            targetId: friend?.id,
            targetName: friend?.name,
          });
          break;
        }
        case 'unlink-all': {
          const count = (user.friends ?? []).length;
          for (const id of [...(user.friends ?? [])]) {
            const friend = byId(id);
            if (friend) unlinkFriends(user, friend);
          }
          user.friends = [];
          logEvent('admin:unlink-all', {
            by: 'admin',
            userId: user.id,
            name: user.name,
            count,
          });
          break;
        }
        case 'delete': {
          logEvent('admin:delete', { by: 'admin', userId: user.id, name: user.name });
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
      const dropped = db.requests.find((r) => r.id === body.requestId) ?? null;
      db.requests = db.requests.filter((r) => r.id !== body.requestId);
      if (db.requests.length === before) throw httpError(404, 'Заявка не найдена.');
      logEvent('admin:request-drop', {
        by: 'admin',
        userId: dropped?.from ?? '',
        name: byId(dropped?.from)?.name ?? '',
        targetId: dropped?.to ?? '',
        targetName: byId(dropped?.to)?.name ?? '',
      });
      save.now();
      return adminState();
    },

    /* Настройки хаба, которые владелец меняет из панели. Пока это
       одно: открыта ли регистрация. Закрывают её, когда идёт игра
       своим кругом, а лишние аккаунты не нужны. */
    'POST /api/admin/settings': async (req, body, save) => {
      adminAuth(req);
      if ('registrationOpen' in (body ?? {})) {
        const open = body.registrationOpen !== false;
        const changed = db.settings.registrationOpen !== open;
        db.settings.registrationOpen = open;
        if (changed)
          logEvent('admin:settings', {
            by: 'admin',
            text: open ? 'регистрация открыта' : 'регистрация закрыта',
          });
      }
      save.now();
      return { ok: true, ...adminState() };
    },

    /* Очистка журнала: владелец приводит память панели в порядок,
       когда она забита старым шумом. Сама очистка тоже попадает в
       журнал — чтобы «пусто» не выглядело как «ничего не было». */
    'POST /api/admin/events': async (req, body, save) => {
      adminAuth(req);
      if (body?.clear) {
        db.events = [];
        logEvent('admin:events-clear', { by: 'admin' });
      }
      save.now();
      return { ok: true, ...adminState() };
    },

    /* Смена ключа панели. Ключ хранится в данных хаба открытым текстом
       (как adminKey в файле ПК-хаба): по сети он всё равно идёт по HTTPS,
       а владелец хаба — доверенное лицо. Сброс (reset) возвращает
       заводской ключ — запасной вход, если свой забыт. */
    'POST /api/admin/key': async (req, body, save) => {
      adminAuth(req);
      if (body?.reset) {
        db.adminKey = '';
        logEvent('admin:key-reset', { by: 'admin', text: 'возврат заводского ключа' });
        save.now();
        return { ok: true, ...adminState() };
      }
      const next = String(body?.key || '').trim();
      if (next.length < HUB_ADMIN_MIN_KEY)
        throw httpError(400, `Ключ короче ${HUB_ADMIN_MIN_KEY} символов — подберите длиннее.`);
      if (next === HUB_DEFAULT_ADMIN_KEY)
        throw httpError(400, 'Это заводской ключ — придумайте свой.');
      db.adminKey = next;
      logEvent('admin:key', { by: 'admin', text: 'ключ панели сменён' });
      save.now();
      return { ok: true, ...adminState() };
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
