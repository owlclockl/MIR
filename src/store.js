/* ===========================================================
   Слой данных: аккаунты, друзья, заявки, код-приглашения.
   Сервера у проекта нет — «база» живёт в localStorage браузера.
   Всё, что относится к состоянию, читается свежим при каждом
   вызове, поэтому вкладки синхронизируются через событие storage.
   =========================================================== */

const KEYS = {
  users: 'mir:users',
  requests: 'mir:requests',
  session: 'mir:session',
};

/* Имена, которые нельзя занять: они используются интерфейсом. */
const RESERVED_NAMES = new Set(['гость', 'guest', 'игрок', 'player']);

const NAME_RE = /^[A-Za-zА-Яа-яЁё0-9_-]{3,16}$/;
const NAME_RULE =
  'Имя: 3–16 символов — буквы, цифры, дефис и подчёркивание, без пробелов.';

/* ---------- низкий уровень --------------------------------- */

const readJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJSON = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
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

/* ---------- пользователи ------------------------------------ */

export const listUsers = () => readJSON(KEYS.users, []);
const saveUsers = (users) => writeJSON(KEYS.users, users);

export const getUser = (id) => listUsers().find((u) => u.id === id) || null;

export const findUserByName = (name) => {
  const key = name.trim().toLowerCase();
  return listUsers().find((u) => u.nameKey === key) || null;
};

const updateUser = (id, patch) => {
  const users = listUsers();
  const ix = users.findIndex((u) => u.id === id);
  if (ix === -1) return null;
  users[ix] = { ...users[ix], ...patch };
  saveUsers(users);
  return users[ix];
};

/* Алфавит без похожих символов: 0/O, 1/I/L исключены. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const makeInviteCode = () => {
  const bytes = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  const raw = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};

const normalizeCode = (code) =>
  code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^(.{4})(.{4}).*$/, '$1-$2');

/* ---------- сессия и присутствие ---------------------------- */

export const getSession = () => {
  const session = readJSON(KEYS.session, null);
  return session && getUser(session.userId) ? session : null;
};

export const getCurrentUser = () => {
  const session = getSession();
  return session ? getUser(session.userId) : null;
};

/* Новая сессия гасит предыдущую: иначе прошлый пользователь
   навсегда остался бы «в сети» после входа другого. */
const startSession = (userId) => {
  const prev = getSession();
  if (prev && prev.userId !== userId) updateUser(prev.userId, { online: false });
  writeJSON(KEYS.session, { userId, since: Date.now() });
};

/* «В сети» — есть активная сессия и свежий пульс (вкладка могла
   закрыться аварийно, тогда heartbeat просто перестаёт приходить). */
const PRESENCE_TTL = 90_000;

export const presenceOf = (user) =>
  user && user.online && Date.now() - user.seenAt < PRESENCE_TTL ? 'idle' : 'offline';

export const heartbeat = () => {
  const session = getSession();
  if (!session) return;
  updateUser(session.userId, { online: true, seenAt: Date.now() });
};

export const markOffline = () => {
  const session = getSession();
  if (session) updateUser(session.userId, { online: false });
};

/* ---------- auth ------------------------------------------- */

const validateName = (name) => {
  if (!NAME_RE.test(name.trim())) throw new Error(NAME_RULE);
  if (RESERVED_NAMES.has(name.trim().toLowerCase()))
    throw new Error('Это имя занято.');
};

const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < 6)
    throw new Error('Пароль: минимум 6 символов.');
  if (password.length > 72) throw new Error('Пароль: максимум 72 символа.');
};

export const register = async (name, password) => {
  const displayName = name.trim();
  validateName(displayName);
  validatePassword(password);
  if (findUserByName(displayName)) throw new Error('Это имя занято.');

  const salt = randomHex(16);
  const user = {
    id: `u_${randomHex(8)}`,
    name: displayName,
    nameKey: displayName.toLowerCase(),
    salt,
    passHash: await hashPassword(salt, password),
    avatar: null,
    friends: [],
    inviteCode: makeInviteCode(),
    createdAt: Date.now(),
    seenAt: Date.now(),
    online: true,
  };
  saveUsers([...listUsers(), user]);
  startSession(user.id);
  notify();
  return user;
};

export const login = async (name, password) => {
  const user = findUserByName(name);
  if (!user) throw new Error('Игрок с таким именем не найден.');
  const passHash = await hashPassword(user.salt, password);
  if (passHash !== user.passHash) throw new Error('Неверный пароль.');
  startSession(user.id);
  updateUser(user.id, { online: true, seenAt: Date.now() });
  notify();
  return getUser(user.id);
};

export const logout = () => {
  markOffline();
  localStorage.removeItem(KEYS.session);
  notify();
};

