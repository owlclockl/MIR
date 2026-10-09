/* ===========================================================
   Лобби на клиенте: состояние, живой канал и события карты.

   Здесь живёт связь с хабом для лобби (WebSocket /api/ws). Остальной
   интерфейс только спрашивает состояние и подписывается на события;
   сама синхронизация редактора Azgaar — в src/game/lobby-sync.js.

   Что умеет канал:
   — вход по токену сессии (первым сообщением, а не в адресе);
   — переподключение с нарастающей паузой и сразу повторный вход, как
     только появилась сеть;
   — пинг раз в 15 секунд: задержка канала видна в интерфейсе, а
     молчащий канал закрывается и открывается заново;
   — бинарные кадры двух видов — полная карта («map») и живой снимок
     предпросмотра («live»): мастер шлёт, хаб пересылает остальным, все
     события доставляются в порядке прихода;
   — отказ сессии или блокировка останавливают переподключение: стучаться
     с отозванным токеном незачем.

   Устаревший сокет (его уже заменили новым) не трогает состояние: все
   обработчики сначала проверяют, что сокет всё ещё текущий.

   Состояние лобби хаб присылает целиком при каждом изменении, поэтому
   клиент ничего не «догадывает»: что пришло, то и показываем.
   =========================================================== */

import { getCurrentUser, isHub, subscribe as subscribeStore } from './store.js';
import * as remote from './remote.js';
import { peekFrameType } from '../game/map-frame.js';

const PING_EVERY_MS = 15_000;
const PONG_TIMEOUT_MS = 40_000;
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 8_000;
const RTT_SAMPLES = 5;

/* Коды закрытия из hub-lobby.mjs: сессия не принята и аккаунт заблокирован.
   С ними переподключаться бессмысленно. */
const CLOSE_AUTH = 4001;
const CLOSE_BANNED = 4003;

const state = {
  status: 'idle', // idle | connecting | online | offline
  user: null, // { id, name } после входа
  lobby: null, // вид лобби для текущего пользователя (см. hub-lobby.mjs)
  invites: [],
  rtt: null, // миллисекунды, медиана последних замеров
  masterStage: null, // { name, index, total } — что сейчас строит мастер
  notice: '', // последнее сообщение хаба о лобби
  live: false, // мастер сейчас правит карту — идёт живой предпросмотр
  applying: false, // идёт применение полной карты у этого игрока
  delivered: null, // сколько игроков получили последнюю карту мастера
};

const stateListeners = new Set();
const eventListeners = new Set();
const rttSamples = [];

let socket = null;
let wantOpen = false;
let reconnectTimer = 0;
let reconnectDelay = RECONNECT_MIN_MS;
let pingTimer = 0;
let lastPongAt = 0;
const pingSent = new Map(); // n → время отправки

const snapshot = () => ({ ...state, members: state.lobby?.members ?? [] });

const setState = (patch) => {
  Object.assign(state, patch);
  const view = snapshot();
  for (const fn of stateListeners) fn(view);
};

const emit = (event) => {
  for (const fn of eventListeners) fn(event);
};

/** Текущее состояние лобби (только чтение). */
export const lobbyState = () => snapshot();

/** Подписка на изменения состояния: fn(state). Возвращает отписку. */
export const subscribeLobby = (fn) => {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
};

/** Подписка на события карты и канала: fn({ type, ... }). Возвращает отписку. */
export const onLobbyEvent = (fn) => {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
};

/** Сообщение для интерфейса (тост): синхронизация карты не справилась. */
export const reportLobbyError = (message) => emit({ type: 'error', message });

/* Пометки о живом предпросмотре. Их ставит синхронизация (lobby-sync.js),
   а читает плашка статуса в main.js. setState сам будит подписчиков. */

/** Мастер сейчас правит карту: снимки предпросмотра идут потоком. */
export const setLobbyLive = (live) => {
  if (state.live !== !!live) setState({ live: !!live });
};

/** У этого игрока идёт применение полной карты. */
export const setLobbyApplying = (applying) => {
  if (state.applying !== !!applying) setState({ applying: !!applying });
};

/** Мастер: сколько игроков получили последнюю карту (ответ хаба «ack»). */
export const setLobbyDelivered = (delivered) => {
  const value = Number.isFinite(delivered) ? delivered : null;
  if (state.delivered !== value) setState({ delivered: value });
};

/** Можно ли пользоваться лобби: нужен общий хаб и вход в аккаунт. */
export const lobbyAvailable = () => isHub();

/* ---------- HTTP: состав лобби ------------------------------- */

const applyLobbyResponse = (data) => {
  setState({
    lobby: data.lobby ?? null,
    invites: data.invites ?? state.invites,
    masterStage: data.lobby ? state.masterStage : null,
  });
  return data;
};

