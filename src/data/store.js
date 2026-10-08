/* ===========================================================
   Слой данных: аккаунты, друзья, заявки, код-приглашения.

   Два бэкенда с одинаковым интерфейсом:
   — local: «база» в localStorage этого браузера (нет сети, mir.html);
   — hub:   общий хаб (serve.mjs на ПК или бесплатный хостинг — /api/*).
   Выбор происходит в initBackend(), по порядку:

     1. адрес из ссылки `?hub=https://…` — так друг присылает хаб;
     2. адрес, сохранённый игроком в окне «Общий хаб»;
     3. адрес, вшитый в сборку (VITE_MIR_HUB) — для APK и mir.html;
     4. тот адрес, откуда открыта игра;
     5. если ни один хаб не ответил — локальный режим как офлайн-резерв.

   Каждый запуск сначала проверяет хаб. Предыдущий выбор «локально» действует
   только до закрытия приложения и не блокирует повторное подключение при старте.

   Сессия всегда локальная (mir:session): в hub-режиме в ней лежит
   токен, который выдал хаб при входе, и адрес этого хаба — токен
   чужого хаба бессмысленен, поэтому при смене адреса сессия
   сбрасывается. Хеши паролей считаются на клиенте — по сети пароль
   никогда не ходит.
   =========================================================== */

import * as remote from './remote.js';

const KEYS = {
  users: 'mir:users',
  requests: 'mir:requests',
  session: 'mir:session',
  hub: 'mir:hub',
  settings: 'mir:settings',
  admin: 'mir:admin',
  /* Настройки служебной панели (пока одно: открыта ли регистрация)
     и журнал событий — в локальном режиме они лежат здесь, в режиме
     хаба приходят снимком от хаба. */
  hubSettings: 'mir:hub-settings',
  events: 'mir:events',
  /* Слоты карт (мир): прежний ключ, чтобы слоты предыдущих версий не терялись. */
  worlds: 'mir-world-slots',
};

/* Адрес хаба, вшитый при сборке: `VITE_MIR_HUB=https://… npm run build`.
   Нужен для APK и mir.html — там «адрес страницы» это file://, и
   узнать хаб больше неоткуда. */
const BUILT_IN_HUB = (() => {
  try {
    return String(import.meta.env?.VITE_MIR_HUB || '').trim();
  } catch {
    return '';
  }
})();

/* Имена, которые нельзя занять: они используются интерфейсом. */
const RESERVED_NAMES = new Set(['гость', 'guest', 'игрок', 'player']);

const NAME_RE = /^[A-Za-zА-Яа-яЁё0-9_-]{3,16}$/;
const NAME_RULE =
  'Имя: 3–16 символов — буквы, цифры, дефис и подчёркивание, без пробелов.';

/* ---------- низкий уровень (хранилище) ----------------------
   localStorage доступен не всегда: Firefox и Safari бросают
   SecurityError, если страница открыта по file://, приватные окна
   умеют отдавать переполненную квоту, а блокировка «сторонних
   данных» может отключить хранилище целиком. Любое обращение
   поэтому идёт через storage: если браузер отказал — работаем в
   памяти вкладки. Игра продолжается, но аккаунты не переживут
   перезагрузку страницы, и об этом честно сообщает интерфейс. */

const memoryStore = new Map();
let persistent = null;

try {
  const probe = 'mir:probe';
  globalThis.localStorage.setItem(probe, '1');
  globalThis.localStorage.removeItem(probe);
  persistent = globalThis.localStorage;
} catch {
  persistent = null;
}

const storage = {
  getItem(key) {
    if (persistent) {
      try {
        return persistent.getItem(key);
      } catch {
        persistent = null;
      }
    }
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  },
  setItem(key, value) {
    memoryStore.set(key, value);
    if (!persistent) return;
    try {
      persistent.setItem(key, value);
    } catch {
      /* Квота кончилась или хранилище закрыли на ходу — дальше в памяти. */
      persistent = null;
    }
  },
  removeItem(key) {
    memoryStore.delete(key);
    if (!persistent) return;
    try {
      persistent.removeItem(key);
    } catch {
      persistent = null;
    }
  },
};

/** Переживут ли аккаунты перезагрузку страницы. */
export const storagePersists = () => persistent !== null;

/* Хранилище читается десятки раз за одну отрисовку: профиль, список
   друзей, поиск, заявки — каждый спрашивает аккаунты заново. Раньше это
   означало столько же JSON.parse по всей базе, а база с аватарками весит
   сотни килобайт: открытие окна или переключение настройки заметно
   подтормаживало на телефонах. Держим последний разобранный результат
   рядом с той строкой, из которой он получился: строка та же — разбор не
   нужен, строка изменилась (или её переписали мы сами) — разбираем снова.

   Значение кеша — тот же объект, что уехал в хранилище. Поэтому менять
   его на месте можно только вместе с записью (`writeJSON`), иначе кеш
   и хранилище разойдутся. Все мутации в этом файле так и устроены. */
const jsonCache = new Map(); // key → { raw, value }

const readJSON = (key, fallback) => {
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return fallback;
  }
  if (raw === null || raw === undefined) {
    jsonCache.delete(key);
    return fallback;
  }
  const cached = jsonCache.get(key);
  if (cached && cached.raw === raw) return cached.value;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    jsonCache.delete(key);
    return fallback;
  }
  jsonCache.set(key, { raw, value });
  return value;
};

const writeJSON = (key, value) => {
  const raw = JSON.stringify(value);
  jsonCache.set(key, { raw, value });
  storage.setItem(key, raw);
};

const randomHex = (bytes) => {
  const arr = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/* ---------- хеширование паролей ------------------------------
   SHA-256(salt + ':' + пароль). В защищённом контексте — через
   crypto.subtle; на http://адресах локальной сети crypto.subtle
   недоступен, поэтому есть чисто-JS реализация с тем же результатом. */

function sha256Sync(message) {
  const rightRotate = (v, a) => (v >>> a) | (v << (32 - a));
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const words = [];
  const asciiBitLength = message.length * 8;
  let hash = (sha256Sync.h = sha256Sync.h || []);
  const k = (sha256Sync.k = sha256Sync.k || []);
  let primeCounter = k.length;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  message += '\x80';
  while ((message.length % 64) - 56) message += '\x00';
  for (let i = 0; i < message.length; i++) {
    words[i >> 2] |= message.charCodeAt(i) << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        (hash[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & hash[5]) ^ (~e & hash[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                0)) |
        0;
      const temp2 =
        ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))) |
        0;
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  let result = '';
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/* В бинарную строку через UTF-8: sha256Sync ждёт коды символов ≤ 255. */
const toBinaryString = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return bin;
};

