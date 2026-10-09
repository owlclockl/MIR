/* ===========================================================
   Прямая связь между игроками (P2P).

   Основной путь — общий хаб: он хранит аккаунты и доставляет сообщения.
   WebRTC/P2P поднимается автоматически в фоне как вторичный канал и
   используется напрямую только как резерв, если хаб временно недоступен.
   Так домашний NAT не мешает друзьям оставаться на связи.

   Автоматический резерв:
   1. Хаб сводит игроков через offer/answer/ICE и остаётся основным
      транспортом сообщений (`/api/p2p/*`).
   2. Параллельно WebRTC пробует прямой канал; сообщения переключаются
      на него только при ошибке доставки через хаб.
   3. Ручное подключение по коду — отдельный последний вариант без хаба,
      например для двух однофайловых `mir.html`.

   Поэтому состояние «через хаб» — штатное основное подключение, а не
   ошибка или деградация. P2P — дополнительный маршрут.

   Наружу модуль отдаёт: start/stop, статус пары, историю
   сообщений, отправку и подписку на изменения.
   =========================================================== */

import * as store from './store.js';
import * as remote from './remote.js';

/* Публичные STUN: нужны только чтобы узнать свой внешний адрес.
   Данные игроков через них не идут. Список с запасом — если один
   недоступен, подойдёт следующий. */
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.nextcloud.com:443' },
];

const CHANNEL = 'mir';

const TIMING = {
  tick: 2500, // как часто пересматриваем, с кем надо быть на связи
  flush: 120, // склейка исходящих сигналов в одну отправку
  ping: 5000, // сердцебиение внутри канала
  pongTimeout: 16_000, // молчит дольше — канал считаем мёртвым
  relayAfter: 9000, // столько ждём прямой канал, потом включаем запасной
  retryBase: 2000, // пауза перед повтором, растёт до retryMax
  retryMax: 20_000,
  handshake: 30_000, // предел на одну попытку соединения
  /* Сбор ICE для кода прямого подключения. Мёртвые VPN-адаптеры
     (TUN-режим) заставляют STUN-запросы умирать по таймауту, поэтому
     сбор с заметным числом интерфейсов дольше обычного: ждём с запасом —
     код без внешнего адреса через интернет всё равно не соединится. */
  manualGather: 8000,
};

const HISTORY_LIMIT = 200;
const MESSAGE_LIMIT = 2000; // символов в одном сообщении
/* Сколько раз повторяем сообщение через хаб, прежде чем признать его
   недоставленным (раз в retryBase — это около десяти секунд). */
const MAX_SIGNAL_TRIES = 5;

export const MANUAL_ID = 'direct';

/* ---------- состояние ---------------------------------------- */

const peers = new Map(); // peerId → запись пира
const history = new Map(); // peerId → [{ id, mine, text, at, via }]
const listeners = new Set();

let running = false;
let selfId = null;
let inboxLoop = null;
let tickTimer = null;
let outbox = [];
let flushTimer = null;
let flushing = false;
let signalEpoch = 0;

const emit = (change = {}) => {
  for (const fn of listeners) {
    try {
      fn(change);
    } catch {
      /* Подписчик упал — остальные не должны пострадать. */
    }
  }
};

/** Подписка на любые изменения: статусы, сообщения. */
export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const now = () => Date.now();

