/* Плоская карта мира блок за блоком: один пиксель — один блок, ярус — ползунок.
   Экран карты уже держит iframe с генератором, и именно из его окна вид берёт
   карты (src/world/bridge.js). Поэтому режим переключается классом на .world-app,
   а не перерисовкой страницы: пересоздание iframe заново запустило бы генерацию
   Azgaar (секунды), и мир пришлось бы строить с нуля.
   Что здесь есть:
   • ползунок яруса (1…worldHeight) с пресетами — кроны, поверхность, вода,
   дно, пещеры, руды, основание: «разрезать мир плоскостью на высоте Y»;
   • перетаскивание — сдвиг, колесо — масштаб (1…8 px на блок), стрелки —
   сдвиг, PageUp/PageDown — ярус (Shift — на десять), +/− — масштаб;
   • наложения: стрелки течения (живые), береговая линия, отметки высот,
   тени рельефа — каждое выключается, потому что на маленьком экране они
   мешают друг другу;
   • очередь чанков с бюджетом кадра (src/world/world.js): первые кадры
   показывают ближние чанки, дальние догоняют;
   • HUD: что под курсором (тот же блок, что нарисован в пикселе), сколько
   чанков построено и сколько стоит кадр.
   Полотно рисуется в разрешении блоков (1 px = 1 блок) и растягивается CSS-ом с
   image-rendering: pixelated — так картинка идёт ровно по сетке чанков, а цена
   кадра зависит от размера окна, поделённого на масштаб, и не зависит от DPI. */

import { blockName } from '../world/blocks.js';
import { CHUNK_SX, CHUNK_SZ, blockAt } from '../world/chunk.js';
import { buildField, fold, spawnPoint, surfaceY } from '../world/field.js';
import { VoxelSourceError, describeSource, mapsReady, missingMapsPart, readSource } from '../world/bridge.js';
import { createVoxelWorld } from '../world/world.js';
import { buildAtlas, buildTileColors } from '../world/atlas.js';
import {
  LAYER_PRESETS,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  buildSlice,
  cutY,
  makeView,
  presetLevel,
  zoneName,
} from '../world/layers.js';

import { icon } from '../ui/icons.js';
/* Динамику гасят система и тумблер «Анимации» — правило одно на весь
   интерфейс, см. src/ui/motion.js. */
import { motionOff, motionQuery } from '../ui/motion.js';

const BUDGET_MS = 6;

/** Кадры с течением дороже статичных, а пульс воды медленный: 14 FPS для
   анимации достаточно и вчетверо дешевле, чем перекрашивать каждый кадр. */
const PAINT_MS = 70;
const LEVEL_BIG = 10;
const PAN_STEP = 24;

/** Потолок стоимости кадра: перекрасить 260 000 блоков — десятки миллисекунд,
   больше нельзя даже на 4K-мониторе при мелком блоке. */
const MAX_CELLS = 260_000;
const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/**
 * @param {HTMLElement} host элемент .world-editor: в нём лежит iframe с картой
 * @param {{ frame?: HTMLIFrameElement, config?: object, onExit?: () => void }} [options]
 * @returns {object} view — element, level, zoom, overlays, dispose
 */
/* Что с окном редактора: `ready` — карты построены, `wait` — генератор ещё
   считает, `denied` — до окна не дотянуться (другой источник или закрытый
   документ). Проверка стоит перед чтением снимка: `readSource` на неготовом
   документе отказал бы ошибкой, а ошибка — это не ожидание. */
const frameState = (frame) => {
  try {
    return mapsReady(frame?.contentWindow) ? 'ready' : 'wait';
  } catch {
    return 'denied';
  }
};

/* Карта генератора появляется не сразу: iframe с Azgaar считает мир несколько
   секунд, и до этого в его окне нет ни высот, ни упаковки. Раньше вид в этом
   случае сдавался — а так как режим уже включён и кадр редактора под холстом
   скрыт, человек видел пустую сцену с надписью «мир не построен» и вызывал
   карту блоками второй раз вручную. Теперь вид ждёт генератор сам и строится,
   как только карта появится: ожидание — это состояние вида, а не отказ.
   Ждать имеет смысл только того, кто может появиться: без самого кадра
   редактора дело не в генерации, и причину называет вид, а не надпись. */