const digestHex = async (binary) => {
  if (globalThis.crypto?.subtle) {
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return sha256Sync(binary);
};

const hashPassword = (salt, password) => digestHex(toBinaryString(`${salt}:${password}`));

/* ---------- общие помощники --------------------------------- */

/* Алфавит без похожих символов: 0/O, 1/I/L исключены. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const makeInviteCode = () => {
  const bytes = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  const raw = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};

const validateName = (name) => {
  if (!NAME_RE.test(name.trim())) throw new Error(NAME_RULE);
  if (RESERVED_NAMES.has(name.trim().toLowerCase())) throw new Error('Это имя занято.');
};

const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < 6)
    throw new Error('Пароль: минимум 6 символов.');
  if (password.length > 72) throw new Error('Пароль: максимум 72 символа.');
};

/* ---------- блокировки аккаунтов ----------------------------
   Блокировка лежит на самом аккаунте (user.ban) и повторяет правило
   хаба один в один: до срока (until) или навсегда (until = 0).
   Протухшая блокировка считается снятой сама собой — снимать её
   руками не нужно. */

export const banOf = (user) => {
  const ban = user?.ban;
  if (!ban) return null;
  if (ban.until && ban.until <= Date.now()) return null;
  return { reason: ban.reason || '', at: ban.at ?? 0, until: ban.until ?? 0 };
};

export const banMessage = (ban) =>
  ban?.reason
    ? `Аккаунт заблокирован администратором: ${ban.reason}`
    : 'Аккаунт заблокирован администратором.';

/* Сколько записей журнала держим: столько же, сколько хаб. */
const MAX_EVENTS = 300;
const MAX_LOG_TEXT = 160;

export const normalizeInviteInput = (code) =>
  String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^(.{4})(.{4}).*$/, '$1-$2');

const linkFriendsIn = (users, aId, bId) => {
  const a = users.find((u) => u.id === aId);
  const b = users.find((u) => u.id === bId);
  if (!a || !b || aId === bId) return;
  if (!a.friends.includes(bId)) a.friends = [...a.friends, bId];
  if (!b.friends.includes(aId)) b.friends = [...b.friends, aId];
};

/* ===========================================================
   Локальный бэкенд — localStorage этого браузера.
   =========================================================== */

/* Пульс приходит раз в 30 секунд, а запись — это вся база целиком
   (с аватарками). В памяти отметку обновляем всегда, на диск — не чаще,
   чем раз в 15 секунд: свежесть присутствия от этого не страдает,
   а лишней работы в разы меньше. */
const PRESENCE_WRITE_MS = 15_000;

/* Настройки панели и журнал событий этого браузера: тот же смысл,
   что у хаба, только данные лежат в localStorage. Нужны, чтобы панель
   вела себя одинаково в обоих режимах. */
const localSettings = () => readJSON(KEYS.hubSettings, {});
const localSettingsShape = () => ({ registrationOpen: localSettings().registrationOpen !== false });
const saveLocalSettings = (patch) => writeJSON(KEYS.hubSettings, { ...localSettings(), ...patch });

let localEventSeq = 0;
const localLogEvent = (kind, fields = {}) => {
  const events = readJSON(KEYS.events, []);
  const event = { id: `e_${(localEventSeq += 1).toString(36)}`, at: Date.now(), kind };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    event[key] = typeof value === 'string' ? value.slice(0, MAX_LOG_TEXT) : value;
  }
  events.push(event);
  writeJSON(KEYS.events, events.slice(-MAX_EVENTS));
  return event;
};

const localBackend = {
  mode: 'local',
  presenceWrittenAt: 0,

  listUsers: () => readJSON(KEYS.users, []),
  listRequests: () => readJSON(KEYS.requests, []),

  saveUsers: (users) => writeJSON(KEYS.users, users),
  saveRequests: (requests) => writeJSON(KEYS.requests, requests),

  updateUser(id, patch) {
    const users = this.listUsers();
    const ix = users.findIndex((u) => u.id === id);
    if (ix === -1) return null;
    users[ix] = { ...users[ix], ...patch };
    this.saveUsers(users);
    return users[ix];
  },

  findByName(name) {
    const key = name.trim().toLowerCase();
    return this.listUsers().find((u) => u.nameKey === key) || null;
  },

  async saltFor(name) {
    const user = this.findByName(name);
    if (!user) throw new Error('Игрок с таким именем не найден.');
    return user.salt;
  },

  async registerAccount({ name, salt, passHash }) {
    if (localSettingsShape().registrationOpen === false)
      throw new Error('Регистрация временно закрыта администратором.');
    validNameOrThrow(name);
    if (this.findByName(name)) throw new Error('Это имя занято.');
    const user = {
      id: `u_${randomHex(8)}`,
      name: name.trim(),
      nameKey: name.trim().toLowerCase(),
      salt,
      passHash,
      avatar: null,
      friends: [],
      inviteCode: makeInviteCode(),
      createdAt: Date.now(),
      seenAt: Date.now(),
      online: true,
    };
    this.saveUsers([...this.listUsers(), user]);
    localLogEvent('register', { userId: user.id, name: user.name });
    return { user, token: null };
  },

  async checkLogin({ name, passHash }) {
    const user = this.findByName(name);
    if (!user) throw new Error('Игрок с таким именем не найден.');
    /* Заблокированному пароль не помогает: сначала говорим про
       блокировку, иначе он будет думать, что «пароль слетел». */
    const ban = banOf(user);
    if (ban) throw new Error(banMessage(ban));
    if (user.passHash !== passHash) throw new Error('Неверный пароль.');
    localLogEvent('login', { userId: user.id, name: user.name });
    return { user, token: null };
  },

  /* Пульс: отметку обновляем в памяти всегда, а на диск — не чаще
     PRESENCE_WRITE_MS. Иначе каждые 30 секунд переписывалась вся база
     целиком (вместе с аватарками) — на телефоне это заметный рывок. */
  async beat(userId) {
    const users = this.listUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    user.online = true;
    user.seenAt = Date.now();
    if (Date.now() - this.presenceWrittenAt < PRESENCE_WRITE_MS) return;
    this.presenceWrittenAt = Date.now();
    this.saveUsers(users);
  },
  async offline(userId) {
    this.updateUser(userId, { online: false });
  },
  /* В локальном режиме «сессия» — это запись в этом же браузере, и её
     убирает store.logout: бэкенду остаётся только погасить присутствие. */
  async logout(userId) {
    this.updateUser(userId, { online: false });
  },

  async setName(userId, name) {
    validNameOrThrow(name);
    const owner = this.findByName(name);
    if (owner && owner.id !== userId) throw new Error('Это имя занято.');
    const before = this.listUsers().find((u) => u.id === userId)?.name;
    this.updateUser(userId, { name: name.trim(), nameKey: name.trim().toLowerCase() });
    localLogEvent('name', { userId, name: name.trim(), text: before });
    return {};
  },

  async setPassword(userId, { oldHash, nextSalt, nextHash }) {
    const user = this.listUsers().find((u) => u.id === userId);
    if (!user) throw new Error('Вы не вошли в аккаунт.');
    if (user.passHash !== oldHash) throw new Error('Текущий пароль не подходит.');
    this.updateUser(userId, { salt: nextSalt, passHash: nextHash });
    localLogEvent('password', { userId, name: user.name });
    return {};
  },

  async setAvatar(userId, dataUrl) {
    const name = this.listUsers().find((u) => u.id === userId)?.name;
    this.updateUser(userId, { avatar: dataUrl || null });
    localLogEvent(dataUrl ? 'avatar' : 'avatar-clear', { userId, name });
    return {};
  },

  async sendRequest(fromId, toId) {
    const users = this.listUsers();
    const me = users.find((u) => u.id === fromId);
    const target = users.find((u) => u.id === toId);
    if (!me) throw new Error('Вы не вошли в аккаунт.');
    if (!target) throw new Error('Игрок не найден.');
    if (target.id === me.id) throw new Error('Нельзя добавить самого себя.');
    if (me.friends.includes(target.id)) throw new Error(`${target.name} уже у вас в друзьях.`);
    if (this.listRequests().some((r) => r.from === fromId && r.to === toId))
      throw new Error(`Заявка игроку ${target.name} уже отправлена.`);

    const reciprocal = this.listRequests().find((r) => r.from === toId && r.to === fromId);
    if (reciprocal) {
      this.saveRequests(this.listRequests().filter((r) => r.id !== reciprocal.id));
      linkFriendsIn(users, fromId, toId);
      this.saveUsers(users);
      localLogEvent('friend', {
        userId: me.id,
        name: me.name,
        targetId: target.id,
        targetName: target.name,
      });
      return { result: { accepted: true, targetId: target.id, targetName: target.name } };
    }
    this.saveRequests([
      ...this.listRequests(),
      { id: `r_${randomHex(6)}`, from: fromId, to: toId, at: Date.now() },
    ]);
    localLogEvent('request', {
      userId: me.id,
      name: me.name,
      targetId: target.id,
      targetName: target.name,
    });
    return { result: { accepted: false, targetId: target.id, targetName: target.name } };
  },

  async respond(userId, requestId, accept) {
    const request = this.listRequests().find((r) => r.id === requestId && r.to === userId);
    if (!request) throw new Error('Заявка не найдена.');
    const users = this.listUsers();
    const from = users.find((u) => u.id === request.from) || null;
    this.saveRequests(this.listRequests().filter((r) => r.id !== requestId));
    if (accept && from) {
      linkFriendsIn(users, request.from, userId);
      this.saveUsers(users);
    }
    const me = users.find((u) => u.id === userId);
    localLogEvent(accept ? 'friend' : 'request-decline', {
      userId,
      name: me?.name,
      targetId: from?.id,
      targetName: from?.name,
    });
    return { result: { accepted: accept, fromId: request.from, fromName: from?.name ?? '' } };
  },

  async removeFriend(userId, friendId) {
    const users = this.listUsers();
    const friend = users.find((u) => u.id === friendId) || null;
    for (const user of users) {
      if (user.id === userId || user.id === friendId)
        user.friends = user.friends.filter((id) => id !== userId && id !== friendId);
    }
    this.saveUsers(users);
    localLogEvent('friend-remove', {
      userId,
      name: users.find((u) => u.id === userId)?.name,
      targetId: friend?.id,
      targetName: friend?.name,
    });
    return { result: { friendName: friend?.name ?? '' } };
  },

  async useInviteCode(userId, rawCode) {
    const code = normalizeInviteInput(rawCode);
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw new Error('Код выглядит как XXXX-XXXX.');
    const users = this.listUsers();
    const me = users.find((u) => u.id === userId);
    const owner = users.find((u) => u.inviteCode === code);
    if (!me) throw new Error('Вы не вошли в аккаунт.');
    if (!owner)
      throw new Error(
        'Этого кода здесь нет: локальные коды знает только этот браузер. Если игра открыта без ссылки сервера, добавить друга с другого устройства не выйдет — попросите ссылку у хозяина сети или используйте «Прямое подключение».',
      );
    if (owner.id === me.id) throw new Error('Это ваш собственный код.');
    if (me.friends.includes(owner.id)) throw new Error(`${owner.name} уже у вас в друзьях.`);
    /* Код — это личное приглашение: дружба сразу взаимная, без заявки. */
    this.saveRequests(
      this.listRequests().filter(
        (r) => !(r.from === userId && r.to === owner.id) && !(r.from === owner.id && r.to === userId),
      ),
    );
    linkFriendsIn(users, userId, owner.id);
    this.saveUsers(users);
    localLogEvent('friend', {
      userId,
      name: me.name,
      targetId: owner.id,
      targetName: owner.name,
    });
    return { result: { ownerId: owner.id, ownerName: owner.name } };
  },

  async regenCode(userId) {
    const inviteCode = makeInviteCode();
    this.updateUser(userId, { inviteCode });
    localLogEvent('code', { userId, name: this.listUsers().find((u) => u.id === userId)?.name });
    return { result: { code: inviteCode } };
  },

  async refresh() {},
};