const rid = () => {
  const bytes = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Поддерживает ли браузер WebRTC вообще. */
export const supported = () =>
  typeof globalThis.RTCPeerConnection === 'function';

/* ---------- история сообщений -------------------------------- */

const pushHistory = (peerId, entry) => {
  const list = history.get(peerId) ?? [];
  list.push(entry);
  if (list.length > HISTORY_LIMIT) list.splice(0, list.length - HISTORY_LIMIT);
  history.set(peerId, list);
};

/** Переписка с игроком (в памяти вкладки, на диск не пишется). */
export const messages = (peerId) => history.get(peerId) ?? [];

/** Есть ли непрочитанные (для значка в списке друзей). */
export const unread = (peerId) =>
  (history.get(peerId) ?? []).filter((m) => !m.mine && !m.read).length;

export const markRead = (peerId) => {
  const list = history.get(peerId);
  if (!list?.some((m) => !m.mine && !m.read)) return;
  for (const m of list) m.read = true;
  emit({ type: 'read', peerId });
};

/* ---------- запись пира --------------------------------------- */

const blankPeer = (peerId) => ({
  id: peerId,
  manual: peerId === MANUAL_ID,
  name: '',
  state: 'offline', // offline | connecting | direct | relay
  rtt: null,
  since: 0,
  pc: null,
  dc: null,
  polite: false, // true — мы отвечаем, false — мы звоним
  pending: [], // ICE-кандидаты до установки remoteDescription
  directReady: false, // P2P готов, но при активном хабе остаётся резервным
  secondaryDisabled: false,
  tries: 0,
  retryAt: 0,
  startedAt: 0,
  lastPong: 0,
  pingSeq: 0,
  pingTimer: null,
  guardTimer: null,
  closing: false,
  /* Диагностика ручного соединения: без них интерфейс мог показать
     только голое «нет связи», и человек гадал, в чём дело. */
  failReason: null, // 'nat' — канал не пробился между устройствами
  gather: null, // { total, host, srflx } — какие адреса вошли в последний код
});

const peerRecord = (peerId) => {
  let peer = peers.get(peerId);
  if (!peer) {
    peer = blankPeer(peerId);
    peers.set(peerId, peer);
  }
  return peer;
};

const setState = (peer, state) => {
  if (peer.state === state) return;
  peer.state = state;
  if (state === 'direct' || state === 'relay') peer.since = peer.since || now();
  if (state === 'offline') {
    peer.since = 0;
    peer.rtt = null;
  }
  emit({ type: 'status', peerId: peer.id });
};

/** Состояние связи с игроком: { state, rtt, since, name, directReady }. */
export const status = (peerId) => {
  const peer = peers.get(peerId);
  if (!peer)
    return {
      state: 'offline',
      rtt: null,
      since: 0,
      name: '',
      failReason: null,
      gather: null,
      directReady: false,
      secondaryDisabled: false,
    };
  return {
    state: peer.state,
    rtt: peer.rtt,
    since: peer.since,
    name: peer.name,
    failReason: peer.failReason,
    gather: peer.gather,
    directReady: peer.directReady,
    secondaryDisabled: peer.secondaryDisabled,
  };
};

/** Сколько друзей сейчас на прямой связи. */
export const liveCount = () =>
  [...peers.values()].filter((p) => p.state === 'direct' || p.state === 'relay').length;

/* ---------- отправка сигналов через хаб ----------------------- */

const scheduleFlush = (delay = TIMING.flush) => {
  if (flushTimer || flushing || outbox.length === 0) return;
  flushTimer = setTimeout(flushSignals, delay);
};

const queueSignal = (to, kind, data) => {
  if (!store.isHub()) return false;
  outbox.push({ to, kind, data });
  scheduleFlush();
  return true;
};

const sendDirect = (peer, payload) => {
  if (peer.dc?.readyState !== 'open') return false;
  try {
    peer.dc.send(JSON.stringify(payload));
    return true;
  } catch {
    /* Канал закрылся между проверкой и отправкой. */
    return false;
  }
};

/* Сообщение не ушло ни через хаб, ни напрямую: отмечаем его в переписке,
   чтобы человек видел это, а не считал доставленным. */
const markUndelivered = (signal) => {
  if (signal.kind !== 'relay' || signal.data?.t !== 'chat') return;
  const own = (history.get(signal.to) ?? []).find((message) => message.id === signal.data.id);
  if (!own || own.via === 'failed') return;
  own.via = 'failed';
  emit({ type: 'transport', peerId: signal.to });
};

async function flushSignals() {
  flushTimer = null;
  if (flushing || outbox.length === 0) return;
  flushing = true;
  const epoch = signalEpoch;
  const batch = outbox.splice(0, 32);
  const retry = [];
  try {
    /* Хаб разбирает пачку построчно и перечисляет отклонённые записи. Такую
       запись повторять бессмысленно: помечаем её и не трогаем остальные. */
    const answer = await remote.apiSignal(batch);
    const refused = new Set((answer?.rejected ?? []).map((item) => item.index));
    batch.forEach((signal, index) => {
      if (refused.has(index)) markUndelivered(signal);
    });
  } catch (error) {
    /* Не теряем сообщения: сначала пробуем вторичный P2P, иначе повторяем
       пользовательские сообщения через хаб — ограниченное число раз. Устаревший
       SDP не повторяем. Отказ по существу (4xx, кроме 408 и 429) повтора не
       требует: сессия закрыта или запрос некорректен. */
    const refusedAsWhole =
      error?.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
    for (const signal of batch) {
      if (signal.kind !== 'relay' || signal.data?.t !== 'chat') continue;
      const peer = peers.get(signal.to);
      if (epoch === signalEpoch && peer && sendDirect(peer, signal.data)) {
        const ownMessage = (history.get(peer.id) ?? []).find((message) => message.id === signal.data.id);
        if (ownMessage && ownMessage.via !== 'direct') {
          ownMessage.via = 'direct';
          emit({ type: 'transport', peerId: peer.id });
        }
        continue;
      }
      signal.tries = (signal.tries ?? 0) + 1;
      if (epoch !== signalEpoch || refusedAsWhole || signal.tries >= MAX_SIGNAL_TRIES) markUndelivered(signal);
      else retry.push(signal);
    }
  } finally {
    flushing = false;
    if (epoch !== signalEpoch) {
      if (outbox.length) scheduleFlush();
      return;
    }
    if (retry.length) outbox.unshift(...retry);
    if (outbox.length) scheduleFlush(retry.length ? TIMING.retryBase : TIMING.flush);
  }
}

/* ---------- канал данных --------------------------------------- */

const sendRaw = (peer, payload) => {
  /* Чат идёт через хаб первым. Прямой канал — резерв на случай ошибки API. */
  if (!peer.manual && store.isHub() && payload?.t === 'chat') {
    queueSignal(peer.id, 'relay', payload);
    return 'relay';
  }
  if (sendDirect(peer, payload)) return 'direct';
  if (!peer.manual && store.isHub()) {
    queueSignal(peer.id, 'relay', payload);
    return 'relay';
  }
  return null;
};

const handlePayload = (peer, payload, via) => {
  if (!payload || typeof payload !== 'object') return;
  switch (payload.t) {
    case 'hello':
      peer.name = String(payload.name || '').slice(0, 32);
      emit({ type: 'name', peerId: peer.id });
      break;
    case 'ping':
      sendRaw(peer, { t: 'pong', n: payload.n, at: payload.at });
      break;
    case 'pong':
      peer.lastPong = now();
      if (typeof payload.at === 'number') peer.rtt = Math.max(0, now() - payload.at);
      emit({ type: 'rtt', peerId: peer.id });
      break;
    case 'chat': {
      const text = String(payload.text || '').slice(0, MESSAGE_LIMIT);
      if (!text) return;
      const id = String(payload.id || rid());
      if ((history.get(peer.id) ?? []).some((message) => message.id === id)) return;
      pushHistory(peer.id, {
        id,
        mine: false,
        text,
        at: payload.at || now(),
        via,
        read: false,
      });
      emit({ type: 'message', peerId: peer.id });
      break;
    }
    default:
      /* Чужие типы молча игнорируем: это задел на будущие сообщения игры. */
      break;
  }
};

const startPing = (peer) => {
  clearInterval(peer.pingTimer);
  peer.lastPong = now();
  peer.pingTimer = setInterval(() => {
    if (peer.dc?.readyState !== 'open') return;
    if (now() - peer.lastPong > TIMING.pongTimeout) {
      /* Канал формально открыт, но собеседник молчит — пересоздаём. */
      restart(peer);
      return;
    }
    peer.pingSeq += 1;
    sendRaw(peer, { t: 'ping', n: peer.pingSeq, at: now() });
  }, TIMING.ping);
};

const attachChannel = (peer, dc) => {
  peer.dc = dc;
  dc.binaryType = 'arraybuffer';
  dc.onopen = () => {
    peer.tries = 0;
    peer.rtt = null;
    peer.failReason = null;
    peer.directReady = true;
    setState(peer, !peer.manual && store.isHub() ? 'relay' : 'direct');
    emit({ type: 'status', peerId: peer.id });
    const me = store.getCurrentUser();
    sendRaw(peer, { t: 'hello', name: me?.name ?? '' });
    sendRaw(peer, { t: 'ping', n: ++peer.pingSeq, at: now() });
    startPing(peer);
  };
  dc.onmessage = (event) => {
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    handlePayload(peer, payload, 'direct');
  };
  dc.onclose = () => {
    if (peer.closing) return;
    peer.directReady = false;
    emit({ type: 'status', peerId: peer.id });
    /* Хаб остаётся основным маршрутом, даже если резервный P2P закрылся. */
    if (peer.state === 'direct') setState(peer, store.isHub() && !peer.manual ? 'relay' : 'offline');
    restart(peer);
  };
  dc.onerror = () => {
    /* onclose придёт следом и всё перезапустит. */
  };
};

/* ---------- соединение ----------------------------------------- */

const teardown = (peer, { silent = false } = {}) => {
  const wasDirectReady = peer.directReady;
  peer.closing = true;
  clearInterval(peer.pingTimer);
  clearTimeout(peer.guardTimer);
  peer.pingTimer = null;
  peer.guardTimer = null;
  try {
    peer.dc?.close();
  } catch {
    /* уже закрыт */
  }
  try {
    peer.pc?.close();
  } catch {
    /* уже закрыт */
  }
  peer.dc = null;
  peer.pc = null;
  peer.pending = [];
  peer.directReady = false;
  peer.closing = false;
  if (!silent) setState(peer, 'offline');
  else if (wasDirectReady) emit({ type: 'status', peerId: peer.id });
};

const scheduleRetry = (peer) => {
  peer.tries += 1;
  const wait = Math.min(TIMING.retryBase * 2 ** (peer.tries - 1), TIMING.retryMax);
  peer.retryAt = now() + wait;
};

function restart(peer) {
  if (peer.manual) {
    /* Ручное соединение заново само не поднимется: нужны новые коды. */
    teardown(peer);
    return;
  }
  if (peer.secondaryDisabled) {
    const keepHub = store.isHub();
    teardown(peer, { silent: keepHub });
    setState(peer, keepHub ? 'relay' : 'offline');
    return;
  }
  const keepHub = store.isHub() && peer.state !== 'offline';
  teardown(peer, { silent: keepHub });
  if (keepHub) setState(peer, 'relay');
  scheduleRetry(peer);
}

const createConnection = (peer) => {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 2 });
  peer.pc = pc;
  peer.startedAt = now();

  pc.onicecandidate = (event) => {
    if (!event.candidate || peer.manual) return;
    queueSignal(peer.id, 'ice', event.candidate.toJSON());
  };

  pc.onconnectionstatechange = () => {
    if (!peer.pc || peer.pc !== pc) return;
    if (pc.connectionState === 'failed') {
      /* У ручного соединения запасного пути нет: прежде чем разобрать
         канал, запоминаем причину — окно скажет, что делать дальше,
         вместо молчаливого «нет связи». */
      if (peer.manual) peer.failReason = 'nat';
      restart(peer);
    }
    if (pc.connectionState === 'disconnected' && peer.state === 'direct')
      setState(peer, store.isHub() && !peer.manual ? 'relay' : 'offline');
  };

  pc.ondatachannel = (event) => {
    if (event.channel.label === CHANNEL) attachChannel(peer, event.channel);
  };

  /* Страховка: прямой канал поднимается максимум handshake секунд.
     Через relayAfter включаем запасной путь, чтобы игрок не ждал.
     Для кодов таймера нет: человек может копировать код минуту. */
  clearTimeout(peer.guardTimer);
  if (peer.manual) return pc;
  peer.guardTimer = setTimeout(() => {
    if (peer.dc?.readyState === 'open') return;
    if (!peer.manual && store.isHub()) setState(peer, 'relay');
    peer.guardTimer = setTimeout(() => {
      if (peer.dc?.readyState !== 'open') restart(peer);
    }, TIMING.handshake - TIMING.relayAfter);
  }, TIMING.relayAfter);

  return pc;
};