/** Перечитать лобби и приглашения с хаба. */
export const refreshLobby = async () => {
  if (!lobbyAvailable()) return null;
  return applyLobbyResponse(await remote.apiLobbyGet());
};

export const createLobby = async ({ seed, width, height }) =>
  applyLobbyResponse(await remote.apiLobbyCreate({ seed, width, height }));

export const joinLobby = async (code) => applyLobbyResponse(await remote.apiLobbyJoin(code));

export const inviteFriend = (friendId) => remote.apiLobbyInvite(friendId);

export const acceptInvite = async (lobbyId) => applyLobbyResponse(await remote.apiLobbyAccept(lobbyId));

export const declineInvite = async (lobbyId) => {
  const data = await remote.apiLobbyDecline(lobbyId);
  setState({ invites: data.invites ?? [] });
  return data;
};

export const leaveLobby = async () => {
  const data = await remote.apiLobbyLeave();
  setState({ lobby: null, masterStage: null, live: false, applying: false, delivered: null, invites: data.invites ?? state.invites });
  return data;
};

export const kickMember = (userId) => remote.apiLobbyKick(userId);

export const setLobbyParams = async ({ seed, width, height }) =>
  applyLobbyResponse(await remote.apiLobbyParams({ seed, width, height }));

/* ---------- живой канал ------------------------------------- */