/* Признаки «карт в документе ещё нет»: так отвечает мост, когда окно есть, а
   генератор до карт не дошёл. Это не отказ — это ожидание. */
const TOO_EARLY = /строить рано|документ редактора не открыт/;

/* Что видно про кадр редактора — для сообщения о неудаче: без этого «не
   открыт» не отличить от «открыт, но пустой», и разбираться приходится
   догадками. */
const describeFrame = (frame) => {
  if (!frame) return 'кадра редактора нет вовсе';
  let src = 'без адреса';
  try {
    src = typeof frame.getAttribute === 'function' ? frame.getAttribute('src') || 'srcdoc' : 'без адреса';
  } catch {
    src = 'адрес недоступен';
  }
  try {
    const win = frame.contentWindow;
    if (!win) return `кадр ${src}, окна нет`;
    const grid = win.grid?.cells?.h?.length ?? 0;
    const pack = win.pack?.cells?.h?.length ?? 0;
    return `кадр ${src}, окно есть, сетка ${grid ? `${grid} клеток` : 'не построена'}, упаковка ${pack ? 'есть' : 'нет'}`;
  } catch {
    return `кадр ${src}, к документу нет доступа`;
  }
};

/* Собрать вид или, если карты ещё не готовы, вернуться к ожиданию: «рано» —
   не отказ. Так закрывается и гонка (проверили готовность — а документ как раз
   перезагрузился), и пересозданный кадр, и ожидание, которое затянулось. */
const mountOrWait = (host, options) => {
  const view = buildWorldView(host, options);
  const early = view.error && options.frame && TOO_EARLY.test(view.error);

  /* Зерно ожидания живёт в options: сколько ждать — считаем один раз на весь
     сеанс, а не заново после каждой попытки. */
  const deadline = options.deadline ?? Date.now() + WAIT_LIMIT_MS;
  if (!early || Date.now() >= deadline) return view;
  view.dispose();
  return mountWaitingView(host, { ...options, deadline });
};

export const mountWorldView = (host, options = {}) => {
  if (options.frame && frameState(options.frame) === 'wait') return mountWaitingView(host, options);
  return mountOrWait(host, options);
};

/* ---------- ожидание генератора ---------- */

/* Как часто спрашиваем окно редактора. Раз в четверть секунды: генерация идёт
   секундами, а чаще спрашивать незачем — только зазря будить поток. */
const WAIT_STEP_MS = 250;

/* Мост говорит «документ редактора не открыт» и про загружающийся, и про
   закрытый документ. В ожидании это грозно звучит зря: там понятно, что
   документ просто ещё едет. */
const waitReason = (reason) => (reason === 'документ редактора не открыт' ? 'документ ещё загружается' : reason);

/* Сколько ждём, прежде чем сдаться. Дольше двух минут молчащий генератор —
   это уже не «считает», а отказ, и о нём должен сказать сам вид. */
const WAIT_LIMIT_MS = 120_000;

/**
 * Ждёт, пока в документе редактора появятся карты, и отдаёт место настоящему
 * виду. Наружу отдаёт ту же ручку, что и он: `element`, `error`, `dispose` —
 * этого достаточно и экрану карты (main.js), и человеку, который смотрит на
 * сцену: в ожидании видно, чего именно не хватает.
 */