const startCall = async (peer) => {
  if (peer.pc) return;
  setState(peer, peer.state === 'relay' ? 'relay' : 'connecting');
  const pc = createConnection(peer);
  attachChannel(peer, pc.createDataChannel(CHANNEL, { ordered: true }));
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    queueSignal(peer.id, 'offer', { sdp: pc.localDescription.sdp });
  } catch {
    restart(peer);
  }
};

const acceptOffer = async (peer, data) => {
  /* Новый offer от собеседника всегда главнее нашей текущей попытки:
     он мог перезапустить приложение, и старое соединение уже труп. */
  if (peer.pc) teardown(peer, { silent: peer.state !== 'offline' });
  setState(peer, peer.state === 'relay' ? 'relay' : 'connecting');
  const pc = createConnection(peer);
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
    for (const candidate of peer.pending.splice(0)) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    queueSignal(peer.id, 'answer', { sdp: pc.localDescription.sdp });
  } catch {
    restart(peer);
  }
};

const acceptAnswer = async (peer, data) => {
  if (!peer.pc || peer.pc.signalingState !== 'have-local-offer') return;
  try {
    await peer.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
    for (const candidate of peer.pending.splice(0)) {
      await peer.pc.addIceCandidate(candidate).catch(() => {});
    }
  } catch {
    restart(peer);
  }
};