const validNameOrThrow = validateName;

/* ===========================================================
   Хаб-бэкенд — общий сервер локальной сети.
   Чтение — из зеркала в памяти, мутации — по HTTP.
   =========================================================== */

const hubBackend = {
  mode: 'hub',

  listUsers: () => remote.getUsers(),
  listRequests: () => remote.getRequests(),

  async saltFor(name) {
    const { salt } = await remote.getSalt(name);
    return salt;
  },

  async registerAccount(payload) {
    const { token, state } = await remote.apiRegister(payload);
    remote.applyState(state);
    const session = readSession();
    return { user: state.users.find((u) => u.id === session?.userId) ?? null, token };
  },

  async checkLogin({ name, passHash }) {
    const { token, state } = await remote.apiLogin({ name, passHash });
    remote.applyState(state);
    const me = state.users.find((u) => u.nameKey === name.trim().toLowerCase());
    return { user: me ?? null, token };
  },

  async beat() {
    await remote.apiHeartbeat();
  },

  async offline() {
    await remote.apiOffline();
  },

  /* Сессию передаёт вызывающий: к этому моменту локальная запись уже
     убрана (меню сразу показывает гостя), и читать её здесь поздно —
     токен нужно было запомнить заранее. */
  async logout(session) {
    await remote.apiLogout(session?.token);
  },

  async setName(userId, name) {
    const { state } = await remote.apiName(name);
    remote.applyState(state);
    return {};
  },

  async setPassword(userId, { oldHash, nextSalt, nextHash }) {
    const { state } = await remote.apiPassword({ oldHash, newSalt: nextSalt, newHash: nextHash });
    remote.applyState(state);
    return {};
  },

  async setAvatar(userId, dataUrl) {
    const { state } = await remote.apiAvatar(dataUrl || null);
    remote.applyState(state);
    return {};
  },

  async sendRequest(fromId, toId) {
    const { state, result } = await remote.apiRequest(toId);
    remote.applyState(state);
    return { result };
  },

  async respond(userId, requestId, accept) {
    const { state, result } = await remote.apiRespond(requestId, accept);
    remote.applyState(state);
    return { result };
  },

  async removeFriend(userId, friendId) {
    const { state, result } = await remote.apiRemoveFriend(friendId);
    remote.applyState(state);
    return { result };
  },

  async useInviteCode(userId, rawCode) {
    const code = normalizeInviteInput(rawCode);
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw new Error('Код выглядит как XXXX-XXXX.');
    try {
      const { state, result } = await remote.apiUseCode(code);
      remote.applyState(state);
      return { result };
    } catch (error) {
      /* Частый тупик: друг прислал код из офлайн-приложения (APK или
         mir.html с флешки) — тот живёт в его локальном хранилище, и
         хаб про него никогда не слышал. Без объяснения человек вводит
         тот же код двадцать раз подряд. */
      if (error?.status === 404)
        throw new Error(
          'На общем хабе такого кода нет. Код действует только там, где открыта игра: если друг сидит в офлайн-приложении (APK), его код из другого режима — пусть откроет вашу ссылку, или соединитесь с ним в «Прямом подключении».',
        );
      throw error;
    }
  },

  async regenCode() {
    const { state, result } = await remote.apiRegen();
    remote.applyState(state);
    return { result };
  },

  async refresh() {
    await remote.fetchState();
  },
};

/* ===========================================================
   Общая обвязка: сессия, присутствие, выбор бэкенда.
   =========================================================== */

let backend = localBackend;
let backendInitialized = false;

export const backendMode = () => backend.mode;
export const isHub = () => backend.mode === 'hub';
/** Завершилась ли начальная проверка хаба (успешно или с офлайн-резервом). */
export const isBackendInitialized = () => backendInitialized;

