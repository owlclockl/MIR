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
   • конец загрузки Azgaar не сообщает. Признак начала — замена элемента
     #map, признак конца — тишина в DOM после неё (см. watchMapLoad);
   • отпечаток кадра считаем без crypto.subtle: он есть только в
     защищённом контексте, а хаб на адресе локальной сети открыт по http.
   =========================================================== */

import { lobbyState, onLobbyEvent, reportLobbyError, sendLobbyMap, sendLobbyProgress, watchLobbyMap } from '../data/lobby.js';
import { attachGenerationStage, hideEditorStage, showEditorStage } from './generation-stage.js';

const FRAME_VERSION = 1;
const EDIT_DEBOUNCE_MS = 700;
/* Тишину ждём уже после замены карты: асинхронные шаги Azgaar DOM не
   меняют, но занимают время, поэтому запас побольше, чем в кадрах. */
const QUIET_MS = 500;
const QUIET_MAX_MS = 30_000;
/* Замену #map ждём долго: разбор большой карты на слабом телефоне может
   занять секунды, и раньше времени снимать «занято» нельзя. */
const LOAD_START_MS = 30_000;
const WATCH_INTERVAL_MS = 2_000;
const PUBLISH_RETRY_MS = 1_000;
const PUBLISH_RETRIES = 10;
/* Настоящая карта — мегабайты текста. Короче — редактор ещё не собрал карту
   (или сообщил пустоту): такой текст не рассылаем, иначе игроки загрузят
   обрезок. Следующая правка или генерация пришлёт полную карту. */
const MIN_MAP_TEXT = 100_000;

const NO_COMPRESSION_MESSAGE =
  'Этот браузер не поддерживает сжатие, поэтому карта лобби недоступна. Откройте игру в современном браузере.';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/* Сжатие — потоками браузера. Старые WebView (APK на древних телефонах)
   их не знают: тогда карта не уйдёт, и человек должен это видеть. */
const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

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

/* Отпечаток кадра: «эту карту мы уже применили». Два независимых 32-битных
   хеша (схема cyrb53) дают 64 бита — для двух подряд идущих кадров этого
   с запасом, а считается синхронно и без crypto.subtle. */
const fingerprint = (bytes) => {
  let h1 = 0xdeadbeef ^ bytes.length;
  let h2 = 0x41c6ce57 ^ bytes.length;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    h1 = Math.imul(h1 ^ b, 2654435761);
    h2 = Math.imul(h2 ^ b, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}${bytes.length.toString(16)}`;
};

/* Ждём окончания загрузки файла в редакторе. Наблюдателя создаём ДО вызова
   uploadMap: замену #map можно пропустить, если начать смотреть позже.
   Возвращает промис, который выполнится, когда карта применена (или когда
   стало ясно, что файл не принят — тогда Azgaar показывает своё окно). */
const watchMapLoad = (win, previousMap) => {
  const doc = win.document;
  let replaced = false;
  let quietTimer = 0;
  let startTimer = 0;
  let capTimer = 0;
  let resolveDone = () => {};
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const finish = () => {
    observer.disconnect();
    clearTimeout(quietTimer);
    clearTimeout(startTimer);
    clearTimeout(capTimer);
    resolveDone();
  };
  const arm = () => {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(finish, QUIET_MS);
  };
  const observer = new win.MutationObserver(() => {
    if (!replaced) {
      const current = doc.getElementById('map');
      if (!current || current === previousMap) return;
      replaced = true;
      clearTimeout(startTimer);
      capTimer = setTimeout(finish, QUIET_MAX_MS);
    }
    arm();
  });
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
  startTimer = setTimeout(finish, LOAD_START_MS);
  return done;
};

/**
 * Подключает синхронизацию к iframe карты лобби.
 * @returns {() => void} остановка
 */
export const startLobbySync = (frame, { lobbyId, role, fresh = false }) => {
  if (!canCompress()) {
    reportLobbyError(NO_COMPRESSION_MESSAGE);
    return () => {};
  }
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
  let retries = 0;
  let dirty = false; // отправить не удалось, ждём переподключения
  let lastText = '';
  let appliedPrint = '';
  let pendingFrame = null;
  let editTimer = 0;
  let retryTimer = 0;
  let watchTimer = 0;
  let detachGeneration = () => {};
  let detachDom = () => {};
  let unsubscribe = () => {};

  const stop = () => {
    if (!active) return;
    active = false;
    clearTimeout(editTimer);
    clearTimeout(retryTimer);
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

  const scheduleRetry = () => {
    if (!active || retries >= PUBLISH_RETRIES) return;
    retries += 1;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => publish({ force: true }), PUBLISH_RETRY_MS);
  };

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
      if (typeof text !== 'string' || text.length < MIN_MAP_TEXT) {
        /* Редактор ещё не собрал карту. Принудительную отправку не теряем —
           повторим через секунду, пока карта не станет настоящей. */
        if (sendEvenIfSame) {
          forcePending = true;
          scheduleRetry();
        }
        return;
      }
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
      retries = 0;
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
      const print = fingerprint(parsed.payload);
      if (print === appliedPrint) return;
      const text = await gunzip(parsed.payload);
      const file = new win.Blob([text], { type: 'text/plain' });
      /* Наблюдатель — до uploadMap, см. watchMapLoad. */
      const loaded = watchMapLoad(win, win.document.getElementById('map'));
      await new Promise((resolve) => win.Services.Load.uploadMap(file, resolve));
      await loaded;
      appliedPrint = print;
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
        /* Мастер новой карты уже знает, какой мир ведёт: старый кадр из хаба
           здесь не нужен и перетёр бы его. */
        if (fresh && isMaster) return;
        pendingFrame = event.bytes;
        tryApply();
        return;
      case 'watched': {
        if (event.lobbyId !== lobbyId) return;
        const wasDecided = decided;
        watched = { hasMap: !!event.hasMap };
        decide();
        /* Мастер, который уже решил, видит, что карты в хабе нет (например,
           хаб перезапустился): публикует свою, иначе игроки ждут её вечно. */
        if (isMaster && wasDecided && !event.hasMap) publish({ force: true });
        tryApply();
        return;
      }
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
