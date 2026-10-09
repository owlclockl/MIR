/* ===========================================================
   Синхронизация карты лобби с редактором Azgaar — без перезагрузок.

   Роли:
   • мастер — публикует карту и ведёт живой предпросмотр правок;
   • игрок — принимает. Полная карта применяется в фоне, правки
     мастера во время правки видны через живой снимок поверх карты.

   Два кадра (см. server/hub-lobby.mjs и game/map-frame.js):

   • «map» — полная карта .map: [u32 длина заголовка][JSON][gzip .map].
     Мастер шлёт её после генерации и один раз в конце сеанса правок.
     Игрок применяет её тем же механизмом, что и файл карты (uploadMap).
     Разбор большой карты занимает секунды, поэтому поток таких кадров
     во время правок и выглядел у игроков как перезагрузки;

   • «live» — живой снимок отрисованной карты (сериализованный SVG
     элемента #map): тот же конверт, внутри снимок. Мастер шлёт его,
     пока длится правка, не чаще раза в несколько сотен миллисекунд,
     игрок показывает снимок поверх своей карты — правки видны почти
     сразу, без накладок и перезагрузок. Когда полная карта доходит,
     снимок гаснет: настоящий редактор уже показывает то же самое.

   Порядок публикации полных карт: генерация → сразу; правки в режиме
   редактирования → только снимки; вышли из режима → одна полная карта.
   Правки в обычном режиме (диалоги городов и подписей) → прежний путь
   с задержкой. Несохранённые правки при закрытии редактора теряются,
   как и в самом Azgaar — снимки это только картинка, а не данные.

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
   • снимок предпросмотра — картинка состояния, а не данные: инструменты
     редактора у игрока работают только после полной карты. Это честно:
     менять карту игроку и не положено;
   • отпечаток кадра считаем без crypto.subtle: он есть только в
     защищённом контексте, а хаб на адресе локальной сети открыт по http.
   =========================================================== */

import {
  lobbyState,
  onLobbyEvent,
  reportLobbyError,
  sendLobbyLive,
  sendLobbyMap,
  sendLobbyProgress,
  setLobbyApplying,
  setLobbyDelivered,
  setLobbyLive,
  watchLobbyMap,
} from '../data/lobby.js';
import { attachGenerationStage, hideEditorStage, showEditorStage } from './generation-stage.js';
import { FRAME_VERSION, canCompress, decodeFrame, encodeFrame, fingerprint, gunzip } from './map-frame.js';

const EDIT_DEBOUNCE_MS = 700;
/* Повторная публикация той же карты раньше этого срока не нужна: состояние
   не менялось, а разбор стоит секунды. */
const PUBLISH_COOLDOWN_MS = 1_500;
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

/* ---------- живой предпросмотр ----------------------------- */

/* Снимок уходит не чаще этого интервала: захват и сжатие большого SVG
   стоят работы, а правкам достаточно задержки в доли секунды. */
const LIVE_MIN_INTERVAL_MS = 600;
/* Если захват или сжатие идут тяжело (слабый телефон, плотная карта),
   интервал растёт: правки мастера не должны подтормаживать его редактор. */
const LIVE_SLOW_INTERVAL_MS = 1_600;
/* Тик сеанса правок: смотрим, длится ли правка, и пора ли снять кадр. */
const LIVE_TICK_MS = 250;
/* Снимок, у которого нет продолжения столько времени, считается остывшим:
   предпросмотр плавно прячем, под ним уже та же карта. */
const LIVE_STALE_MS = 4_000;
/* Снимок заметно больше этого — не шлём: канал важнее одной картинки,
   следующая правка уйдёт нормальным кадром. */
const LIVE_MAX_BYTES = 5 * 1024 * 1024;
/* Префикс идентификаторов снимка: он попадает в чужой документ, и
   дублирующиеся id (#map, #viewbox, градиенты) ломали бы ссылки. */
export const LIVE_ID_PREFIX = 'mrl-';
/* Предел чистки снимка: у настоящей карты элементов десятки тысяч,
   потолок нужен, чтобы чужой кадр не повесил страницу. */
const LIVE_MAX_NODES = 400_000;

const NO_COMPRESSION_MESSAGE =
  'Этот браузер не поддерживает сжатие, поэтому карта лобби недоступна. Откройте игру в современном браузере.';