/* ---------- адрес хаба ---------------------------------------
   Хаб бывает трёх сортов, и человеку важно видеть, в каком он мире:
   свой браузер, адрес страницы (ПК в сети или хостинг) или чужой
   адрес, введённый руками. */

const HUB_OFF = 'local'; // игрок сам отказался от хаба

const trimSlash = (url) => String(url ?? '').trim().replace(/\/+$/, '');

/** «mir.имя.workers.dev» → «https://mir.имя.workers.dev». */
export const normalizeHubUrl = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error('Это не похоже на адрес. Пример: https://mir.имя.workers.dev');
  }
  if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')
    throw new Error('В адресе не хватает домена. Пример: https://mir.имя.workers.dev');
  return trimSlash(`${parsed.origin}${parsed.pathname}`);
};

/** Страница по https не имеет права дёргать хаб по http — браузер молча режет. */
const mixedContent = (url) =>
  typeof location !== 'undefined' && location.protocol === 'https:' && /^http:\/\//i.test(url);

const storedHub = () => trimSlash(storage.getItem(KEYS.hub) || '');

const queryHub = () => {
  try {
    return trimSlash(new URLSearchParams(location.search).get('hub') || '');
  } catch {
    return '';
  }
};

/** Текущий адрес хаба: '' — тот же, что у страницы; null — хаба нет. */
export const hubUrl = () => (backend.mode === 'hub' ? remote.getBase() : null);

/** Короткое имя хаба для интерфейса. */
export const hubHost = () => {
  if (backend.mode !== 'hub') return '';
  const base = remote.getBase();
  if (!base) return typeof location !== 'undefined' ? location.host : 'этот адрес';
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
};

/** Адрес, который стоит предложить в поле ввода. */
export const suggestedHubUrl = () => {
  if (backend.mode === 'hub') {
    if (remote.getBase()) return remote.getBase();
    if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) return location.origin;
  }
  if (BUILT_IN_HUB) return BUILT_IN_HUB;
  if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) return location.origin;
  return '';
};

export const backendLabel = () => {
  if (backend.mode !== 'hub') return 'Этот браузер';
  return remote.getBase() ? `Хаб ${hubHost()}` : 'Общий хаб сети';
};

const readSession = () => readJSON(KEYS.session, null);

export const getSession = () => {
  const session = readSession();
  return session && getUser(session.userId) ? session : null;
};

/* Токен выдан конкретным хабом: на другом адресе он мусор. Сессии
   старых версий поля `hub` не знают — у них хаб определяем по токену. */
const sessionHub = (session) => {
  if (!session) return null;
  if ('hub' in session) return session.hub;
  return session.token ? '' : null;
};

/* Один и тот же хаб может быть записан двумя способами: '' — хаб на
   адресе самой страницы (подключение в окне хаба или регистрация сразу),
   полный URL — в сохранённом адресе (KEYS.hub) или в ссылке ?hub=.
   При перезагрузке страница находила хаб по полному адресу, строковое
   сравнение с '' не сходилось — и сессию выбрасывали: игрока выкидывало
   из аккаунта. Сравниваем адреса по смыслу: '' считаем адресом страницы. */
const sameHub = (a, b) => {
  const resolve = (url) => {
    const text = trimSlash(url ?? '');
    if (text) return text;
    if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol || ''))
      return trimSlash(location.origin);
    return '';
  };
  return resolve(a) === resolve(b);
};

remote.setTokenGetter(() => readSession()?.token ?? null);

/** Сначала подключаемся к подходящему хабу, локальное хранилище — офлайн-резерв. */
/* Одна отложенная попытка догнать хаб после неудачного запуска. Нужна
   ровно для одного случая: страница перезагружена, хаб ещё не ответил,
   приложение ушло в локальный режим — а сессия игрока жива. Без этой
   попытки человек видел «гостя» и думал, что его выкинуло из аккаунта. */
let hubRetryTimer = null;

const scheduleHubRetry = (candidates) => {
  if (hubRetryTimer || !readSession()) return;
  hubRetryTimer = setTimeout(async () => {
    hubRetryTimer = null;
    /* За время ожидания могли подключиться сами (или вручную) либо
       отказаться от хаба — тогда ничего не делаем. */
    if (backend.mode === 'hub' || storedHub() === HUB_OFF) return;
    for (const url of candidates) {
      try {
        await remote.pingHub(url, { timeout: url ? 8000 : 6000 });
        remote.setBase(url);
        backend = hubBackend;
        await resumeSession(url);
        backendInitialized = true;
        notify();
        return;
      } catch {
        /* не ответил — оставляем как есть, локальный режим работает */
      }
    }
  }, 3000);
  /* В Node (проверки) таймер не должен держать процесс живым. */
  hubRetryTimer?.unref?.();
};

export const initBackend = async () => {
  const sameOrigin =
    typeof location !== 'undefined' && /^https?:$/.test(location.protocol || '');

  if (typeof fetch !== 'function') {
    backendInitialized = true;
    return 'local';
  }

  /* Ссылка вида …/?hub=https://… — так друг делится своим хабом. */
  const fromLink = queryHub();
  if (fromLink) {
    try {
      storage.setItem(KEYS.hub, normalizeHubUrl(fromLink));
    } catch {
      /* мусор в ссылке игнорируем молча — ниже попробуем остальные адреса */
    }
  }

  const saved = storedHub();
  const candidates = [];
  const add = (url) => {
    if (url === null || url === undefined || url === HUB_OFF) return;
    if (url === '' && !sameOrigin) return;
    if (!candidates.includes(url)) candidates.push(url);
  };

  /* «Локально» — только явное переключение для текущего запуска. После
     перезапуска снова сначала проверяем сохранённый/вшитый/страничный хаб. */
  if (saved !== HUB_OFF) add(saved);
  add(remote.getBase()); // адрес мог выставить скрипт проверки
  add(BUILT_IN_HUB);
  add('');

  for (const url of candidates) {
    try {
      /* Хабу на адресе страницы даём чуть больше времени: страница уже
         открылась, значит адрес живой, а хаб мог быть «холодным»
         (только что проснулся воркер, туннель поднимался) — полторы
         секунды его не хватало, и игрок попадал в локальный режим. */
      await remote.pingHub(url, { timeout: url ? 6000 : 4000 });
      remote.setBase(url);
      backend = hubBackend;
      await resumeSession(url);
      backendInitialized = true;
      notify();
      return 'hub';
    } catch {
      /* этот адрес не хаб или недоступен — пробуем следующий */
    }
  }

  /* Не зависаем без сети: хаб всегда пробуем первым, а local — запасной путь. */
  remote.setBase('');
  backend = localBackend;
  /* Хаб не ответил за отведённое время — но у игрока, который уже был в
     аккаунте, есть шанс вернуться: холодный воркер или поднимающийся
     туннель отвечают через несколько секунд. Одна тихая попытка, и
     только если игрок сам не отказался от хаба. */
  scheduleHubRetry(candidates);
  /* Сессию не трогаем: хаб мог быть временно недоступен, а аккаунт — на
     хабе. В локальном режиме она не действует (игрок виден гостем), но
     переживёт перезагрузку, когда хаб снова ответит — иначе сбой сети
     при перезагрузке выкидывал бы из аккаунта. */
  backendInitialized = true;
  notify();
  return 'local';
};

