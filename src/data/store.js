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
     5. ничего из этого не ответило — работаем локально.

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

const readJSON = (key, fallback) => {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJSON = (key, value) => {
  storage.setItem(key, JSON.stringify(value));
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

const localBackend = {
  mode: 'local',

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
    return { user, token: null };
  },

  async checkLogin({ name, passHash }) {
    const user = this.findByName(name);
    if (!user) throw new Error('Игрок с таким именем не найден.');
    if (user.passHash !== passHash) throw new Error('Неверный пароль.');
    return { user, token: null };
  },

  async beat(userId) {
    this.updateUser(userId, { online: true, seenAt: Date.now() });
  },

  async offline(userId) {
    this.updateUser(userId, { online: false });
  },

  async setPassword(userId, { oldHash, nextSalt, nextHash }) {
    const user = this.listUsers().find((u) => u.id === userId);
    if (!user) throw new Error('Вы не вошли в аккаунт.');
    if (user.passHash !== oldHash) throw new Error('Текущий пароль не подходит.');
    this.updateUser(userId, { salt: nextSalt, passHash: nextHash });
    return {};
  },

  async setAvatar(userId, dataUrl) {
    this.updateUser(userId, { avatar: dataUrl || null });
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
      return { result: { accepted: true, targetId: target.id, targetName: target.name } };
    }
    this.saveRequests([
      ...this.listRequests(),
      { id: `r_${randomHex(6)}`, from: fromId, to: toId, at: Date.now() },
    ]);
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
    return { result: { ownerId: owner.id, ownerName: owner.name } };
  },

  async regenCode(userId) {
    const inviteCode = makeInviteCode();
    this.updateUser(userId, { inviteCode });
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

export const backendMode = () => backend.mode;
export const isHub = () => backend.mode === 'hub';

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
  if (backend.mode === 'hub' && remote.getBase()) return remote.getBase();
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

remote.setTokenGetter(() => readSession()?.token ?? null);

/** Подключаемся к первому хабу, который отозвался. Один раз на старте. */
export const initBackend = async () => {
  if (typeof fetch !== 'function') return 'local';
  const sameOrigin =
    typeof location !== 'undefined' && /^https?:$/.test(location.protocol || '');

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
    if (url === null || url === undefined) return;
    if (url === '' && !sameOrigin) return;
    if (!candidates.includes(url)) candidates.push(url);
  };

  if (saved !== HUB_OFF) {
    add(saved);
    add(remote.getBase()); // адрес мог выставить скрипт проверки
    add(BUILT_IN_HUB);
    add('');
  }

  for (const url of candidates) {
    try {
      await remote.pingHub(url);
      remote.setBase(url);
      backend = hubBackend;
      await resumeSession(url);
      notify();
      return 'hub';
    } catch {
      /* этот адрес не хаб или недоступен — пробуем следующий */
    }
  }

  remote.setBase('');
  backend = localBackend;
  if (sessionHub(readSession()) !== null) storage.removeItem(KEYS.session);
  notify();
  return 'local';
};

/* Сессия переживает перезагрузку, только если хаб тот же самый. */
const resumeSession = async (hub) => {
  const session = readSession();
  if (!session) return;
  if (sessionHub(session) !== hub) {
    storage.removeItem(KEYS.session);
    return;
  }
  try {
    await remote.fetchState();
  } catch (error) {
    /* Токен протух (хаб переустановили) — считаем себя гостем.
       Сетевой сбой сессию не трогает: следующий опрос подтянет. */
    if (error?.status === 401) storage.removeItem(KEYS.session);
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
  storage.removeItem(KEYS.session); // аккаунты другого хаба — другой мир
  remote.setBase(same ? '' : url);
  remote.applyState({ users: [], requests: [] });
  backend = hubBackend;
  notify();
  return { url, users: info.users ?? 0 };
};

/** Отключиться от хаба и работать на аккаунтах этого браузера. */
export const disconnectHub = () => {
  storage.setItem(KEYS.hub, HUB_OFF);
  storage.removeItem(KEYS.session);
  remote.setBase('');
  remote.applyState({ users: [], requests: [] });
  backend = localBackend;
  notify();
  return 'local';
};

/** Подтянуть свежее состояние с хаба (периодический опрос). */
export const refreshRemote = async () => {
  if (backend.mode !== 'hub') return;
  try {
    await remote.fetchState();
    notify();
  } catch (error) {
    if (error?.status === 401) {
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
  return session ? getUser(session.userId) : null;
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

export const logout = () => {
  markOffline();
  storage.removeItem(KEYS.session);
  notify();
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