export const changePassword = async (oldPassword, newPassword) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  validatePassword(newPassword);
  const oldHash = await hashPassword(me.salt, oldPassword);
  if (oldHash !== me.passHash) throw new Error('Текущий пароль не подходит.');
  const salt = randomHex(16);
  updateUser(me.id, { salt, passHash: await hashPassword(salt, newPassword) });
  notify();
};

/* ---------- аватар ------------------------------------------ */

export const MAX_AVATAR_BYTES = 300 * 1024;

export const setAvatar = (dataUrl) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  if (dataUrl && dataUrl.length > MAX_AVATAR_BYTES)
    throw new Error('Картинка слишком тяжёлая даже после сжатия.');
  updateUser(me.id, { avatar: dataUrl || null });
  notify();
};

/* ---------- друзья и заявки --------------------------------- */

const listRequests = () => readJSON(KEYS.requests, []);
const saveRequests = (requests) => writeJSON(KEYS.requests, requests);

export const incomingRequests = (userId) =>
  listRequests()
    .filter((r) => r.to === userId)
    .sort((a, b) => b.at - a.at);

export const outgoingRequests = (userId) =>
  listRequests().filter((r) => r.from === userId);

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

const linkFriends = (aId, bId) => {
  const a = getUser(aId);
  const b = getUser(bId);
  if (!a || !b || aId === bId) return;
  if (!a.friends.includes(bId)) updateUser(aId, { friends: [...a.friends, bId] });
  if (!b.friends.includes(aId)) updateUser(bId, { friends: [...b.friends, aId] });
};

/* Отправка заявки. Если тот игрок уже отправил заявку мне —
   считаем это взаимным интересом и сразу становимся друзьями. */
export const sendRequest = (toId) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  const target = getUser(toId);
  if (!target) throw new Error('Игрок не найден.');
  if (target.id === me.id) throw new Error('Нельзя добавить самого себя.');
  if (me.friends.includes(target.id)) throw new Error(`${target.name} уже у вас в друзьях.`);
  if (outgoingRequests(me.id).some((r) => r.to === target.id))
    throw new Error(`Заявка игроку ${target.name} уже отправлена.`);

  const reciprocal = incomingRequests(me.id).find((r) => r.from === target.id);
  if (reciprocal) {
    saveRequests(listRequests().filter((r) => r.id !== reciprocal.id));
    linkFriends(me.id, target.id);
    notify();
    return { accepted: true, target };
  }

  saveRequests([
    ...listRequests(),
    { id: `r_${randomHex(6)}`, from: me.id, to: target.id, at: Date.now() },
  ]);
  notify();
  return { accepted: false, target };
};

export const acceptRequest = (requestId) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  const request = listRequests().find((r) => r.id === requestId && r.to === me.id);
  if (!request) throw new Error('Заявка не найдена.');
  saveRequests(listRequests().filter((r) => r.id !== requestId));
  linkFriends(request.from, me.id);
  notify();
  return getUser(request.from);
};

export const declineRequest = (requestId) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  const request = listRequests().find((r) => r.id === requestId && r.to === me.id);
  if (!request) throw new Error('Заявка не найдена.');
  saveRequests(listRequests().filter((r) => r.id !== requestId));
  notify();
  return getUser(request.from);
};

export const removeFriend = (friendId) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  const friend = getUser(friendId);
  if (friend)
    updateUser(friendId, { friends: friend.friends.filter((id) => id !== me.id) });
  updateUser(me.id, { friends: me.friends.filter((id) => id !== friendId) });
  notify();
  return friend;
};

/* ---------- код-приглашения --------------------------------- */

export const regenerateInviteCode = () => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  updateUser(me.id, { inviteCode: makeInviteCode() });
  notify();
  return getUser(me.id).inviteCode;
};

export const useInviteCode = (rawCode) => {
  const me = getCurrentUser();
  if (!me) throw new Error('Вы не вошли в аккаунт.');
  const code = normalizeCode(rawCode);
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code))
    throw new Error('Код выглядит как XXXX-XXXX.');
  const owner = listUsers().find((u) => u.inviteCode === code);
  if (!owner) throw new Error('Такой код никому не выдан.');
  if (owner.id === me.id) throw new Error('Это ваш собственный код.');
  if (me.friends.includes(owner.id))
    throw new Error(`${owner.name} уже у вас в друзьях.`);
  /* Код — это личное приглашение: дружба сразу взаимная, без заявки. */
  saveRequests(
    listRequests().filter(
      (r) =>
        !(r.from === me.id && r.to === owner.id) &&
        !(r.from === owner.id && r.to === me.id),
    ),
  );
  linkFriends(me.id, owner.id);
  notify();
  return owner;
};

export const normalizeInviteInput = normalizeCode;

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
    if (Object.values(KEYS).includes(event.key)) notify();
  });
}