const acceptIce = async (peer, data) => {
  if (!data) return;
  if (!peer.pc || !peer.pc.remoteDescription) {
    peer.pending.push(data);
    if (peer.pending.length > 64) peer.pending.shift();
    return;
  }
  await peer.pc.addIceCandidate(data).catch(() => {});
};

const handleSignal = async (message) => {
  const peer = peerRecord(message.from);
  switch (message.kind) {
    case 'offer':
      await acceptOffer(peer, message.data || {});
      break;
    case 'answer':
      await acceptAnswer(peer, message.data || {});
      break;
    case 'ice':
      await acceptIce(peer, message.data);
      break;
    case 'bye':
      teardown(peer);
      break;
    case 'relay':
      /* Запасной путь: собеседник не пробился напрямую. */
      if (peer.state === 'offline' || peer.state === 'connecting') setState(peer, 'relay');
      handlePayload(peer, message.data, 'relay');
      break;
    default:
      break;
  }
};

/* ---------- основной цикл --------------------------------------- */

/* Кто кому звонит, решает порядок идентификаторов: младший звонит,
   старший отвечает. Иначе оба создадут offer одновременно и соединение
   развалится на ровном месте. */
const iAmCaller = (friendId) => String(selfId) < String(friendId);

const maintain = () => {
  if (!running) return;
  /* Без хаба сводить некому: тогда работает только подключение по коду. */
  if (!store.isHub()) return;
  const me = store.getCurrentUser();
  if (!me) return;
  selfId = me.id;
  const friends = store.listFriends(me.id);
  const wanted = new Set();

  for (const friend of friends) {
    const online = store.presenceOf(friend) !== 'offline';
    if (!online) continue;
    wanted.add(friend.id);
    const peer = peerRecord(friend.id);
    peer.name = peer.name || friend.name;
    if (peer.secondaryDisabled) {
      if (peer.pc || peer.dc) teardown(peer, { silent: true });
      if (peer.state !== 'relay') setState(peer, 'relay');
      continue;
    }
    if (peer.state === 'offline') setState(peer, 'relay'); // хаб доступен сразу, P2P поднимается в фоне
    if (!supported()) continue; // сообщения всё равно идут через хаб, даже без WebRTC
    if (peer.pc || peer.dc?.readyState === 'open') continue;
    if (now() < peer.retryAt) continue;
    if (iAmCaller(friend.id)) startCall(peer);
    else if (peer.state !== 'relay') setState(peer, 'relay'); // ждём звонка через хаб
  }

  /* Ушедших в офлайн отпускаем: держать мёртвые соединения незачем. */
  for (const [peerId, peer] of peers) {
    if (peer.manual || wanted.has(peerId)) continue;
    if (peer.state !== 'offline' || peer.pc) teardown(peer);
    peer.tries = 0;
    peer.retryAt = 0;
  }
};

