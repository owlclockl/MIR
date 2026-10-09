/* ===========================================================
   Лобби и живая синхронизация карты.

   Мастер создаёт лобби, приглашает друзей (или друзья входят по коду),
   а дальше карта мастера течёт всем участникам в реальном времени:

     мастер правит карту → клиент сжимает .map (gzip) → бинарный кадр
     по WebSocket → хаб запоминает последний кадр и пересылает его
     остальным участникам → игроки загружают карту в редактор.

   Что здесь главное:
   — правит только мастер: кадр от игрока хаб отбрасывает, и это
     проверяет сервер, а не интерфейс (панели скрыты лишь стилем);
   — карта лежит в памяти хаба, а не на диске: она нужна тем, кто
     войдёт позже, и теряется вместе с процессом. Состав лобби и
     параметры (seed, размер) сохраняются вместе с данными хаба;
   — пустое лобби (никого в сети) закрывается через десять минут;
   — приглашение живёт пятнадцать минут и доходит по WebSocket сразу,
     а если адресат офлайн — появится, когда он откроет «Играть».

   Ядро не знает про сокеты конкретной платформы. Адаптер передаёт
   объект соединения { send(data), close(code, reason) } и вызывает
   socket.open / message / close. ПК-адаптер — server/ws.mjs, хостинг —
   WebSocketPair внутри Durable Object. Правило то же, что у ядра:
   никаких node:* модулей.

   Кадр карты (бинарный): [u32 длина заголовка][JSON-заголовок][gzip .map].
   Заголовок: { t:'map', lobbyId, seed, width, height, enc:'gzip' }.
   =========================================================== */

export const LOBBY_MAX_MEMBERS = 8;
/* Кадр с картой: .map сжатый gzip — обычно сотни килобайт, с запасом до 16 МБ. */
export const LOBBY_MAX_MAP_BYTES = 16 * 1024 * 1024;
const LOBBY_IDLE_MS = 10 * 60_000;
const INVITE_TTL_MS = 15 * 60_000;
const AUTH_DEADLINE_MS = 10_000;
const MAX_TEXT_CHARS = 64 * 1024;
const MAP_HEADER_MAX = 4096;
const MESSAGE_WINDOW_MS = 10_000;
const MESSAGES_PER_WINDOW = 400;
const MAX_SEED = 48;
/* Размеры совпадают с пресетами игры (store.js, WORLD_SIZES). */
export const LOBBY_SIZES = [
  [1280, 800],
  [1600, 1000],
  [1920, 1080],
];

/* Коды закрытия: 4xxx — зона приложения, её принимают и сокеты ПК, и
   WebSocketPair Cloudflare (стандартные 1008/1009 там не разрешены). */
export const CLOSE_AUTH = 4001;
export const CLOSE_BANNED = 4003;
export const CLOSE_POLICY = 4008;
export const CLOSE_TOO_BIG = 4009;

const sizeAllowed = (width, height) =>
  LOBBY_SIZES.some(([w, h]) => w === Number(width) && h === Number(height));

/**
 * Разбор кадра карты: возвращает заголовок или null, если кадр испорчен.
 * Длина заголовка в первых четырёх байтах, сам заголовок — короткий JSON.
 */
export function parseMapFrame(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(0);
  if (headerLength === 0 || headerLength > MAP_HEADER_MAX || 4 + headerLength > bytes.byteLength) return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4, 4 + headerLength));
    const header = JSON.parse(text);
    if (!header || typeof header !== 'object') return null;
    return header;
  } catch {
    return null;
  }
}

/**
 * Лобби поверх данных хаба.
 *
 * @param {object} deps
 *   db          — данные хаба; сюда кладём db.lobbies (состав и параметры);
 *   auth        — (req) => user, проверка токена для HTTP-маршрутов;
 *   byId, byToken — поиск пользователя;
 *   banOf       — активная блокировка пользователя или null;
 *   makeCode, normalizeCode — код лобби в формате XXXX-XXXX;
 *   hex         — (bytes) => случайная hex-строка;
 *   persistSoon — отложенная запись данных (без ожидания ответа);
 *   now         — часы (для проверок и тестов).
 */
