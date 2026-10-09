/* ===========================================================
   Синхронизация карты лобби с редактором Azgaar.

   Роли:
   • мастер — публикует карту: после правок в режиме редактирования,
     при выходе из режима, после новой генерации и по запросу хаба
     (игрок зашёл раньше, чем карта была отправлена);
   • игрок — только принимает. Карта мастера приходит кадром и
     загружается тем же механизмом, что и файл карты (uploadMap).

   Кадр (см. server/hub-lobby.mjs): 4 байта длины заголовка (BE),
   JSON-заголовок, затем карта .map в gzip. Хаб лишь пересылает кадр.

   Что решает, кому что делать, при входе в карту:
   • карта на хабе есть и она не новая → ждём её и грузим (правки мастера
     сохраняются у тех, кто зашёл позже);
   • карты нет, или мастер создаёт новый мир → мастер публикует свою.

   Ограничения, которые важно знать:
   • правки в обычном режиме (панорамирование, масштаб) карту не шлют:
     Azgaar не даёт единой точки «карта изменилась», поэтому мастер
     публикует после действий в режиме редактирования;
   • конец загрузки Azgaar не сообщает — ждём тишины в DOM карты.
   =========================================================== */

import { lobbyState, onLobbyEvent, sendLobbyMap, sendLobbyProgress, watchLobbyMap } from '../data/lobby.js';
import { attachGenerationStage, hideEditorStage, showEditorStage } from './generation-stage.js';

const FRAME_VERSION = 1;
const EDIT_DEBOUNCE_MS = 700;
const QUIET_MS = 400;
const QUIET_MAX_MS = 15_000;
const WATCH_INTERVAL_MS = 2_000;
/* Настоящая карта — мегабайты текста. Короче — редактор ещё не собрал карту
   (или сообщил пустоту): такой текст не рассылаем, иначе игроки загрузят
   обрезок. Следующая правка или генерация пришлёт полную карту. */
const MIN_MAP_TEXT = 100_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const gzip = async (text) =>
  new Uint8Array(
    await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(),
  );

const gunzip = (bytes) =>
  new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();

/** Собирает кадр карты: длина заголовка, заголовок, gzip-карта. */
const encodeFrame = async (text, header) => {
  const headerBytes = encoder.encode(JSON.stringify(header));
  const payload = await gzip(text);
  const frame = new Uint8Array(4 + headerBytes.length + payload.length);
  new DataView(frame.buffer).setUint32(0, headerBytes.length);
  frame.set(headerBytes, 4);
  frame.set(payload, 4 + headerBytes.length);
  return frame;
};

/** Разбирает кадр. Возвращает null, если кадр не похож на карту. */
const decodeFrame = (bytes) => {
  if (bytes.byteLength < 6) return null;
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (headerLength === 0 || 4 + headerLength > bytes.byteLength) return null;
  try {
    const header = JSON.parse(decoder.decode(bytes.subarray(4, 4 + headerLength)));
    return { header, payload: bytes.subarray(4 + headerLength) };
  } catch {
    return null;
  }
};

const digestOf = async (bytes) => {
  const hash = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
};

/* Ждём, пока карта перестанет меняться: Azgaar не сообщает, что разбор
   загруженного файла закончен. */
const waitQuiet = (win) =>
  new Promise((resolve) => {
    const map = win.document.getElementById('map');
    if (!map) {
      resolve();
      return;
    }
    let quietTimer = 0;
    const finish = () => {
      observer.disconnect();
      clearTimeout(quietTimer);
      clearTimeout(cap);
      resolve();
    };
    const arm = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, QUIET_MS);
    };
    const observer = new win.MutationObserver(arm);
    observer.observe(map, { subtree: true, childList: true, attributes: true, characterData: true });
    const cap = setTimeout(finish, QUIET_MAX_MS);
    arm();
  });

/**
 * Подключает синхронизацию к iframe карты лобби.
 * @returns {() => void} остановка
 */