/* Входящий цикл. Каждый запуск модуля получает свой номер поколения: цикл
   прошлого запуска, ещё висящий на длинном опросе, сам выходит, а не
   работает рядом с новым. */
let inboxGen = 0;

const runInbox = async (gen) => {
  while (running && gen === inboxGen) {
    if (!store.isHub() || !store.getCurrentUser()) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    /* Ответ длинного опроса относится к тому аккаунту, чей токен ушёл в запросе.
       Если за время ожидания вошли в другой аккаунт или модуль остановили,
       чужие сообщения здесь не показываем. */
    const owner = store.getCurrentUser()?.id;
    try {
      const { messages: incoming = [], self } = await remote.apiInbox({ wait: true });
      if (gen !== inboxGen) return;
      if (!running || store.getCurrentUser()?.id !== owner) continue;
      if (self) selfId = self;
      for (const message of incoming) {
        if (gen !== inboxGen || !running) return;
        await handleSignal(message);
      }
    } catch (error) {
      if (gen !== inboxGen) return;
      /* Таймаут длинного опроса — это норма, остальное гасим паузой. */
      await new Promise((r) => setTimeout(r, error?.status === 401 ? 5000 : 1200));
    }
  }
};

/** Включить прямую связь. Безопасно вызывать повторно. */
export const start = () => {
  if (running) return;
  running = true;
  maintain();
  tickTimer = setInterval(maintain, TIMING.tick);
  inboxGen += 1;
  inboxLoop = runInbox(inboxGen);
  emit();
};