/* Сессия переживает перезагрузку, только если хаб тот же самый. */
const resumeSession = async (hub) => {
  const session = readSession();
  if (!session) return;
  if (!sameHub(sessionHub(session), hub)) {
    storage.removeItem(KEYS.session);
    return;
  }
  try {
    await remote.fetchState();
  } catch (error) {
    /* Токен протух (хаб переустановили) или аккаунт заблокирован
       администратором — считаем себя гостем. Сетевой сбой сессию
       не трогает: следующий опрос подтянет. */
    if (error?.status === 401 || error?.status === 403) storage.removeItem(KEYS.session);
  }
};

/** Подключиться к хабу по адресу. Возвращает { url, users }. */
export const connectHub = async (raw) => {
  const url = normalizeHubUrl(raw);
  if (!url) throw new Error('Введите адрес хаба.');
  if (mixedContent(url))
    throw new Error(
      'Игра открыта по https, а хаб — по http: браузер такое соединение запретит. Нужен адрес на https.',
    );
  let info;
  try {
    info = await remote.pingHub(url);
  } catch (error) {
    throw new Error(
      error?.message === 'По этому адресу отвечает не хаб игры.'
        ? error.message
        : 'Хаб по этому адресу не отвечает. Проверьте ссылку и интернет.',
    );
  }
  /* Адрес страницы и введённый вручную — один и тот же хаб: не
     гоняем запросы через полный URL, когда можно остаться «у себя». */
  const same = typeof location !== 'undefined' && url === trimSlash(location.origin);
  storage.setItem(KEYS.hub, url);
  /* Аккаунты другого хаба — другой мир: сессию чужого хаба сбрасываем.
     На тот же хаб сессия остаётся — например, переподключение после
     временного обрыва связи не должно выкидывать из аккаунта. */
  const session = readSession();
  if (session && !sameHub(sessionHub(session), url)) storage.removeItem(KEYS.session);
  remote.setBase(same ? '' : url);
  remote.applyState({ users: [], requests: [] });
  backend = hubBackend;
  backendInitialized = true;
  notify();
  return { url, users: info.users ?? 0 };
};

/** Отключиться от хаба и работать на аккаунтах этого браузера до следующего запуска. */
export const disconnectHub = () => {
  storage.setItem(KEYS.hub, HUB_OFF);
  storage.removeItem(KEYS.session);
  remote.setBase('');
  remote.applyState({ users: [], requests: [] });
  backend = localBackend;
  backendInitialized = true;
  notify();
  return 'local';
};

const remoteSnapshot = () => JSON.stringify({
  users: remote.getUsers().map((user) => ({ ...user, seenAt: presenceOf(user) })),
  requests: remote.getRequests(),
});

/** Подтянуть свежее состояние с хаба (периодический опрос). */
export const refreshRemote = async () => {
  if (backend.mode !== 'hub') return;
  try {
    const before = remoteSnapshot();
    await remote.fetchState();
    const after = remoteSnapshot();
    /* Игнорируем меняющийся heartbeat, но отлавливаем смену idle/offline. */
    if (before !== after) notify();
  } catch (error) {
    /* 403 приходит заблокированному аккаунту: сессию убираем, и вход
       объяснит причину. */
    if (error?.status === 401 || error?.status === 403) {
      storage.removeItem(KEYS.session);
      notify();
    }
    /* Сетевые сбои молча пропускаем — следующий опрос подтянет. */
  }
};

export const listUsers = () => backend.listUsers();

export const getUser = (id) => backend.listUsers().find((u) => u.id === id) || null;

export const findUserByName = (name) => {
  const key = name.trim().toLowerCase();
  return backend.listUsers().find((u) => u.nameKey === key) || null;
};

export const getCurrentUser = () => {
  const session = getSession();
  if (!session) return null;
  const user = getUser(session.userId);
  /* На хабе блокировку сторожит сам хаб (403 на любой запрос), но в
     локальном режиме сессия и база лежат рядом: проверяем здесь. */
  if (user && backend.mode === 'local' && banOf(user)) {
    storage.removeItem(KEYS.session);
    return null;
  }
  return user;
};

/* ---------- присутствие ------------------------------------ */

/* «В сети» — есть активная сессия и свежий пульс (вкладка могла
   закрыться аварийно, тогда heartbeat просто перестаёт приходить). */
const PRESENCE_TTL = 90_000;

export const presenceOf = (user) =>
  user && user.online && Date.now() - user.seenAt < PRESENCE_TTL ? 'idle' : 'offline';

export const heartbeat = () => {
  const session = getSession();
  if (!session) return;
  backend.beat(session.userId).catch(() => {});
};

/* Уход из меню: вкладку закрыли или страницу обновили. Токен устройства
   при этом НЕ отзывается — иначе обычное обновление страницы выбрасывало
   бы игрока из аккаунта (браузер присылает beforeunload и на F5). */
export const markOffline = () => {
  const session = readSession();
  if (!session) return;
  backend.offline(session.userId).catch(() => {});
};

/* ---------- auth ------------------------------------------- */

/* Новая сессия гасит предыдущую: иначе прошлый пользователь
   навсегда остался бы «в сети» после входа другого. */
const startSession = async (userId, token) => {
  const prev = readSession();
  if (prev && prev.userId !== userId) {
    if (backend.mode === 'local') await localBackend.offline(prev.userId);
  }
  writeJSON(KEYS.session, {
    userId,
    token: token ?? null,
    /* Чей это вход: null — этот браузер, иначе адрес хаба. */
    hub: backend.mode === 'hub' ? remote.getBase() : null,
    since: Date.now(),
  });
};

export const register = async (name, password) => {
  const displayName = name.trim();
  validateName(displayName);
  validatePassword(password);
  const salt = randomHex(16);
  const passHash = await hashPassword(salt, password);
  const { user, token } = await backend.registerAccount({ name: displayName, salt, passHash });
  /* В hub-режиме id выдал сервер — он есть в state.users. */
  const fresh = backend.listUsers().find((u) => u.nameKey === displayName.toLowerCase()) ?? user;
  await startSession(fresh.id, token);
  if (backend.mode === 'local') await localBackend.beat(fresh.id);
  notify();
  return getUser(fresh.id) ?? fresh;
};

export const login = async (name, password) => {
  const salt = await backend.saltFor(name);
  const passHash = await hashPassword(salt, password);
  const { user, token } = await backend.checkLogin({ name, passHash });
  if (!user) throw new Error('Игрок с таким именем не найден.');
  if (backend.mode === 'local') {
    const rec = localBackend.listUsers().find((u) => u.id === user.id);
    if (rec.passHash !== passHash) throw new Error('Неверный пароль.');
  }
  await startSession(user.id, token);
  if (backend.mode === 'local') await localBackend.beat(user.id);
  notify();
  return getUser(user.id) ?? user;
};

/* Явный выход: локальную сессию убираем сразу (меню должно показать
   гостя не дожидаясь сети), а хаб просим отозвать токен этого
   устройства — остальные входы игрока остаются рабочими. Не ответил —
   не беда: токен всё равно уедет из этого браузера вместе с сессией. */
export const logout = () => {
  const session = readSession();
  storage.removeItem(KEYS.session);
  notify();
  if (!session) return;
  const revoke = typeof backend.logout === 'function'
    ? backend.logout(session)
    : backend.offline(session.userId);
  Promise.resolve(revoke).catch(() => {});
};

export const changeName = async (name) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  const displayName = String(name || '').trim();
  validateName(displayName);
  if (displayName === me.name) return me;
  await backend.setName(me.id, displayName);
  notify();
  return getCurrentUser();
};