const svgEncoder = new TextEncoder();

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

/* ---------- снимок: подготовка ------------------------------ */

/** Префиксует id и ссылки на них: url(#id), href="#id". Снимок попадает
    в чужой документ — дубль id ломал бы ссылки у обоих. */
export const prefixSnapshotIds = (text) =>
  text
    .replace(/id="/g, `id="${LIVE_ID_PREFIX}`)
    .replace(/url\(#/g, `url(#${LIVE_ID_PREFIX}`)
    .replace(/((?:xlink:)?href)="#/g, `$1="#${LIVE_ID_PREFIX}`);

/** Текст снимка отрисованной карты и размер окна редактора. */
export const captureSnapshot = (win) => {
  const map = win.document.getElementById('map');
  if (!map) return null;
  const clone = map.cloneNode(true);
  /* Снимок должен быть непрозрачным: под ним не должна просвечивать
     карта игрока. Ширина и высота задаются при показе, вид — при показе. */
  clone.removeAttribute('style');
  return {
    vw: win.innerWidth || Number(win.options?.map?.graph?.width) || 0,
    vh: win.innerHeight || Number(win.options?.map?.graph?.height) || 0,
    text: prefixSnapshotIds(new win.XMLSerializer().serializeToString(clone)),
  };
};

/* ---------- снимок: приём ----------------------------------- */

/* Снимок — данные от другого игрока, и мы вставляем их в свой документ.
   Разрешаем только то, из чего состоит отрисованная карта: фигуры,
   стили, градиенты. Скрипты, обработчики и внешние ссылки выкидываем:
   аккаунт мастера может быть взломан, а снимок идёт прямо в наш документ. */
export const sanitizeSnapshot = (svg, win) => {
  let count = 0;
  const walk = (node) => {
    if (count++ > LIVE_MAX_NODES) return false;
    for (const child of [...node.children]) {
      const tag = child.nodeName.toLowerCase();
      if (tag === 'script' || tag === 'foreignobject' || tag === 'iframe' || tag === 'audio' || tag === 'video') {
        child.remove();
        continue;
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        const value = String(attr.value).trim();
        if (name.startsWith('on')) child.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'xlink:href') && /^javascript:/i.test(value)) child.removeAttribute(attr.name);
      }
      if (!walk(child)) return false;
    }
    return true;
  };
  if (!walk(svg)) return null;
  /* xmlns обязателен: снимок уходит в чужой документ как самостоятельный SVG. */
  if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new win.XMLSerializer().serializeToString(svg);
};

/**
 * Накладка живого предпросмотра над окном карты. Два слоя: новый снимок
 * готовится под верхним и проявляется поверх предыдущего, поэтому правки
 * не мигают. Накладка прозрачна для мыши — панель и кнопки доступны.
 */
const createLiveView = (frame) => {
  const host = frame.parentElement;
  if (!host) return null;
  let view = host.querySelector(':scope > .world-live');
  if (view) return view;
  view = document.createElement('div');
  view.className = 'world-live';
  view.setAttribute('aria-hidden', 'true');
  view.innerHTML = `
    <div class="world-live__layer" data-role="live-under"></div>
    <div class="world-live__layer world-live__layer--top" data-role="live-over"></div>
    <span class="world-live__badge"><i aria-hidden="true"></i>МАСТЕР ВНОСИТ ПРАВКИ</span>`;
  host.append(view);
  return view;
};

const destroyLiveView = (frame) => {
  frame.parentElement?.querySelector(':scope > .world-live')?.remove();
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
  let appliedAny = false; // полная карта уже применялась в этом документе
  let pendingFrame = null;
  let editTimer = 0;
  let retryTimer = 0;
  let watchTimer = 0;
  /* Живой снимок у мастера: таймер сеанса правок, отпечаток последнего
     кадра и интервал — растёт, если захват идёт тяжело. */
  let liveTimer = 0;
  let liveBusy = false;
  let liveEditing = false; // мастер сейчас в режиме редактирования
  let lastLivePrint = '';
  let liveInterval = LIVE_MIN_INTERVAL_MS;
  let liveLastSentAt = 0;
  let lastPublishDoneAt = 0;
  /* Живой снимок у игрока: кадр, ждущий показа; таймер остывания; флаг
     «накладка сейчас видна». */
  let pendingLive = null;
  let liveDecayTimer = 0;
  let liveShowing = false;
  let detachGeneration = () => {};
  let detachDom = () => {};
  let unsubscribe = () => {};

  const stop = () => {
    if (!active) return;
    active = false;
    clearTimeout(editTimer);
    clearTimeout(retryTimer);
    clearInterval(watchTimer);
    clearInterval(liveTimer);
    clearTimeout(liveDecayTimer);
    detachGeneration();
    detachDom();
    unsubscribe();
    setLobbyLive(false);
    setLobbyApplying(false);
    hideEditorStage(frame);
    destroyLiveView(frame);
  };

  const currentParams = () => {
    const map = win?.options?.map;
    return {
      seed: String(map?.seed ?? ''),
      width: Number(map?.graph?.width) || 0,
      height: Number(map?.graph?.height) || 0,
    };
  };

  /* ---------- мастер: публикация полной карты ---------------- */

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
    /* Повторный вызов сразу после удачной отправки — то же состояние карты,
       а разбор её на мастере стоит секунды: не гоняем дважды. */
    if (!forcePending && !dirty && Date.now() - lastPublishDoneAt < PUBLISH_COOLDOWN_MS) return;
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
      lastPublishDoneAt = Date.now();
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
  /* ---------- мастер: живой снимок --------------------------- */

  const sendLiveSnapshot = async () => {
    if (!active || !isMaster || !ready || busy || applying || publishing || liveBusy) return;
    liveBusy = true;
    const startedAt = Date.now();
    try {
      const shot = captureSnapshot(win);
      if (!shot || shot.vw < 1 || shot.vh < 1) return;
      const print = fingerprint(svgEncoder.encode(shot.text));
      if (print === lastLivePrint) return;
      const bytes = await encodeFrame(shot.text, {
        t: 'live',
        v: FRAME_VERSION,
        lobbyId,
        vw: shot.vw,
        vh: shot.vh,
        enc: 'gzip',
      });
      if (bytes.byteLength > LIVE_MAX_BYTES) return;
      if (sendLobbyLive(bytes)) {
        lastLivePrint = print;
        liveLastSentAt = Date.now();
      }
    } catch {
      /* снимок не собрался — не страшно: следующий тик попробует снова */
    } finally {
      liveBusy = false;
      /* Тяжёлый снимок — увеличиваем интервал, лёгкий — возвращаем обычный. */
      liveInterval = Date.now() - startedAt > 220 ? LIVE_SLOW_INTERVAL_MS : LIVE_MIN_INTERVAL_MS;
    }
  };

  /* Тик сеанса правок: пока мастер в режиме редактирования, карта меняется —
     идут только лёгкие снимки, полная карта копилась бы зря. Правка закончилась
     (вышли из режима) — один раз уходит полная карта: данные догоняют картинку. */
  const liveTick = () => {
    if (!active || !isMaster || !ready || busy) return;
    const editing = !!win?.customization;
    setLobbyLive(editing);
    if (!editing) {
      if (liveEditing) {
        liveEditing = false;
        publish();
      }
      return;
    }
    liveEditing = true;
    if (Date.now() - liveLastSentAt >= liveInterval) sendLiveSnapshot();
  };

  /* ---------- игрок: показ снимка ---------------------------- */

  const hideLiveView = () => {
    if (!liveShowing) return;
    liveShowing = false;
    frame.parentElement?.querySelector(':scope > .world-live')?.classList.remove('is-on');
  };

  const decayLive = () => {
    clearTimeout(liveDecayTimer);
    /* Свежий снимок каждый раз отодвигает порог остывания. Как только правки
       прекратились, предпросмотр плавно гаснет — под ним та же карта. */
    liveDecayTimer = setTimeout(hideLiveView, LIVE_STALE_MS);
  };

  const paintLive = () => {
    const shot = pendingLive;
    
    /* Окна редактора ещё нет — кадр остаётся ждать: он покажется, как только
       редактор поднимется (см. waitForEditor). */
    if (!shot || !active || busy || !win || !win.document) return;
    pendingLive = null;
    try {
      const parsed = new DOMParser().parseFromString(shot.text, 'image/svg+xml');
      const svg = parsed.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) return;
      const clean = sanitizeSnapshot(svg, win);
      if (!clean) return;
      const view = createLiveView(frame);
      if (!view) return;
      const under = view.querySelector('[data-role="live-under"]');
      const over = view.querySelector('[data-role="live-over"]');
      if (!under || !over) return;
      const next = over.classList.contains('world-live__layer--top') ? under : over;
      const prev = next === over ? under : over;
      next.innerHTML = clean;
      const svgEl = next.firstElementChild;
      if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg') {
        next.innerHTML = '';
        return;
      }
      /* Вид мастера: размер его окна как система координат; карта масштабируется
         «с запасом» (slice), как в редакторе — кадр выглядит ровно как у него. */
      svgEl.setAttribute('viewBox', `0 0 ${shot.vw} ${shot.vh}`);
      svgEl.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      svgEl.setAttribute('width', '100%');
      svgEl.setAttribute('height', '100%');
      svgEl.removeAttribute('id');
      /* Слои меняются местами: новый снимок уже готов под сменой. */
      prev.classList.remove('world-live__layer--top');
      next.classList.add('world-live__layer--top');
      next.style.opacity = '1';
      prev.style.opacity = '0';
      view.classList.add('is-on');
      liveShowing = true;
      decayLive();
    } catch {
      /* испорченный снимок просто пропускаем — следующий придёт через мгновение */
    }
  };

  const applyLiveFrame = async (bytes) => {
    if (!active || isMaster) return;
    const parsed = decodeFrame(bytes);
    if (!parsed || parsed.header.lobbyId !== lobbyId) return;
    try {
      const text = await gunzip(parsed.payload);
      if (!text || !text.includes('<svg')) return;
      pendingLive = { text, vw: Number(parsed.header.vw), vh: Number(parsed.header.vh) };
      paintLive();
    } catch {
      /* битый кадр — ждём следующий */
    }
  };

  /* ---------- игрок и мастер: приём полной карты ------------- */

  const tryApply = async () => {
    if (!active || !ready || !initialDone || busy || applying || !pendingFrame) return;
    const bytes = pendingFrame;
    pendingFrame = null;
    applying = true;
    setLobbyApplying(true);
    /* Накладка нужна только на первой карте: дальше карта меняется в фоне,
       старая остаётся на экране до полной готовности — правки мастера больше
       не выглядят перезагрузкой. */
    const withVeil = !appliedAny;
    if (withVeil) showEditorStage(frame, 'Загрузка карты мастера');
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
      appliedAny = true;
      if (isMaster) lastText = text;
      /* Карта догнала предпросмотр: снимок спрячется сам по таймеру
         остывания — резкого прыжка не будет. */
    } catch {
      /* битый кадр: держим текущую карту, следующий кадр всё поправит */
    } finally {
      applying = false;
      setLobbyApplying(false);
      if (withVeil) hideEditorStage(frame);
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
      hideLiveView();
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
      case 'live':
        if (fresh && isMaster) return;
        applyLiveFrame(event.bytes);
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
      case 'ack':
        if (isMaster) setLobbyDelivered(event.delivered);
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
    /* В режиме редактирования карта меняется постоянно: уводит её живой
       снимок, а полная карта уйдёт один раз — в конце сеанса (liveTick).
       В обычном режиме карта меняется редко (переименование города, правка
       подписи в диалоге) — её уводит прежний механизм с задержкой. */
    const onChange = () => {
      if (!win.customization) scheduleEdit();
    };
    const onClick = (event) => {
      if (!win.customization && event.target?.closest?.('#dialogs, .ui-dialog')) scheduleEdit();
    };
    doc.addEventListener('change', onChange, true);
    doc.addEventListener('click', onClick, true);
    detachDom = () => {
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
      /* Сеанс правок ведётся таймером: включил режим редактирования — снимки
         пошли, выключил — остановились. */
      liveTimer = setInterval(liveTick, LIVE_TICK_MS);
      if (pendingPublish) {
        pendingPublish = false;
        publish();
      }
    } else {
      /* Кадр, пришедший раньше редактора, ждёт здесь. */
      paintLive();
    }
    watchLobbyMap();
    decide();
    tryApply();
  });

  return stop;
};