const mountWaitingView = (host, options) => {
  const { frame } = options;
  const deadline = options.deadline ?? Date.now() + WAIT_LIMIT_MS;
  const root = document.createElement('div');
  root.className = 'world-voxel';
  root.dataset.role = 'world-voxel';
  root.innerHTML = `
<div class="world-voxel-wait" data-role="voxel-wait" role="status">
<span class="world-voxel-wait__pulse" aria-hidden="true"></span>
<p class="world-voxel-wait__text">Считаю карту генератора…</p>
</div>
<div class="world-voxel-toolbar">
<button class="world-voxel-button" type="button" data-voxel-action="exit" aria-label="К карте" title="К карте (Esc)">${icon('map', 'icon--xs')}<span>К карте</span></button>
</div>
<p class="world-voxel-note" data-role="voxel-note"></p>`;
  host.append(root);
  const note = root.querySelector('[data-role="voxel-note"]');
  const waitText = root.querySelector('.world-voxel-wait__text');
  let timer = 0;
  let inner = null;
  let disposed = false;
  let gaveUp = '';
  const leave = () => {
    if (!disposed) options.onExit?.();
  };
  root.querySelector('[data-voxel-action="exit"]')?.addEventListener('click', leave);
  const stop = () => {
    disposed = true;
    clearTimeout(timer);
    timer = 0;
    inner?.dispose();
    inner = null;
    root.remove();
  };
  const handover = () => {
    clearTimeout(timer);
    timer = 0;

    /* Свою сцену убираем до сборки: настоящий вид занимает тот же хост, и две
       разметки поверх друг друга — это два «К карте» и две заметки. */
    root.remove();
    const view = buildWorldView(host, options);

    /* Снимок снова сказал «рано» (кадр успел перезагрузиться или окно ещё не
       до конца живо) — это не тупик, а продолжение ожидания: сцену возвращаем
       на место и ждём дальше, пока есть срок. */
    if (view.error && TOO_EARLY.test(view.error) && Date.now() < deadline) {
      view.dispose();
      host.append(root);
      waitText.textContent = `Считаю карту генератора: ${waitReason(missingMapsPart(frame?.contentWindow))}…`;
      note.textContent = 'Карта блоками появится сама, как только мир будет готов.';
      timer = setTimeout(poll, WAIT_STEP_MS);
      return;
    }
    inner = view;
    waiting.element = inner.element;
    waiting.waiting = false;
  };
  const giveUp = () => {
    clearTimeout(timer);
    timer = 0;
    gaveUp = `Генератор не ответил за две минуты: ${waitReason(missingMapsPart(frame?.contentWindow))}.`;
    waitText.textContent = 'Карта так и не построилась.';
    note.textContent = `${gaveUp} ${describeFrame(frame)}. Кнопка «Карта блоками» попробует снова.`;
  };
  const poll = () => {
    timer = 0;
    if (disposed) return;
    const state = frameState(frame);
    if (state !== 'wait') {
      handover();
      return;
    }
    if (Date.now() >= deadline) {
      giveUp();
      return;
    }
    waitText.textContent = `Считаю карту генератора: ${waitReason(missingMapsPart(frame?.contentWindow))}…`;
    note.textContent = 'Карта блоками появится сама, как только мир будет готов.';
    timer = setTimeout(poll, WAIT_STEP_MS);
  };
  const waiting = {
    element: root,
    waiting: true,

    /* По какому кадру строится вид: экран карты сверяет его с живым — кадр
       редактора пересоздаётся на новый seed и на смену размера. */
    frame,
    get error() {
      return inner?.error || gaveUp;
    },

    dispose: stop,
  };
  poll();
  return waiting;
};