export const startLobbySync = (frame, { lobbyId, role, fresh = false }) => {
  const isMaster = role === 'master';
  let active = true;
  let win = null;
  let ready = false;
  let watched = null; // { hasMap } — ответ хаба на watch
  let initialDone = false;
  let decided = false;
  let busy = false; // идёт генерация
  let applying = false;
  let publishing = false;
  let pendingPublish = false;
  let forcePending = false;
  let dirty = false; // отправить не удалось, ждём переподключения
  let lastText = '';
  let appliedDigest = '';
  let pendingFrame = null;
  let editTimer = 0;
  let watchTimer = 0;
  let detachGeneration = () => {};
  let detachDom = () => {};
  let unsubscribe = () => {};

  const stop = () => {
    if (!active) return;
    active = false;
    clearTimeout(editTimer);
    clearInterval(watchTimer);
    detachGeneration();
    detachDom();
    unsubscribe();
    hideEditorStage(frame);
  };

  const currentParams = () => {
    const map = win?.options?.map;
    return {
      seed: String(map?.seed ?? ''),
      width: Number(map?.graph?.width) || 0,
      height: Number(map?.graph?.height) || 0,
    };
  };

  /* ---------- мастер: публикация ---------------------------- */

  const publish = async ({ force = false } = {}) => {
    if (!active || !isMaster) return;
    if (force) forcePending = true;
    if (!ready || busy || applying || publishing) {
      pendingPublish = true;
      return;
    }
    publishing = true;
    try {
      const sendEvenIfSame = forcePending;
      forcePending = false;
      const text = await win.Services.Save.prepareMapData();
      if (typeof text !== 'string' || text.length < MIN_MAP_TEXT) return;
      if (!sendEvenIfSame && text === lastText) return;
      const params = currentParams();
      const bytes = await encodeFrame(text, {
        t: 'map',
        v: FRAME_VERSION,
        lobbyId,
        seed: params.seed,
        width: lobbyState().lobby?.width ?? params.width,
        height: lobbyState().lobby?.height ?? params.height,
        enc: 'gzip',
      });
      if (!sendLobbyMap(bytes)) {
        dirty = true;
        return;
      }
      lastText = text;
      dirty = false;
    } catch {
      dirty = true;
    } finally {
      publishing = false;
      if (pendingPublish && active) {
        pendingPublish = false;
        publish();
      }
    }
  };

  const scheduleEdit = () => {
    clearTimeout(editTimer);
    editTimer = setTimeout(() => publish(), EDIT_DEBOUNCE_MS);
  };

  /* ---------- игрок и мастер: приём карты ------------------- */

  const tryApply = async () => {
    if (!active || !ready || !initialDone || busy || applying || !pendingFrame) return;
    const bytes = pendingFrame;
    pendingFrame = null;
    applying = true;
    showEditorStage(frame, 'Загрузка карты мастера');
    try {
      const parsed = decodeFrame(bytes);
      if (!parsed || parsed.header.lobbyId !== lobbyId) return;
      const digest = await digestOf(parsed.payload);
      if (digest === appliedDigest) return;
      const text = await gunzip(parsed.payload);
      const file = new win.Blob([text], { type: 'text/plain' });
      await new Promise((resolve) => win.Services.Load.uploadMap(file, resolve));
      await waitQuiet(win);
      appliedDigest = digest;
      if (isMaster) lastText = text;
    } catch {
      /* битый кадр: держим текущую карту, следующий кадр всё поправит */
    } finally {
      applying = false;
      hideEditorStage(frame);
      if (pendingFrame) tryApply();
    }
  };

  /* Решение о начальной карте: см. шапку модуля. */
  const decide = () => {
    if (!active || !ready || !initialDone || decided || !watched) return;
    decided = true;
    if (!fresh && watched.hasMap) return; // ждём карту из хаба
    if (isMaster) publish({ force: true });
  };

  /* ---------- события генерации ----------------------------- */

  const onGeneration = (event) => {
    if (!active) return;
    if (event.type === 'start') {
      busy = true;
      return;
    }
    if (event.type === 'step') {
      busy = true;
      if (isMaster) sendLobbyProgress({ step: event.id, name: event.label, index: event.index + 1, total: event.total });
      return;
    }
    if (event.type === 'error') {
      busy = false;
      return;
    }
    if (event.type === 'done') {
      busy = false;
      if (!initialDone) {
        initialDone = true;
        decide();
      } else if (isMaster) {
        publish();
      }
      tryApply();
    }
  };

  /* ---------- события лобби ---------------------------------- */

  const onLobby = (event) => {
    if (!active) return;
    switch (event.type) {
      case 'map':
        pendingFrame = event.bytes;
        tryApply();
        return;
      case 'watched':
        if (event.lobbyId !== lobbyId) return;
        watched = { hasMap: !!event.hasMap };
        decide();
        tryApply();
        return;
      case 'need-map':
        if (event.lobbyId !== lobbyId || !isMaster) return;
        publish({ force: true });
        return;
      case 'resume':
        watchLobbyMap();
        if (isMaster && dirty) publish({ force: true });
        return;
      case 'closed':
      case 'left':
        if (event.lobbyId === undefined || event.lobbyId === lobbyId) stop();
        return;
      default:
        return;
    }
  };

  /* ---------- подключение к окну редактора ------------------- */

  const attachEditorListeners = () => {
    const doc = win.document;
    const onPointerUp = () => {
      /* В режиме редактирования правка — это отпускание кнопки. В обычном
         режиме панорамирование карту не меняет, поэтому не публикуем. */
      if (win.customization) scheduleEdit();
    };
    const onChange = () => scheduleEdit();
    const onClick = (event) => {
      if (event.target?.closest?.('#exitCustomization, #dialogs, .ui-dialog')) scheduleEdit();
    };
    doc.addEventListener('pointerup', onPointerUp, true);
    doc.addEventListener('change', onChange, true);
    doc.addEventListener('click', onClick, true);
    detachDom = () => {
      doc.removeEventListener('pointerup', onPointerUp, true);
      doc.removeEventListener('change', onChange, true);
      doc.removeEventListener('click', onClick, true);
    };
  };

  const waitForEditor = async () => {
    const started = Date.now();
    while (active && Date.now() - started < 120_000) {
      if (!frame.isConnected) return null;
      const w = frame.contentWindow;
      if (w?.Services?.Save && w.Services.Load && w.options?.map && w.document?.getElementById('map')) return w;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };

  detachGeneration = attachGenerationStage(frame, { onEvent: onGeneration });
  unsubscribe = onLobbyEvent(onLobby);
  watchTimer = setInterval(() => {
    if (!frame.isConnected) stop();
  }, WATCH_INTERVAL_MS);

  waitForEditor().then((w) => {
    if (!w || !active) return;
    win = w;
    ready = true;
    if (isMaster) {
      attachEditorListeners();
      if (pendingPublish) {
        pendingPublish = false;
        publish();
      }
    }
    watchLobbyMap();
    decide();
    tryApply();
  });

  return stop;
};