/** Выключить все каналы и очистить очередь текущей сессии. */
export const stop = () => {
  running = false;
  inboxGen += 1;
  /* Не переносим неотправленные сообщения в следующую сессию/к другому аккаунту. */
  signalEpoch += 1;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  outbox = [];
  clearInterval(tickTimer);
  tickTimer = null;
  inboxLoop = null;
  for (const peer of peers.values()) teardown(peer);
  peers.clear();
  history.clear();
  emit();
};

/** Перезапустить вторичный P2P-канал, не затрагивая основной хаб. */
export const reconnect = (peerId) => {
  const peer = peerRecord(peerId);
  if (peer.manual) return;
  peer.secondaryDisabled = false;
  teardown(peer, { silent: store.isHub() });
  peer.tries = 0;
  peer.retryAt = 0;
  if (store.isHub()) setState(peer, 'relay');
  maintain();
};

/** Отключить только P2P-резерв. Основной обмен через хаб продолжает работать. */
export const disconnect = (peerId) => {
  const peer = peers.get(peerId);
  if (!peer) return;
  if (!peer.manual && store.isHub()) {
    peer.secondaryDisabled = true;
    teardown(peer, { silent: true });
    peer.retryAt = 0;
    setState(peer, 'relay');
    return;
  }
  teardown(peer);
  peer.retryAt = now() + TIMING.retryMax;
};

/** Отправить текст. Возвращает путь доставки: 'direct' | 'relay' | null. */
export const send = (peerId, text) => {
  const clean = String(text || '').trim().slice(0, MESSAGE_LIMIT);
  if (!clean) return null;
  const peer = peerRecord(peerId);
  const id = rid();
  const via = sendRaw(peer, { t: 'chat', id, text: clean, at: now() });
  if (!via) return null;
  pushHistory(peerId, { id, mine: true, text: clean, at: now(), via, read: true });
  emit({ type: 'message', peerId });
  return via;
};

/* ===========================================================
   Прямое подключение по коду — вообще без сервера.
   Код это сжатый SDP в base64: один создаёт «код приглашения»,
   второй отвечает «кодом ответа». Так связываются даже два
   mir.html с флешки, лишь бы устройства видели друг друга по сети.
   =========================================================== */

const toBase64 = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, '');
};

const fromBase64 = (text) => {
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
};

const deflate = async (text) => {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream !== 'function') return { packed: false, bytes };
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buf = await new Response(stream).arrayBuffer();
    return { packed: true, bytes: new Uint8Array(buf) };
  } catch {
    return { packed: false, bytes };
  }
};

const inflate = async (bytes, packed) => {
  if (!packed) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
};

const encodeCode = async (payload) => {
  const { packed, bytes } = await deflate(JSON.stringify(payload));
  return `MIR${packed ? 1 : 0}.${toBase64(bytes)}`;
};