const buildWorldView = (host, { frame, config, onExit } = {}) => {
  const cleanups = [];
  let raf = 0;
  const root = document.createElement('div');
  root.className = 'world-voxel';
  root.dataset.role = 'world-voxel';
  root.innerHTML = `
<canvas class="world-voxel-canvas" data-role="voxel-canvas" tabindex="0" aria-label="Карта мира блок за блоком"></canvas>
<div class="world-voxel-toolbar">
<button class="world-voxel-button" type="button" data-voxel-action="reset" aria-label="К точке появления" title="К точке появления (R)">${icon('crosshair', 'icon--xs')}<span>Появление</span></button>
<button class="world-voxel-button" type="button" data-voxel-action="exit" aria-label="К карте" title="К карте (Esc)">${icon('map', 'icon--xs')}<span>К карте</span></button>
</div>
<div class="world-voxel-layers" data-role="voxel-layers">
<div class="world-voxel-row">
<span class="world-voxel-label">ярус</span>
<button class="world-voxel-step" type="button" data-voxel-action="level-down" aria-label="Ярус ниже">−</button>
<input class="world-voxel-slider" type="range" data-role="voxel-level" min="1" max="2" step="1" value="1" aria-label="Ярус среза">
<button class="world-voxel-step" type="button" data-voxel-action="level-up" aria-label="Ярус выше">+</button>
<output class="world-voxel-value" data-role="voxel-level-value"></output>
</div>
<div class="world-voxel-row world-voxel-row--presets" data-role="voxel-presets"></div>
<div class="world-voxel-row">
<span class="world-voxel-label">блок</span>
<button class="world-voxel-step" type="button" data-voxel-action="zoom-out" aria-label="Крупнее блок" title="Крупнее блок (−)">−</button>
<output class="world-voxel-value" data-role="voxel-zoom-value"></output>
<button class="world-voxel-step" type="button" data-voxel-action="zoom-in" aria-label="Мельче блок" title="Мельче блок (+)">+</button>
<span class="world-voxel-label world-voxel-label--right">наложения</span>
<span data-role="voxel-overlays"></span>
</div>
<p class="world-voxel-hud" data-role="voxel-hud" role="status" aria-live="off"></p>
</div>
<p class="world-voxel-note" data-role="voxel-note"></p>`;
  host.append(root);

  /* Появление: карта проявляется из размытия и растёт из центра (CSS, класс
     is-reveal). Класс снимаем по таймеру: анимация не должна висеть на
     фоновой вкладке или при выключенной динамике. */
  const motion = motionQuery();
  let revealTimer = 0;
  if (!motionOff(motion)) {
    root.classList.add('is-reveal');
    revealTimer = setTimeout(() => root.classList.remove('is-reveal'), 1900);
  }

  const canvas = root.querySelector('[data-role="voxel-canvas"]');
  const hud = root.querySelector('[data-role="voxel-hud"]');
  const note = root.querySelector('[data-role="voxel-note"]');
  const slider = root.querySelector('[data-role="voxel-level"]');
  const levelValue = root.querySelector('[data-role="voxel-level-value"]');
  const zoomValue = root.querySelector('[data-role="voxel-zoom-value"]');
  const presetHost = root.querySelector('[data-role="voxel-presets"]');
  const overlayHost = root.querySelector('[data-role="voxel-overlays"]');
  const setNote = (text) => {
    note.textContent = text || '';
    note.hidden = !text;
  };
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };
  const OVERLAYS = [
    { key: 'arrows', name: 'течение' },
    { key: 'coast', name: 'вода' },
    { key: 'labels', name: 'отметки' },
    { key: 'shade', name: 'рельеф' },
  ];
  presetHost.innerHTML = LAYER_PRESETS.map(
    (preset) =>
      `<button class="world-voxel-chip" type="button" data-layer="${preset.id}" title="${preset.hint}">${preset.name}</button>`,
  ).join('');
  overlayHost.innerHTML = OVERLAYS.map(
    (item) =>
      `<button class="world-voxel-chip is-on" type="button" data-overlay="${item.key}" aria-pressed="true">${item.name}</button>`,
  ).join('');
  const view = {
    element: root,
    error: '',

    /* Ярус и масштаб — состояние вида, а не полотна: их читают тесты, и они
       должны жить независимо от того, есть ли у браузера 2D-канвас. */
    level: 0,
    zoom: ZOOM_DEFAULT,
    preset: null,
    center: [0, 0],
    overlays: { arrows: true, coast: true, labels: true, shade: true },

    cells: { x: 0, z: 0 },

    cursor: null,
    frameMs: 0,
    sliceInfo: null,
    field: null,
    source: null,
    world: null,
    spawn: null,
    running: false,
    dirty: true,
  };
  view.dispose = () => {
    clearTimeout(revealTimer);
    view.running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    for (const cleanup of cleanups.splice(0)) cleanup();
    view.world?.dispose();
    root.remove();
  };

  /* Отказ до построения мира: показываем причину и оставляем рабочий dispose. */
  const stop = (message) => {
    view.error = message;

    /* К «почему не построился» добавляем, что видно про сам кадр: иначе
       «документ не открыт» не отличить от «открыт, но пустой». */
    setNote(`${message} (${describeFrame(frame)})`);
    hud.textContent = 'Мир не построен — данные карты недоступны.';
    return view;
  };

  /* ---------- снимок карт → поле ---------- */

  let source;
  try {
    source = readSource(frame?.contentWindow, { seed: config?.seed, width: config?.width, height: config?.height });
  } catch (error) {
    const message = error instanceof VoxelSourceError ? error.message : (error?.message ?? String(error));
    return stop(`Карта блоками: ${message}`);
  }

  setNote(`Снимаю карты: ${describeSource(source)}…`);
  const field = buildField(source, { profile: 2, detail: 1 });
  view.field = field;
  view.source = source;

  /* Кадр, из которого взят снимок: если экран карты пересоздаст iframe (новый
     seed, другой размер, карта лобби), вид обязан построиться заново — иначе
     на экране останется прежний мир. */
  view.frame = frame;
  const spawn = spawnPoint(field);
  view.spawn = spawn;

  /* Палитра берётся из того же атласа, что и текстуры: средний цвет тайла той
     грани, которую видно сверху. Отдельная палитра разъехалась бы с атласом при
     первой же правке тонов. */
  const colors = buildTileColors(buildAtlas(field.seed));
  const blockAtWorld = (x, y, z) => {
    const record = world.get(Math.floor(x / CHUNK_SX), Math.floor(z / CHUNK_SZ));
    const chunk = record?.chunk;
    if (!chunk) return null;
    const lx = x - chunk.x0;
    const lz = z - chunk.z0;
    if (lx < 0 || lx >= chunk.sx || lz < 0 || lz >= chunk.sz) return null;
    return blockAt(chunk, lx, y, lz);
  };

  /* Радиус обзора растёт с картой, но не дальше 7 чанков: дальше память и
     очередь чанков растут быстрее, чем видно на экране. */
  const reviewRadius = clamp(Math.floor(Math.min(field.width, field.height) / (CHUNK_SX * 2)), 2, 7);
  const world = createVoxelWorld(field, { radius: reviewRadius });
  view.world = world;
  world.focus(spawn.x, spawn.z);
  view.center = [spawn.x, spawn.z];

  /* ---------- ярус, масштаб, кадрирование ---------- */

  const currentView = () => makeView(view.center, view.cells.x, view.cells.z);
  view.makeView = currentView;

  /* Медиана рельефа в кадре — нужна подписи под ползунком, чтобы отличить
     «срез выше вершин» от «срез в толще». Считаем по редкой решётке: кадр
     перестраивается на каждое движение, а точность здесь — десятки блоков. */
  let median = { key: '', value: NaN };
  const medianGround = () => {
    const cells = currentView();
    const signature = `${cells.x0},${cells.z0},${cells.cellsX},${cells.cellsZ}`;
    if (median.key === signature) return median.value;
    let sum = 0;
    let count = 0;
    const stepX = Math.max(1, Math.round(cells.cellsX / 48));
    const stepZ = Math.max(1, Math.round(cells.cellsZ / 32));
    for (let z = 0; z < cells.cellsZ; z += stepZ) {
      for (let x = 0; x < cells.cellsX; x += stepX) {
        const { u, v } = fold(field, cells.x0 + x, cells.z0 + z);
        sum += field.ground[v * field.width + u];
        count += 1;
      }
    }
    median = { key: signature, value: count ? Math.round(sum / count) : NaN };
    return median.value;
  };
  const syncChips = () => {
    for (const chip of presetHost.querySelectorAll('[data-layer]')) {
      const on = chip.dataset.layer === view.preset;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (const chip of overlayHost.querySelectorAll('[data-overlay]')) {
      const on = view.overlays[chip.dataset.overlay] === true;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };
  const levelText = () => {
    const preset = view.preset ? LAYER_PRESETS.find((item) => item.id === view.preset) : null;
    return `ярус ${view.level} · ${zoneName(field, view.level, medianGround())}${preset ? ` · ${preset.name}` : ''}`;
  };
  const syncLabel = () => {
    slider.value = String(view.level);
    levelValue.textContent = levelText();
    zoomValue.textContent = `${view.zoom} px/блок`;
  };
  const applyLevel = (next, preset = null) => {
    view.level = clamp(Math.round(next), 1, field.worldHeight - 1);
    view.preset = preset;
    syncChips();
    syncLabel();
    view.dirty = true;
  };
  const applyZoom = (next, anchor = null) => {
    const before = view.zoom;
    const after = clamp(Math.round(next), ZOOM_MIN, ZOOM_MAX);
    if (after === before) return;
    if (anchor) {
      /* Точка под курсором должна остаться на месте: сдвиг центра равен
         разнице «сколько блоков было под курсором» и «сколько стало». */
      view.center[0] += anchor[0] * (1 / before - 1 / after);
      view.center[1] += anchor[1] * (1 / before - 1 / after);
    }
    view.zoom = after;
    view.dirty = true;
  };
  const context = canvas.getContext('2d');
  let image = null;
  let boxKey = '';

  /** Размер полотна в блоках: сколько помещается в окно при выбранном
     масштабе, но не дороже MAX_CELLS перекрасок на кадр. */
  const fitCanvas = () => {
    const width = Math.max(64, Math.round(canvas.clientWidth || canvas.getBoundingClientRect?.().width || 64));
    const height = Math.max(64, Math.round(canvas.clientHeight || canvas.getBoundingClientRect?.().height || 64));
    let cellsX = Math.max(8, Math.ceil(width / view.zoom));
    let cellsZ = Math.max(8, Math.ceil(height / view.zoom));
    const over = (cellsX * cellsZ) / MAX_CELLS;
    if (over > 1) {
      /* Окно велико, а масштаб уже на максимуме: берём чуть меньше блоков, чем
         просит экран, и растягиваем их CSS-ом. Пиксели станут на долю блока
         шире — иначе кадр стоил бы десятки миллисекунд. */
      const k = Math.sqrt(over);
      cellsX = Math.max(8, Math.floor(cellsX / k));
      cellsZ = Math.max(8, Math.floor(cellsZ / k));
    }

    const key = `${width}×${height}×${view.zoom}×${cellsX}×${cellsZ}`;
    if (key === boxKey) return false;
    boxKey = key;
    view.cells = { x: cellsX, z: cellsZ };
    canvas.width = cellsX;
    canvas.height = cellsZ;
    image = context ? context.createImageData(cellsX, cellsZ) : null;
    view.dirty = true;
    return true;
  };
  let paintAt = 0;
  const paint = (now) => {
    if (!context || !image) {
      view.dirty = false;
      return;
    }

    const t0 = performance.now();
    const slice = buildSlice(field, colors, world, currentView(), {
      level: view.level,
      time: now / 1000,
      arrows: view.overlays.arrows,
      coast: view.overlays.coast,
      labels: view.overlays.labels,
      shade: view.overlays.shade,
    });
    image.data.set(slice.data);
    context.putImageData(image, 0, 0);
    view.frameMs = performance.now() - t0;
    view.sliceInfo = { fromChunks: slice.fromChunks, fromField: slice.fromField, water: slice.water };
    paintAt = now;
    view.dirty = false;
  };
  const focusSpawn = () => {
    view.center = [spawn.x, spawn.z];
    view.zoom = ZOOM_DEFAULT;
    fitCanvas();
    world.focus(spawn.x, spawn.z);
    applyLevel(field.worldHeight - 1, 'surface');
  };

  /* ---------- управление ---------- */

  let drag = null;
  listen(canvas, 'pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    canvas.setPointerCapture?.(event.pointerId);
    drag = { x: event.clientX, y: event.clientY };
    canvas.focus({ preventScroll: true });
  });
  listen(canvas, 'pointermove', (event) => {
    if (drag) {
      view.center[0] -= (event.clientX - drag.x) / view.zoom;
      view.center[1] -= (event.clientY - drag.y) / view.zoom;
      drag.x = event.clientX;
      drag.y = event.clientY;
      syncLabel();
      view.dirty = true;
    }

    readCursor(event);
  });
  const endDrag = (event) => {
    drag = null;
    if (event?.pointerId !== undefined) canvas.releasePointerCapture?.(event.pointerId);
  };
  listen(canvas, 'pointerup', endDrag);
  listen(canvas, 'pointercancel', endDrag);
  listen(canvas, 'pointerleave', () => {
    view.cursor = null;
  });
  listen(
    canvas,
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      applyZoom(view.zoom * (event.deltaY > 0 ? 1 / 1.25 : 1.25), [
        event.clientX - rect.left,
        event.clientY - rect.top,
      ]);
      fitCanvas();
      syncLabel();
    },
    { passive: false },
  );

  /** Блок под курсором — тот же, что нарисован в этом пикселе: ярус с поправкой
     на вершину колонки (cutY), а не «level» вообще. */
  const readCursor = (event) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const cells = currentView();
    const cx = Math.floor(((event.clientX - rect.left) / rect.width) * cells.cellsX);
    const cz = Math.floor(((event.clientY - rect.top) / rect.height) * cells.cellsZ);
    if (cx < 0 || cz < 0 || cx >= cells.cellsX || cz >= cells.cellsZ) {
      view.cursor = null;
      return;
    }

    const x = cells.x0 + cx;
    const z = cells.z0 + cz;
    const { u, v } = fold(field, x, z);
    const y = cutY(field, v * field.width + u, view.level);
    view.cursor = { x, y, z, id: blockAtWorld(x, y, z), surface: surfaceY(field, x, z) };
  };
  listen(root, 'click', (event) => {
    const presetButton = event.target.closest?.('[data-layer]');
    if (presetButton) {
      const level = presetLevel(field, blockAtWorld, currentView(), presetButton.dataset.layer);
      applyLevel(level ?? field.worldHeight - 1, presetButton.dataset.layer);
      return;
    }

    const overlay = event.target.closest?.('[data-overlay]');
    if (overlay) {
      const key = overlay.dataset.overlay;
      view.overlays[key] = view.overlays[key] !== true;
      syncChips();
      view.dirty = true;
      return;
    }

    const button = event.target.closest?.('[data-voxel-action]');
    if (!button) return;
    const { voxelAction } = button.dataset;
    if (voxelAction === 'reset') focusSpawn();
    else if (voxelAction === 'exit') onExit?.();
    else if (voxelAction === 'level-down') applyLevel(view.level - (event.shiftKey ? LEVEL_BIG : 1));
    else if (voxelAction === 'level-up') applyLevel(view.level + (event.shiftKey ? LEVEL_BIG : 1));
    else if (voxelAction === 'zoom-out') {
      applyZoom(view.zoom - 1);
      fitCanvas();
      syncLabel();
    } else if (voxelAction === 'zoom-in') {
      applyZoom(view.zoom + 1);
      fitCanvas();
      syncLabel();
    }
  });
  listen(slider, 'input', () => applyLevel(Number(slider.value)));
  const editable = (node) => /^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName || '') || node?.isContentEditable;
  listen(window, 'keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    /* На ползунке стрелки и PageUp/PageDown работают сами — и ровно с той же
       семантикой (±1, Shift — крупный шаг). Дублировать их здесь означало бы
       двигать ещё и карту. Esc обрабатывает main.js: ступеньки выхода его. */
    if (event.target === slider || editable(event.target)) return;
    if (event.code === 'KeyR') {
      focusSpawn();
      return;
    }

    const big = event.shiftKey;
    const step = big ? LEVEL_BIG : 1;
    let handled = true;
    switch (event.code) {
      case 'PageUp':
        applyLevel(view.level + step);
        break;
      case 'PageDown':
        applyLevel(view.level - step);
        break;
      case 'Equal':
      case 'NumpadAdd':
        applyZoom(view.zoom + 1);
        fitCanvas();
        syncLabel();
        break;
      case 'Minus':
      case 'NumpadSubtract':
        applyZoom(view.zoom - 1);
        fitCanvas();
        syncLabel();
        break;
      case 'ArrowLeft':
        view.center[0] -= PAN_STEP * (big ? 4 : 1);
        break;
      case 'ArrowRight':
        view.center[0] += PAN_STEP * (big ? 4 : 1);
        break;
      case 'ArrowUp':
        view.center[1] -= PAN_STEP * (big ? 4 : 1);
        break;
      case 'ArrowDown':
        view.center[1] += PAN_STEP * (big ? 4 : 1);
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
      syncLabel();
      view.dirty = true;
    }
  });

  /* ---------- цикл ---------- */

  let hudAt = 0;
  let hudText = '';
  let noteCleared = false;
  let lastFocus = [view.center[0], view.center[1]];
  const tick = (now) => {
    if (!view.running) return;
    raf = requestAnimationFrame(tick);
    fitCanvas();
    const gen = world.step(BUDGET_MS);
    if (
      Math.abs(view.center[0] - lastFocus[0]) >= CHUNK_SX / 2 ||
      Math.abs(view.center[1] - lastFocus[1]) >= CHUNK_SZ / 2
    ) {
      lastFocus = [view.center[0], view.center[1]];
      world.focus(view.center[0], view.center[1]);
    }
    if (now - hudAt > 240) {
      hudAt = now;
      const stats = world.stats();
      const bits = [`чанков ${stats.ready}${stats.queued ? ` + ${stats.queued} в очереди` : ''}`];
      if (view.sliceInfo) {
        bits.push(
          `по блокам ${view.sliceInfo.fromChunks.toLocaleString('ru-RU')}, по схеме поля ${view.sliceInfo.fromField.toLocaleString('ru-RU')}`,
        );
      }
      bits.push(`${view.frameMs.toFixed(1)} мс/кадр`);
      if (view.cursor) {
        bits.push(
          view.cursor.id === null
            ? 'чанк под курсором ещё не построен'
            : `под курсором: ${blockName(view.cursor.id)} ${view.cursor.x}/${view.cursor.y}/${view.cursor.z}`,
        );
      }

      const text = bits.join(' · ');
      if (text !== hudText) {
        hudText = text;
        hud.textContent = text;
      }
      if (stats.ready > 0 && gen.done && !noteCleared) {
        noteCleared = true;
        setNote('');
      }
    }

    /* Перекрашиваем, только если что-то изменилось либо живёт течение: кадр
       стоит десятки миллисекунд на полном экране, и греть их впустую нельзя.
       Течение идёт, когда в кадре есть вода и динамика разрешена — системной
       настройкой или тумблером «Анимации»; выключенная динамика даёт статичную
       картинку, а не выключенную карту. */
    const animate = !motionOff(motion) && (view.sliceInfo?.water ?? 0) > 0;
    if (!view.dirty && gen.generated === 0 && !(animate && now - paintAt >= PAINT_MS)) return;
    paint(now);
  };

  /* Ползунок ходит по индексам блоков: верхний ярус = верхний блок мира,
     «выше всех вершин» при этом остаётся первым пресетом. */
  slider.max = String(field.worldHeight - 1);
  fitCanvas();
  syncChips();
  applyLevel(field.worldHeight - 1, 'surface');
  setNote(
    `Мир ${field.width} × ${field.height} колонок, ярусов ${field.worldHeight}. ` +
      'Перетаскивание — сдвиг, колесо — масштаб, PageUp/PageDown — ярус.',
  );
  view.running = true;
  raf = requestAnimationFrame(tick);
  return view;
};