export const changePassword = async (oldPassword, newPassword) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  validatePassword(newPassword);
  const oldHash = await hashPassword(me.salt ?? (await backend.saltFor(me.name)), oldPassword);
  const nextSalt = randomHex(16);
  const nextHash = await hashPassword(nextSalt, newPassword);
  await backend.setPassword(me.id, { oldHash, nextSalt, nextHash });
  notify();
};

/* ---------- настройки интерфейса --------------------------- */

/* notify — уведомления об обновлениях в шторке телефона: по умолчанию
   выключены, потому что браузер спрашивает разрешение только один раз и
   только по действию игрока (переключатель в настройках). */
const DEFAULT_SETTINGS = Object.freeze({ sound: true, volume: 0.55, motion: true, notify: false });

/* Системная просьба «меньше движения» — заодно и подсказка про слабое
   устройство: анимации там стоят дороже всего. Пока игрок не выбрал
   сам, уважаем эту настройку. */
const systemPrefersCalm = () => {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
};

export const getSettings = () => {
  const saved = readJSON(KEYS.settings, {});
  return {
    sound: saved.sound !== false,
    volume: Math.max(0, Math.min(1, Number(saved.volume ?? DEFAULT_SETTINGS.volume))),
    motion: saved.motion === undefined ? !systemPrefersCalm() : saved.motion !== false,
    notify: saved.notify === true,
  };
};

export const updateSettings = (patch) => {
  const next = { ...getSettings(), ...patch };
  next.sound = !!next.sound;
  next.motion = !!next.motion;
  next.notify = !!next.notify;
  next.volume = Math.max(0, Math.min(1, Number(next.volume) || 0));
  writeJSON(KEYS.settings, next);
  notify();
  return next;
};

/* ---------- аватар ------------------------------------------ */

export const MAX_AVATAR_BYTES = 300 * 1024;

export const setAvatar = async (dataUrl) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  if (dataUrl && dataUrl.length > MAX_AVATAR_BYTES)
    throw new Error('Картинка слишком тяжёлая даже после сжатия.');
  await backend.setAvatar(me.id, dataUrl || null);
  notify();
};

/* ---------- друзья и заявки --------------------------------- */

export const incomingRequests = (userId) =>
  backend
    .listRequests()
    .filter((r) => r.to === userId)
    .sort((a, b) => b.at - a.at);

export const outgoingRequests = (userId) =>
  backend.listRequests().filter((r) => r.from === userId);

export const listFriends = (userId) => {
  const me = getUser(userId);
  if (!me) return [];
  return me.friends
    .map(getUser)
    .filter(Boolean)
    .sort((a, b) => {
      const pa = presenceOf(a) === 'offline' ? 1 : 0;
      const pb = presenceOf(b) === 'offline' ? 1 : 0;
      return pa - pb || a.name.localeCompare(b.name, 'ru');
    });
};

/* Отправка заявки. Если тот игрок уже отправил заявку мне —
   считаем это взаимным интересом и сразу становимся друзьями. */
export const sendRequest = async (toId) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  const { result } = await backend.sendRequest(me.id, toId);
  notify();
  return {
    accepted: result.accepted,
    target: getUser(result.targetId) ?? { id: result.targetId, name: result.targetName },
  };
};

export const acceptRequest = async (requestId) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  const { result } = await backend.respond(me.id, requestId, true);
  notify();
  return result.fromId ? getUser(result.fromId) : { name: result.fromName };
};

export const declineRequest = async (requestId) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  const { result } = await backend.respond(me.id, requestId, false);
  notify();
  return result.fromId ? getUser(result.fromId) : { name: result.fromName };
};

export const removeFriend = async (friendId) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  const before = getUser(friendId);
  const { result } = await backend.removeFriend(me.id, friendId);
  notify();
  return before ?? { name: result.friendName };
};

/* ---------- код-приглашения --------------------------------- */

export const regenerateInviteCode = async () => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  const { result } = await backend.regenCode(me.id);
  notify();
  return result.code;
};

export const useInviteCode = async (rawCode) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  /* Длинный код MIR1.… — это приглашение прямого подключения, а не
     код друга: после нормализации он неотличим от обычного («MIR1-EJW9»),
     и хаб честно отвечает «не найден». Отлавливаем до отправки. */
  if (/^\s*MIR[01]\./i.test(String(rawCode || '')))
    throw new Error(
      'Это код прямого подключения — он вставляется в окне «Прямое подключение», а сюда короткий код друга вида XXXX-XXXX.',
    );
  const { result } = await backend.useInviteCode(me.id, rawCode);
  notify();
  return getUser(result.ownerId) ?? { name: result.ownerName };
};

/* ---------- уведомление подписчиков -------------------------- */

const listeners = new Set();

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const notify = () => {
  for (const fn of listeners) fn();
};

/* Другие вкладки меняют localStorage — перерисовываемся. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEYS.session || (backend.mode === 'local' && Object.values(KEYS).includes(event.key)))
      notify();
  });
}

/* ===========================================================
   Админ-панель — служебный раздел для владельца игры.

   Что здесь есть: список аккаунтов, переименование, сброс пароля,
   отключение устройства, удаление аккаунта, разрыв дружбы, новый
   код-приглашение и смена ключа администратора. Открывается по
   ключу — см. вход в `main.js` (знак игры, Ctrl+Shift+Alt+A или
   адрес с `#admin`).

   Локальный режим: правятся аккаунты этого браузера, ключ лежит
   здесь же хешем. По умолчанию он равен DEFAULT_ADMIN_KEY, и его
   стоит сменить — панель сама об этом напомнит.

   Режим хаба: общие аккаунты правит хаб, а не браузер. Действует
   ключ, сменённый через панель (хранится в данных хаба и переживает
   перезапуск), либо заданный владельцем (MIR_ADMIN_KEY на ПК, секрет
   воркера на хостинге), либо заводской DEFAULT_ADMIN_KEY. Панель на
   хабе включена всегда; заводской ключ публичный — панель напоминает
   сменить его сразу после входа.

   Пароли и здесь не ходят открытым текстом: панель считает
   SHA-256(salt:пароль) на месте и отправляет только хеш.
   =========================================================== */

export const DEFAULT_ADMIN_KEY = 'owlananaslwo';
const ADMIN_SALT_FALLBACK = 'mir-admin-salt-v1';
const ADMIN_MIN_KEY = 6;

/* Ключ живёт только в памяти вкладки: перезагрузка снова спросит его.
   Держать его в localStorage — значит оставить вход открытым тому,
   кто однажды заглянет в браузер. */
let adminSessionKey = '';

const adminRecord = () => readJSON(KEYS.admin, null);

/** Ключ ещё заводской (по умолчанию) — панель просит его сменить. */
export const adminKeyIsDefault = () => !adminRecord();

export const adminKey = () => adminSessionKey;
export const adminLogout = () => {
  adminSessionKey = '';
};

const hashKey = (salt, key) => hashPassword(salt, key);

/** Проверка ключа: у хаба спрашиваем хаб, локально сверяем хеш. */
const verifyAdminKey = async (raw) => {
  const key = String(raw ?? '').trim();
  if (!key) throw new Error('Введите ключ администратора.');
  if (backend.mode === 'hub') return remote.apiAdminPing(key);
  const record = adminRecord();
  const salt = record?.salt || ADMIN_SALT_FALLBACK;
  const expected = record?.hash || (await hashKey(ADMIN_SALT_FALLBACK, DEFAULT_ADMIN_KEY));
  if ((await hashKey(salt, key)) !== expected) throw new Error('Неверный ключ администратора.');
  return { ok: true, hub: 'local' };
};