const wsUrl = () => {
  const base = remote.getBase();
  if (base) return `${base.replace(/^http/i, 'ws')}/api/ws`;
  const { protocol, host } = globalThis.location;
  return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/api/ws`;
};

const clearTimers = () => {
  clearTimeout(reconnectTimer);
  clearInterval(pingTimer);
  reconnectTimer = 0;
  pingTimer = 0;
};

const sendJson = (payload) => {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(payload));
  return true;
};

const pushRtt = (ms) => {
  rttSamples.push(ms);
  if (rttSamples.length > RTT_SAMPLES) rttSamples.shift();
  const sorted = [...rttSamples].sort((a, b) => a - b);
  setState({ rtt: sorted[Math.floor(sorted.length / 2)] });
};

const scheduleReconnect = () => {
  if (!wantOpen || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = 0;
    openSocket();
  }, reconnectDelay);
  reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 2);
};

const closeNotice = (reason) => {
  if (reason === 'kicked') return 'Мастер исключил вас из лобби.';
  if (reason === 'idle') return 'Лобби закрыто: в нём никого не было в сети.';
  return 'Мастер закрыл лобби.';
};

const handleJson = (text) => {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }
  switch (msg.t) {
    case 'ready':
      reconnectDelay = RECONNECT_MIN_MS;
      setState({ status: 'online', user: msg.user, invites: msg.invites ?? [] });
      applyLobbyResponse({ lobby: msg.lobby, invites: msg.invites ?? [] });
      /* Переподключились посреди лобби: карту надо перечитать у хаба. */
      if (msg.lobby) emit({ type: 'resume', lobby: msg.lobby });
      return;
    case 'lobby':
      if (!msg.lobby) {
        setState({ lobby: null, masterStage: null, live: false, applying: false, delivered: null });
        emit({ type: 'left' });
      } else {
        setState({ lobby: msg.lobby, notice: '' });
        emit({ type: 'lobby', lobby: msg.lobby });
      }
      return;
    case 'invites':
      setState({ invites: msg.invites ?? [] });
      return;
    case 'watched':
      emit({ type: 'watched', lobbyId: msg.lobbyId, hasMap: !!msg.hasMap, seq: msg.seq ?? 0, role: msg.role ?? null });
      return;
    case 'need-map':
      emit({ type: 'need-map', lobbyId: msg.lobbyId });
      return;
    case 'progress':
      setState({ masterStage: { name: msg.name, index: msg.index, total: msg.total, step: msg.step, at: Date.now() } });
      emit({ type: 'progress', ...msg });
      return;
    case 'ack':
      emit({ type: 'ack', seq: msg.seq, delivered: msg.delivered });
      return;
    case 'closed':
      setState({ lobby: null, masterStage: null, live: false, applying: false, delivered: null, notice: closeNotice(msg.reason) });
      emit({ type: 'closed', reason: msg.reason, lobbyId: msg.lobbyId });
      return;
    case 'pong': {
      const sentAt = pingSent.get(msg.n);
      pingSent.delete(msg.n);
      lastPongAt = Date.now();
      if (sentAt) pushRtt(Date.now() - sentAt);
      return;
    }
    case 'error':
      setState({ notice: String(msg.message || '') });
      if (String(msg.message || '').length) emit({ type: 'error', message: msg.message });
      return;
    default:
      return;
  }
};

/* Переподключаться незачем: сессия не принята или аккаунт заблокирован.
   Канал закрываем насовсем; вход в аккаунт откроет его снова. */
const giveUp = (notice) => {
  wantOpen = false;
  clearTimers();
  setState({ status: 'idle', user: null, lobby: null, invites: [], rtt: null, masterStage: null, live: false, applying: false, delivered: null, notice });
};

const openSocket = () => {
  if (!wantOpen || !lobbyAvailable()) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  setState({ status: 'connecting' });
  let ws;
  try {
    ws = new WebSocket(wsUrl());
  } catch {
    setState({ status: 'offline' });
    scheduleReconnect();
    return;
  }
  ws.binaryType = 'arraybuffer';
  socket = ws;
  ws.onopen = () => {
    if (socket !== ws) return; // сокет уже заменили — этот не наш
    const token = remote.currentToken();
    if (!token) {
      giveUp('Войдите в аккаунт, чтобы открыть лобби.');
      ws.close(CLOSE_AUTH, 'no-token');
      return;
    }
    ws.send(JSON.stringify({ t: 'auth', token }));
    lastPongAt = Date.now();
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (Date.now() - lastPongAt > PONG_TIMEOUT_MS) {
        ws.close(4000, 'silent');
        return;
      }
      const n = Math.random().toString(36).slice(2, 8);
      pingSent.set(n, Date.now());
      sendJson({ t: 'ping', n });
    }, PING_EVERY_MS);
  };
  ws.onmessage = (event) => {
    if (socket !== ws) return;
    if (typeof event.data === 'string') {
      handleJson(event.data);
      return;
    }
    /* Бинарь — кадр лобби. Полная карта и живой снимок идут одним потоком:
       тип смотрим в заголовке кадра (см. game/map-frame.js). */
    const bytes = new Uint8Array(event.data);
    emit({ type: peekFrameType(bytes) === 'live' ? 'live' : 'map', bytes });
  };
  ws.onclose = (event) => {
    /* Закрылся устаревший сокет: текущий уже работает, его состояние не трогаем. */
    if (socket !== ws) return;
    socket = null;
    clearInterval(pingTimer);
    pingTimer = 0;
    pingSent.clear();
    if (event?.code === CLOSE_AUTH) {
      giveUp('Сессия закрыта — войдите в аккаунт снова.');
      return;
    }
    if (event?.code === CLOSE_BANNED) {
      giveUp('Аккаунт заблокирован администратором.');
      return;
    }
    setState({ status: wantOpen ? 'offline' : 'idle', rtt: null });
    scheduleReconnect();
  };
  ws.onerror = () => {
    /* ошибка всегда сопровождается close — переподключение там */
  };
};

/** Открыть живой канал (если его ещё нет). Безопасно вызывать часто. */
export const connectLobby = () => {
  if (!lobbyAvailable()) return false;
  wantOpen = true;
  openSocket();
  return true;
};

/** Закрыть канал и перестать переподключаться (выход из аккаунта). */
export const disconnectLobby = () => {
  wantOpen = false;
  clearTimers();
  const ws = socket;
  socket = null;
  try {
    ws?.close(1000, 'bye');
  } catch {
    /* уже закрыт */
  }
  setState({ status: 'idle', user: null, lobby: null, invites: [], rtt: null, masterStage: null, live: false, applying: false, delivered: null, notice: '' });
};

/* Выход из аккаунта (здесь или в соседней вкладке) гасит живой канал: токен
   уже отозван, а открытый сокет продолжал бы вести лобби от его имени. */
subscribeStore(() => {
  if (wantOpen && !getCurrentUser()) disconnectLobby();
});

/* Сеть вернулась — не ждём остаток паузы: переподключаемся сразу. */
globalThis.addEventListener?.('online', () => {
  if (!wantOpen || socket) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  reconnectDelay = RECONNECT_MIN_MS;
  openSocket();
});

/** Просим хаб прислать текущую карту лобби (или сообщить, что её ещё нет). */
export const watchLobbyMap = () => sendJson({ t: 'watch' });

/** Мастер отправляет кадр карты (см. hub-lobby.mjs). false — канал не открыт. */
export const sendLobbyMap = (bytes) => {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(bytes);
  return true;
};

/** Живой снимок предпросмотра: тот же бинарный кадр, хаб не подтверждает его. */
export const sendLobbyLive = sendLobbyMap;

/** Ход генерации для игроков: шаг, номер и количество шагов. */
export const sendLobbyProgress = ({ step, name, index, total }) =>
  sendJson({ t: 'progress', step, name, index, total });