export function createLobbies({
  db,
  auth,
  byId,
  byToken,
  banOf,
  makeCode,
  normalizeCode,
  hex,
  persistSoon = () => {},
  now = () => Date.now(),
}) {
  db.lobbies ??= [];

  /* Сокеты: conn → { userId, authed, windowAt, count }. Онлайн — только
     авторизованные. Всё в памяти: после перезапуска клиенты переподключатся. */
  const sockets = new Map();
  const online = new Map(); // userId → Set<conn>
  /* Приглашения: userId → Map<lobbyId, { lobbyId, from, fromName, at }>. */
  const invites = new Map();
  /* Последний кадр карты лобби: lobbyId → { seq, bytes, at }. */
  const frames = new Map();
  /* Когда в лобби в последний раз кто-то был онлайн: lobbyId → ms. */
  const activity = new Map();

  const isOnline = (userId) => (online.get(userId)?.size ?? 0) > 0;
  const lobbyById = (id) => db.lobbies.find((lobby) => lobby.id === id) ?? null;
  const lobbyOf = (userId) => db.lobbies.find((lobby) => lobby.members.includes(userId)) ?? null;

  const view = (lobby, selfId) => ({
    id: lobby.id,
    code: lobby.code,
    masterId: lobby.masterId,
    masterName: byId(lobby.masterId)?.name ?? '',
    seed: lobby.seed,
    width: lobby.width,
    height: lobby.height,
    createdAt: lobby.createdAt,
    members: lobby.members
      .filter((id) => byId(id))
      .map((id) => ({
        id,
        name: byId(id).name,
        online: isOnline(id),
        master: id === lobby.masterId,
      })),
    role: selfId === lobby.masterId ? 'master' : 'player',
    hasMap: frames.has(lobby.id),
  });

  const invitesOf = (userId) =>
    [...(invites.get(userId)?.values() ?? [])]
      .sort((a, b) => b.at - a.at)
      .map((invite) => ({
        lobbyId: invite.lobbyId,
        code: lobbyById(invite.lobbyId)?.code ?? '',
        from: invite.from,
        fromName: invite.fromName,
        at: invite.at,
      }));

  /* Отправка: тихо пропускаем сокет, который уже закрылся. */
  const sendTo = (conn, payload) => {
    try {
      conn.send(payload);
    } catch {
      /* соединение уже закрыто — адаптер сам вызовет socket.close */
    }
  };

  const sendUser = (userId, payload) => {
    for (const conn of online.get(userId) ?? []) {
      if (sockets.get(conn)?.authed) sendTo(conn, payload);
    }
  };

  /* Состав изменился — каждый участник получает свой вид лобби
     (роль зависит от того, кто смотрит). */
  const notifyLobby = (lobby) => {
    for (const id of lobby.members) sendUser(id, JSON.stringify({ t: 'lobby', lobby: view(lobby, id) }));
  };

  const pushInvites = (userId) => {
    sendUser(userId, JSON.stringify({ t: 'invites', invites: invitesOf(userId) }));
  };

  const dropInvite = (userId, lobbyId) => {
    const map = invites.get(userId);
    if (!map) return;
    map.delete(lobbyId);
    if (map.size === 0) invites.delete(userId);
  };

  const removeLobby = (lobby, reason) => {
    const members = [...lobby.members];
    db.lobbies = db.lobbies.filter((item) => item.id !== lobby.id);
    frames.delete(lobby.id);
    activity.delete(lobby.id);
    for (const id of members) {
      dropInvite(id, lobby.id);
      sendUser(id, JSON.stringify({ t: 'closed', lobbyId: lobby.id, reason }));
      sendUser(id, JSON.stringify({ t: 'lobby', lobby: null }));
    }
    for (const [userId, map] of invites) {
      if (map.has(lobby.id)) dropInvite(userId, lobby.id);
    }
  };

  /* Пустое лобби живёт десять минут после того, как в нём никого не осталось
     онлайн. Протухшие приглашения тоже выметаем здесь. Возвращает true,
     если состав лобби поменялся (тогда нужна запись на диск). */
  const sweep = () => {
    const t = now();
    let changed = false;
    for (const lobby of [...db.lobbies]) {
      if (lobby.members.some(isOnline)) {
        activity.set(lobby.id, t);
      } else if (t - (activity.get(lobby.id) ?? lobby.createdAt) > LOBBY_IDLE_MS) {
        removeLobby(lobby, 'idle');
        changed = true;
      }
    }
    for (const [userId, map] of invites) {
      for (const [lobbyId, invite] of map) {
        if (t - invite.at > INVITE_TTL_MS || !lobbyById(lobbyId)) map.delete(lobbyId);
      }
      if (map.size === 0) invites.delete(userId);
    }
    return changed;
  };

  /* Уборка перед каждым запросом. Если что-то удалили — запись догонит
     отложенное сохранение, иначе лобби «воскреснет» после перезапуска. */
  const tidy = () => {
    if (sweep()) persistSoon();
  };

  const freshCode = () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = makeCode();
      if (!db.lobbies.some((lobby) => lobby.code === code)) return code;
    }
    throw httpError(503, 'Не удалось выдать код лобби — попробуйте ещё раз.');
  };

  const httpError = (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
  };

  const checkParams = (body) => {
    const seed = String(body?.seed ?? '').trim();
    if (!seed) throw httpError(400, 'Укажите seed карты.');
    if (seed.length > MAX_SEED) throw httpError(400, `Seed длиннее ${MAX_SEED} символов.`);
    if (!sizeAllowed(body?.width, body?.height)) throw httpError(400, 'Такого размера карты нет.');
    return { seed, width: Number(body.width), height: Number(body.height) };
  };

  const masterOnly = (me, lobby) => {
    if (!lobby) throw httpError(409, 'Вы не в лобби.');
    if (lobby.masterId !== me.id) throw httpError(403, 'Это может сделать только мастер лобби.');
  };

  const joinLobby = (me, lobby, save) => {
    if (lobby.members.includes(me.id)) return view(lobby, me.id);
    if (lobbyOf(me.id)) throw httpError(409, 'Сначала выйдите из текущего лобби.');
    if (lobby.members.length >= LOBBY_MAX_MEMBERS) throw httpError(409, 'В лобби нет свободных мест.');
    lobby.members.push(me.id);
    activity.set(lobby.id, now());
    dropInvite(me.id, lobby.id);
    save.now();
    notifyLobby(lobby);
    pushInvites(me.id);
    return view(lobby, me.id);
  };

  /* --- HTTP-маршруты. Один и тот же набор работает на ПК и на хостинге. --- */

  const routes = {
    'GET /api/lobby': (req) => {
      const me = auth(req);
      tidy();
      const lobby = lobbyOf(me.id);
      return { lobby: lobby ? view(lobby, me.id) : null, invites: invitesOf(me.id) };
    },

    'POST /api/lobby/create': async (req, body, save) => {
      const me = auth(req);
      tidy();
      if (lobbyOf(me.id)) throw httpError(409, 'Вы уже в лобби — сначала выйдите из него.');
      const params = checkParams(body);
      const lobby = {
        id: `l_${hex(6)}`,
        code: freshCode(),
        masterId: me.id,
        seed: params.seed,
        width: params.width,
        height: params.height,
        members: [me.id],
        createdAt: now(),
      };
      db.lobbies.push(lobby);
      activity.set(lobby.id, now());
      save.now();
      notifyLobby(lobby);
      return { lobby: view(lobby, me.id), invites: invitesOf(me.id) };
    },

    'POST /api/lobby/join': async (req, body, save) => {
      const me = auth(req);
      tidy();
      const code = normalizeCode(body?.code);
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw httpError(400, 'Код лобби выглядит как XXXX-XXXX.');
      const lobby = db.lobbies.find((item) => item.code === code);
      if (!lobby) throw httpError(404, 'Лобби с таким кодом не найдено.');
      const joined = joinLobby(me, lobby, save);
      return { lobby: joined, invites: invitesOf(me.id) };
    },

    'POST /api/lobby/invite': async (req, body, save) => {
      const me = auth(req);
      tidy();
      const lobby = lobbyOf(me.id);
      masterOnly(me, lobby);
      const friend = byId(body?.friendId);
      if (!friend) throw httpError(404, 'Игрок не найден.');
      if (!me.friends.includes(friend.id)) throw httpError(403, 'Приглашать можно только друзей.');
      if (lobby.members.includes(friend.id)) throw httpError(409, `${friend.name} уже в лобби.`);
      if (lobbyOf(friend.id)) throw httpError(409, `${friend.name} уже в другом лобби.`);
      if (lobby.members.length >= LOBBY_MAX_MEMBERS) throw httpError(409, 'В лобби нет свободных мест.');
      let map = invites.get(friend.id);
      if (!map) {
        map = new Map();
        invites.set(friend.id, map);
      }
      map.set(lobby.id, { lobbyId: lobby.id, from: me.id, fromName: me.name, at: now() });
      pushInvites(friend.id);
      /* Приглашение — не состав, на диск не пишем. */
      save.soon();
      return { ok: true, invited: { id: friend.id, name: friend.name } };
    },

    'POST /api/lobby/invite/accept': async (req, body, save) => {
      const me = auth(req);
      tidy();
      const invite = invites.get(me.id)?.get(String(body?.lobbyId ?? ''));
      if (!invite) throw httpError(404, 'Приглашение истекло или уже отозвано.');
      const lobby = lobbyById(invite.lobbyId);
      if (!lobby) {
        dropInvite(me.id, invite.lobbyId);
        pushInvites(me.id);
        throw httpError(404, 'Лобби уже закрыто.');
      }
      const joined = joinLobby(me, lobby, save);
      return { lobby: joined, invites: invitesOf(me.id) };
    },

    'POST /api/lobby/invite/decline': async (req, body, save) => {
      const me = auth(req);
      dropInvite(me.id, String(body?.lobbyId ?? ''));
      pushInvites(me.id);
      save.soon();
      return { invites: invitesOf(me.id) };
    },

    'POST /api/lobby/leave': async (req, body, save) => {
      const me = auth(req);
      const lobby = lobbyOf(me.id);
      if (!lobby) return { lobby: null, invites: invitesOf(me.id) };
      if (lobby.masterId === me.id) {
        removeLobby(lobby, 'master-left');
      } else {
        lobby.members = lobby.members.filter((id) => id !== me.id);
        sendUser(me.id, JSON.stringify({ t: 'lobby', lobby: null }));
        notifyLobby(lobby);
      }
      save.now();
      return { lobby: null, invites: invitesOf(me.id) };
    },

    'POST /api/lobby/kick': async (req, body, save) => {
      const me = auth(req);
      const lobby = lobbyOf(me.id);
      masterOnly(me, lobby);
      const targetId = String(body?.userId ?? '');
      if (targetId === me.id || !lobby.members.includes(targetId)) throw httpError(404, 'Игрока нет в лобби.');
      lobby.members = lobby.members.filter((id) => id !== targetId);
      sendUser(targetId, JSON.stringify({ t: 'closed', lobbyId: lobby.id, reason: 'kicked' }));
      sendUser(targetId, JSON.stringify({ t: 'lobby', lobby: null }));
      notifyLobby(lobby);
      save.now();
      return { lobby: view(lobby, me.id) };
    },

    /* Мастер сменил seed или размер (новый мир). Старый кадр карты больше
       не подходит: новые участники будут ждать карту от мастера. */
    'POST /api/lobby/params': async (req, body, save) => {
      const me = auth(req);
      const lobby = lobbyOf(me.id);
      masterOnly(me, lobby);
      const params = checkParams(body);
      Object.assign(lobby, params);
      frames.delete(lobby.id);
      notifyLobby(lobby);
      save.now();
      return { lobby: view(lobby, me.id) };
    },
  };

  /* --- WebSocket --------------------------------------------------- */

  const detach = (conn) => {
    const state = sockets.get(conn);
    if (!state) return null;
    sockets.delete(conn);
    if (state.authed) {
      const set = online.get(state.userId);
      set?.delete(conn);
      if (set && set.size === 0) online.delete(state.userId);
    }
    return state;
  };

  const closeConn = (conn, code, reason) => {
    detach(conn);
    try {
      conn.close(code, reason);
    } catch {
      /* уже закрыт */
    }
  };

  const takeBudget = (state, t) => {
    if (t - state.windowAt > MESSAGE_WINDOW_MS) {
      state.windowAt = t;
      state.count = 0;
    }
    state.count += 1;
    return state.count <= MESSAGES_PER_WINDOW;
  };

  const handleAuth = (conn, state, msg) => {
    const user = byToken(String(msg.token || ''));
    if (!user) {
      sendTo(conn, JSON.stringify({ t: 'error', message: 'Сессия не найдена — войдите заново.' }));
      closeConn(conn, CLOSE_AUTH, 'auth');
      return;
    }
    const ban = banOf(user);
    if (ban) {
      sendTo(conn, JSON.stringify({ t: 'error', message: 'Аккаунт заблокирован администратором.' }));
      closeConn(conn, CLOSE_BANNED, 'banned');
      return;
    }
    state.userId = user.id;
    state.authed = true;
    let set = online.get(user.id);
    if (!set) {
      set = new Set();
      online.set(user.id, set);
    }
    set.add(conn);
    const lobby = lobbyOf(user.id);
    if (lobby) activity.set(lobby.id, now());
    sendTo(
      conn,
      JSON.stringify({
        t: 'ready',
        user: { id: user.id, name: user.name },
        lobby: lobby ? view(lobby, user.id) : null,
        invites: invitesOf(user.id),
      }),
    );
    /* Присутствие изменилось — остальные участники должны это видеть. */
    if (lobby) notifyLobby(lobby);
  };

  const handleWatch = (conn, state) => {
    const lobby = lobbyOf(state.userId);
    if (!lobby) {
      sendTo(conn, JSON.stringify({ t: 'watched', lobbyId: null, hasMap: false }));
      return;
    }
    const frame = frames.get(lobby.id);
    sendTo(
      conn,
      JSON.stringify({
        t: 'watched',
        lobbyId: lobby.id,
        hasMap: !!frame,
        seq: frame?.seq ?? 0,
        role: lobby.masterId === state.userId ? 'master' : 'player',
      }),
    );
    if (frame) {
      sendTo(conn, frame.bytes);
    } else if (lobby.masterId !== state.userId) {
      /* Карты ещё нет — просим мастера прислать её, как только она будет готова. */
      sendUser(lobby.masterId, JSON.stringify({ t: 'need-map', lobbyId: lobby.id }));
    }
  };

  const handleProgress = (state, msg) => {
    const lobby = lobbyOf(state.userId);
    if (!lobby || lobby.masterId !== state.userId) return;
    const index = Math.max(0, Math.min(999, Math.trunc(Number(msg.index) || 0)));
    const total = Math.max(1, Math.min(999, Math.trunc(Number(msg.total) || 1)));
    const payload = JSON.stringify({
      t: 'progress',
      lobbyId: lobby.id,
      step: String(msg.step ?? '').slice(0, 40),
      name: String(msg.name ?? '').slice(0, 60),
      index,
      total,
    });
    for (const id of lobby.members) if (id !== state.userId) sendUser(id, payload);
  };

  const handleJson = (conn, state, text) => {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      sendTo(conn, JSON.stringify({ t: 'error', message: 'Сообщение — не JSON.' }));
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'auth') {
      if (!state.authed) handleAuth(conn, state, msg);
      return;
    }
    if (!state.authed) {
      sendTo(conn, JSON.stringify({ t: 'error', message: 'Сначала войдите в сессию.' }));
      closeConn(conn, CLOSE_AUTH, 'auth');
      return;
    }
    switch (msg.t) {
      case 'ping':
        sendTo(conn, JSON.stringify({ t: 'pong', n: msg.n ?? null, at: now() }));
        return;
      case 'watch':
        handleWatch(conn, state);
        return;
      case 'progress':
        handleProgress(state, msg);
        return;
      default:
        sendTo(conn, JSON.stringify({ t: 'error', message: 'Неизвестное сообщение.' }));
    }
  };

  const handleFrame = (conn, state, bytes) => {
    const lobby = lobbyOf(state.userId);
    if (!lobby || lobby.masterId !== state.userId) {
      sendTo(conn, JSON.stringify({ t: 'error', message: 'Карту может присылать только мастер лобби.' }));
      return;
    }
    if (bytes.byteLength > LOBBY_MAX_MAP_BYTES) {
      sendTo(conn, JSON.stringify({ t: 'error', message: 'Карта слишком большая для лобби.' }));
      return;
    }
    const header = parseMapFrame(bytes);
    if (
      !header ||
      header.t !== 'map' ||
      header.lobbyId !== lobby.id ||
      header.enc !== 'gzip' ||
      typeof header.seed !== 'string' ||
      header.seed.length > MAX_SEED ||
      !sizeAllowed(header.width, header.height)
    ) {
      sendTo(conn, JSON.stringify({ t: 'error', message: 'Кадр карты повреждён.' }));
      return;
    }
    const seq = (frames.get(lobby.id)?.seq ?? 0) + 1;
    frames.set(lobby.id, { seq, bytes, at: now() });
    activity.set(lobby.id, now());
    /* Мастер мог сменить seed или размер прямо в редакторе Azgaar —
       лобби должно показывать ту карту, которая реально идёт. */
    const paramsChanged =
      lobby.seed !== header.seed || lobby.width !== Number(header.width) || lobby.height !== Number(header.height);
    if (paramsChanged) {
      lobby.seed = header.seed;
      lobby.width = Number(header.width);
      lobby.height = Number(header.height);
      notifyLobby(lobby);
      persistSoon();
    }
    let delivered = 0;
    for (const id of lobby.members) {
      if (id === state.userId) continue;
      for (const other of online.get(id) ?? []) {
        if (sockets.get(other)?.authed) {
          sendTo(other, bytes);
          delivered += 1;
        }
      }
    }
    sendTo(conn, JSON.stringify({ t: 'ack', seq, delivered }));
  };

  const socket = {
    /** Новое соединение. Без входа в сессию за десять секунд оно закрывается. */
    open(conn) {
      sockets.set(conn, { userId: null, authed: false, windowAt: now(), count: 0 });
      setTimeout(() => {
        const state = sockets.get(conn);
        if (state && !state.authed) closeConn(conn, CLOSE_AUTH, 'auth-timeout');
      }, AUTH_DEADLINE_MS);
    },

    /** Текст — управляющие сообщения JSON, бинарь — кадр карты. */
    message(conn, data) {
      const state = sockets.get(conn);
      if (!state) return;
      if (!takeBudget(state, now())) {
        closeConn(conn, CLOSE_POLICY, 'rate');
        return;
      }
      if (typeof data === 'string') {
        if (data.length > MAX_TEXT_CHARS) {
          closeConn(conn, CLOSE_TOO_BIG, 'too-big');
          return;
        }
        handleJson(conn, state, data);
        return;
      }
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      if (!state.authed) {
        closeConn(conn, CLOSE_AUTH, 'auth');
        return;
      }
      handleFrame(conn, state, bytes);
    },

    /** Соединение закрыто (клиентом, сетью или адаптером). */
    close(conn) {
      const state = detach(conn);
      if (!state?.authed) return;
      const lobby = lobbyOf(state.userId);
      if (lobby) {
        activity.set(lobby.id, now());
        notifyLobby(lobby);
      }
    },
  };

  /* Пользователя удалили или заблокировали: убираем из лобби и рвём сессии. */
  const forgetUser = (userId, reason = 'Аккаунт больше не в игре.') => {
    const lobby = lobbyOf(userId);
    if (lobby) {
      if (lobby.masterId === userId) removeLobby(lobby, 'master-left');
      else {
        lobby.members = lobby.members.filter((id) => id !== userId);
        notifyLobby(lobby);
      }
    }
    invites.delete(userId);
    for (const conn of [...(online.get(userId) ?? [])]) {
      sendTo(conn, JSON.stringify({ t: 'error', message: reason }));
      closeConn(conn, CLOSE_BANNED, 'forgotten');
    }
  };

  return {
    routes,
    socket,
    forgetUser,
    sweep,
    stats: () => ({ lobbies: db.lobbies.length, sockets: sockets.size, frames: frames.size }),
  };
}