/** Вход в панель. Возвращает сведения о хабе — их показывает окно. */
export const adminLogin = async (raw) => {
  const key = String(raw ?? '').trim();
  const info = await verifyAdminKey(key);
  adminSessionKey = key;
  return info;
};

const adminUserShape = (user) => ({
  id: user.id,
  name: user.name,
  avatar: user.avatar ?? null,
  friends: Array.isArray(user.friends) ? user.friends : [],
  createdAt: user.createdAt ?? null,
  seenAt: user.seenAt ?? null,
  presence: presenceOf(user),
  inviteCode: user.inviteCode ?? null,
  devices: Array.isArray(user.tokens) ? user.tokens.length : 0,
  ban: banOf(user),
});

const adminStats = (users, requests, bytes, events = 0) => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return {
    users: users.length,
    online: users.filter((user) => presenceOf(user) !== 'offline').length,
    avatars: users.filter((user) => user.avatar).length,
    requests: requests.length,
    links: Math.round(users.reduce((sum, user) => sum + (user.friends?.length ?? 0), 0) / 2),
    banned: users.filter((user) => banOf(user)).length,
    today: users.filter((user) => now - (user.createdAt ?? 0) < day).length,
    week: users.filter((user) => now - (user.createdAt ?? 0) < day * 7).length,
    activeDay: users.filter((user) => now - (user.seenAt ?? 0) < day).length,
    events,
    bytes,
  };
};

/** Снимок журнала для панели: свежие записи вперёд (как у хаба). */
const panelEvents = (events) => events.slice(-150).reverse();

const rawLength = (key) => {
  try {
    return (storage.getItem(key) || '').length;
  } catch {
    return 0;
  }
};

/** Полный снимок для панели: игроки, заявки, размеры. */
export const adminSnapshot = async () => {
  if (backend.mode === 'hub') {
    const data = await remote.apiAdminState(adminSessionKey);
    const users = (data.users ?? []).map(adminUserShape);
    const requests = data.requests ?? [];
    const events = data.events ?? [];
    return {
      mode: 'hub',
      host: hubHost(),
      users,
      requests,
      events,
      settings: data.settings ?? { registrationOpen: true },
      stats: data.stats ?? adminStats(users, requests, 0, events.length),
      /* Хаб сам знает, заводской ли сейчас ключ. */
      keyDefault: data.key?.isDefault === true,
    };
  }
  const users = localBackend.listUsers();
  const requests = localBackend.listRequests();
  const events = readJSON(KEYS.events, []);
  return {
    mode: 'local',
    host: '',
    users: users.map(adminUserShape),
    requests,
    events: panelEvents(events),
    settings: localSettingsShape(),
    stats: adminStats(
      users,
      requests,
      rawLength(KEYS.users) + rawLength(KEYS.requests) + rawLength(KEYS.events),
      events.length,
    ),
    keyDefault: adminKeyIsDefault(),
  };
};

/* Действия локального администратора. Имена те же, что у хаба, —
   окно панели не знает, в каком мире оно работает. */
const localAdminAction = (userId, action, payload = {}) => {
  const users = localBackend.listUsers();
  const user = users.find((item) => item.id === userId);
  if (!user) throw new Error('Аккаунт не найден.');
  const dropLink = (id, friendId) => {
    const record = id === user.id ? user : users.find((item) => item.id === id);
    if (record?.friends?.includes(friendId)) record.friends = record.friends.filter((x) => x !== friendId);
  };

  switch (action) {
    case 'rename': {
      const name = String(payload.name || '').trim();
      validateName(name);
      const owner = users.find((item) => item.nameKey === name.toLowerCase() && item.id !== userId);
      if (owner) throw new Error('Это имя занято.');
      const before = user.name;
      user.name = name;
      user.nameKey = name.toLowerCase();
      localLogEvent('admin:rename', { by: 'admin', userId, name, text: before });
      break;
    }
    case 'password': {
      if (!/^[0-9a-f]{32}$/.test(payload.salt || '') || !/^[0-9a-f]{64}$/.test(payload.hash || ''))
        throw new Error('Не получилось подготовить новый пароль.');
      user.salt = payload.salt;
      user.passHash = payload.hash;
      user.token = null; // старые входы отзываются
      localLogEvent('admin:password', { by: 'admin', userId, name: user.name });
      break;
    }
    case 'kick': {
      user.online = false;
      user.token = null;
      localLogEvent('admin:kick', { by: 'admin', userId, name: user.name });
      break;
    }
    case 'ban': {
      const reason = String(payload.reason || '').trim().slice(0, 140);
      const hours = Math.max(0, Math.min(24 * 365, Number(payload.hours) || 0));
      user.ban = { reason, at: Date.now(), until: hours ? Date.now() + hours * 3_600_000 : 0 };
      /* Блокировка сразу отключает входы: иначе игрок с живой сессией
         доиграл бы до её конца. */
      user.online = false;
      user.token = null;
      localLogEvent('admin:ban', {
        by: 'admin',
        userId,
        name: user.name,
        text: reason,
        until: user.ban.until,
      });
      if (readSession()?.userId === userId) storage.removeItem(KEYS.session);
      break;
    }
    case 'unban': {
      delete user.ban;
      localLogEvent('admin:unban', { by: 'admin', userId, name: user.name });
      break;
    }
    case 'avatar': {
      const avatar = payload.avatar ?? null;
      if (avatar !== null && !String(avatar).startsWith('data:image/'))
        throw new Error('Аватарка должна быть картинкой.');
      user.avatar = avatar === null ? null : String(avatar);
      localLogEvent(avatar ? 'admin:avatar' : 'admin:avatar-clear', {
        by: 'admin',
        userId,
        name: user.name,
      });
      break;
    }
    case 'regen-code': {
      user.inviteCode = makeInviteCode();
      localLogEvent('admin:code', { by: 'admin', userId, name: user.name });
      break;
    }
    case 'unlink': {
      const friendId = String(payload.friendId || '');
      const friend = users.find((item) => item.id === friendId);
      dropLink(user.id, friendId);
      dropLink(friendId, user.id);
      localLogEvent('admin:unlink', {
        by: 'admin',
        userId,
        name: user.name,
        targetId: friendId,
        targetName: friend?.name,
      });
      break;
    }
    case 'unlink-all': {
      const count = user.friends.length;
      for (const friendId of [...user.friends]) dropLink(friendId, user.id);
      user.friends = [];
      localLogEvent('admin:unlink-all', { by: 'admin', userId, name: user.name, count });
      break;
    }
    case 'delete': {
      const rest = users.filter((item) => item.id !== userId);
      for (const other of rest) dropLink(other.id, userId);
      localBackend.saveUsers(rest);
      localBackend.saveRequests(
        localBackend.listRequests().filter((r) => r.from !== userId && r.to !== userId),
      );
      localLogEvent('admin:delete', { by: 'admin', userId, name: user.name });
      if (readSession()?.userId === userId) storage.removeItem(KEYS.session);
      notify();
      return;
    }
    default:
      throw new Error('Неизвестное действие панели.');
  }
  localBackend.saveUsers(users);
  notify();
};

/** Действие над аккаунтом: локально или через хаб. */
export const adminUserAction = async (userId, action, payload = {}) => {
  if (backend.mode === 'hub') {
    await remote.apiAdminUser(adminSessionKey, userId, action, payload);
    return;
  }
  localAdminAction(userId, action, payload);
};