const decodeCode = async (code) => {
  const clean = String(code || '').trim().replace(/\s+/g, '');
  const match = /^MIR([01])\.(.+)$/.exec(clean);
  if (!match) throw new Error('Это не код прямого подключения.');
  const text = await inflate(fromBase64(match[2]), match[1] === '1').catch(() => {
    throw new Error('Код повреждён — попросите прислать его заново.');
  });
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Код повреждён — попросите прислать его заново.');
  }
  if (!parsed?.sdp || !parsed?.t) throw new Error('Код повреждён — попросите прислать его заново.');
  return parsed;
};

/* Коды без хаба нельзя досылать по частям, поэтому ждём, пока
   браузер соберёт всех ICE-кандидатов, и только потом отдаём SDP. */
const gathered = (pc) =>
  new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = setTimeout(done, TIMING.manualGather);
    pc.addEventListener('icegatheringstatechange', check);
  });

const manualPeer = () => {
  const peer = peerRecord(MANUAL_ID);
  peer.manual = true;
  return peer;
};

/* Разбор того, что вошло в код после сбора ICE. Через интернет без
   srflx-кандидата (своего внешнего адреса от STUN) соединение почти
   никогда не поднимается — по этому отчёту окно честно подсказывает,
   что код годится разве что внутри одной Wi-Fi сети. */
const candidatesOf = (sdp) => {
  const text = String(sdp || '');
  const total = text.match(/a=candidate:/g)?.length ?? 0;
  const count = (type) => text.match(new RegExp(` typ ${type}(?=\\s|$)`, 'g'))?.length ?? 0;
  return { total, host: count('host'), srflx: count('srflx') };
};

/** Шаг 1 у приглашающего: создать код и отдать его другу. */
export const createInviteCode = async () => {
  if (!supported()) throw new Error('Браузер не поддерживает прямые соединения.');
  const peer = manualPeer();
  teardown(peer, { silent: true });
  peer.failReason = null;
  setState(peer, 'connecting');
  const pc = createConnection(peer);
  attachChannel(peer, pc.createDataChannel(CHANNEL, { ordered: true }));
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  peer.gather = candidatesOf(pc.localDescription?.sdp);
  return encodeCode({
    v: 1,
    t: 'offer',
    name: store.getCurrentUser()?.name ?? '',
    sdp: pc.localDescription.sdp,
  });
};

/** Шаг 2 у приглашённого: принять код и вернуть ответный. */
export const acceptInviteCode = async (code) => {
  if (!supported()) throw new Error('Браузер не поддерживает прямые соединения.');
  const parsed = await decodeCode(code);
  if (parsed.t !== 'offer')
    throw new Error('Это ответный код. Его вставляет тот, кто создавал приглашение.');
  const peer = manualPeer();
  teardown(peer, { silent: true });
  peer.failReason = null;
  peer.name = String(parsed.name || '').slice(0, 32);
  setState(peer, 'connecting');
  const pc = createConnection(peer);
  await pc.setRemoteDescription({ type: 'offer', sdp: parsed.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  peer.gather = candidatesOf(pc.localDescription?.sdp);
  return encodeCode({
    v: 1,
    t: 'answer',
    name: store.getCurrentUser()?.name ?? '',
    sdp: pc.localDescription.sdp,
  });
};

/** Шаг 3 у приглашающего: вставить ответный код — и связь есть. */
export const completeInvite = async (code) => {
  const parsed = await decodeCode(code);
  if (parsed.t !== 'answer')
    throw new Error('Это код приглашения, а нужен ответный — тот, что вернул друг.');
  const peer = manualPeer();
  if (!peer.pc || peer.pc.signalingState !== 'have-local-offer')
    throw new Error('Срок кода вышел. Создайте новый код приглашения.');
  peer.name = String(parsed.name || '').slice(0, 32) || peer.name;
  await peer.pc.setRemoteDescription({ type: 'answer', sdp: parsed.sdp });
};

/** Закрыть прямое подключение по коду. */
export const dropManual = () => {
  const peer = peers.get(MANUAL_ID);
  if (!peer) return;
  teardown(peer);
  history.delete(MANUAL_ID);
  emit();
};