/** Новый пароль игроку — считается здесь, по сети идёт только хеш. */
export const adminSetPassword = async (userId, password) => {
  validatePassword(password);
  const salt = randomHex(16);
  const hash = await hashPassword(salt, password);
  await adminUserAction(userId, 'password', { salt, hash });
};

/** Заблокировать аккаунт: reason — повод, hours — срок (0 — навсегда). */
export const adminBan = async (userId, { reason = '', hours = 0 } = {}) =>
  adminUserAction(userId, 'ban', { reason, hours });

/** Снять блокировку. */
export const adminUnban = async (userId) => adminUserAction(userId, 'unban');

/** Открыть или закрыть регистрацию на хабе (в локальном режиме — здесь же). */
export const adminSetRegistration = async (open) => {
  if (backend.mode === 'hub') {
    await remote.apiAdminSettings(adminSessionKey, { registrationOpen: !!open });
    return;
  }
  saveLocalSettings({ registrationOpen: !!open });
  localLogEvent('admin:settings', {
    by: 'admin',
    text: open ? 'регистрация открыта' : 'регистрация закрыта',
  });
  notify();
};

/** Очистить журнал панели. */
export const adminClearEvents = async () => {
  if (backend.mode === 'hub') {
    await remote.apiAdminEvents(adminSessionKey, { clear: true });
    return;
  }
  writeJSON(KEYS.events, []);
  localLogEvent('admin:events-clear', { by: 'admin' });
  notify();
};

export const adminRemoveRequest = async (requestId) => {
  if (backend.mode === 'hub') {
    await remote.apiAdminRequest(adminSessionKey, requestId);
    return;
  }
  const request = localBackend.listRequests().find((r) => r.id === requestId);
  const nameOf = (id) => localBackend.listUsers().find((u) => u.id === id)?.name;
  localBackend.saveRequests(localBackend.listRequests().filter((r) => r.id !== requestId));
  localLogEvent('admin:request-drop', {
    by: 'admin',
    userId: request?.from,
    name: nameOf(request?.from),
    targetId: request?.to,
    targetName: nameOf(request?.to),
  });
  notify();
};

/** Смена ключа администратора. На хабе новый ключ записывается в данные
    хаба — он переживает перезапуск и общий для всех устройств владельца. */
export const adminSetKey = async (next) => {
  const key = String(next || '').trim();
  if (key.length < ADMIN_MIN_KEY)
    throw new Error(`Ключ короче ${ADMIN_MIN_KEY} символов — подберите длиннее.`);
  if (key === DEFAULT_ADMIN_KEY) throw new Error('Это заводской ключ — придумайте свой.');
  if (backend.mode === 'hub') {
    await remote.apiAdminKey(adminSessionKey, { key });
    adminSessionKey = key;
    return;
  }
  const salt = randomHex(16);
  writeJSON(KEYS.admin, { salt, hash: await hashPassword(salt, key), at: Date.now() });
  adminSessionKey = key;
};

/** Сбросить заводской ключ (забыли свой — вернуть вход по умолчанию). */
export const adminResetKey = async () => {
  if (backend.mode === 'hub') await remote.apiAdminKey(adminSessionKey, { reset: true });
  else storage.removeItem(KEYS.admin);
  adminSessionKey = DEFAULT_ADMIN_KEY;
};

/** Что лежит в этом браузере: панель показывает это в диагностике. */
export const localDataInfo = () => ({
  accounts: localBackend.listUsers().length,
  requests: localBackend.listRequests().length,
  bytes: rawLength(KEYS.users) + rawLength(KEYS.requests),
  persists: storagePersists(),
});

/** Полная очистка локальных аккаунтов и заявок этого браузера. */
export const adminWipeLocal = async () => {
  const count = localBackend.listUsers().length;
  localBackend.saveUsers([]);
  localBackend.saveRequests([]);
  storage.removeItem(KEYS.session);
  localLogEvent('admin:wipe', { by: 'admin', count });
  notify();
};

/* ---------- слоты карт -------------------------------------------
   Слот хранит только seed и размер карты. Саму карту редактор Azgaar
   строит заново при каждом открытии, и по этим двум значениям она
   получается одинаковой на любом устройстве. Поэтому картинок и
   результатов правки в слоте нет: правки живут в файлах Azgaar
   (кнопки сохранения и загрузки в самом редакторе).

   Записи старого формата хранили параметры в поле `config` — читаем
   их так же, как новые. */

export const WORLD_ROLES = ['master', 'player'];
export const WORLD_SLOT_COUNT = 6;
export const WORLD_SEED_MAX = 48;

/* Размеры карты — пиксели SVG Azgaar. Размер входит в карту: тот же seed
   при другом размере даёт другие границы, поэтому хранится вместе с seed.
   Пресеты, а не произвольные числа: мастер и игрок, выбравшие один пункт,
   получают одну и ту же карту. */
export const WORLD_SIZES = [
  { id: 'compact', label: 'Компактная', width: 1280, height: 800 },
  { id: 'standard', label: 'Стандартная', width: 1600, height: 1000 },
  { id: 'wide', label: 'Широкая', width: 1920, height: 1080 },
];
export const WORLD_DEFAULT_SIZE = WORLD_SIZES[1];

/** Параметры мира в допустимом виде: неизвестный размер заменяется стандартным. */
export const normalizeWorldConfig = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const seed = String(source.seed ?? '').trim().slice(0, WORLD_SEED_MAX);
  const size =
    WORLD_SIZES.find((item) => item.width === Number(source.width) && item.height === Number(source.height)) ??
    WORLD_DEFAULT_SIZE;
  return { seed, width: size.width, height: size.height };
};

const worldSlotEntry = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const config = normalizeWorldConfig(raw.config && typeof raw.config === 'object' ? raw.config : raw);
  if (!config.seed) return null;
  return { ...config, savedAt: Number(raw.savedAt) || 0 };
};

const worldSlotIsValid = (role, index) =>
  WORLD_ROLES.includes(role) && Number.isInteger(index) && index >= 0 && index < WORLD_SLOT_COUNT;

/* Читает оба набора слотов. Повреждённая запись превращается в пустой слот,
   а не ломает весь экран «Играть». */
const readWorldSlots = () => {
  const raw = readJSON(KEYS.worlds, null);
  const list = (role) => {
    const items = raw && typeof raw === 'object' && Array.isArray(raw[role]) ? raw[role] : [];
    return Array.from({ length: WORLD_SLOT_COUNT }, (_, index) => worldSlotEntry(items[index]));
  };
  return { master: list('master'), player: list('player') };
};

/** Шесть слотов каждой роли: null — свободный слот. Возвращается новый объект. */
export const loadWorldSlots = () => readWorldSlots();

/** Записывает параметры карты в слот. false — если слот или seed некорректны. */
export const saveWorldSlot = (role, index, config) => {
  const normalized = normalizeWorldConfig(config);
  if (!worldSlotIsValid(role, index) || !normalized.seed) return false;
  const slots = readWorldSlots();
  slots[role][index] = { ...normalized, savedAt: Date.now() };
  writeJSON(KEYS.worlds, { version: 2, ...slots });
  return true;
};

/** Очищает слот. false — если слот некорректен. */
export const clearWorldSlot = (role, index) => {
  if (!worldSlotIsValid(role, index)) return false;
  const slots = readWorldSlots();
  slots[role][index] = null;
  writeJSON(KEYS.worlds, { version: 2, ...slots });
  return true;
};
