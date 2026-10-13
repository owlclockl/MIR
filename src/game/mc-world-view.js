/* Вид блочного мира: карта Земли блок за блоком.

   Это единственный вид собственного генератора. Его открывают обе кнопки —
   «Тест-генератор» (режим `map`: биомы, рельеф, климат) и «Карта блоками»
   (режим `blocks`: срез мира на выбранном ярусе). Мир у них один и тот же:
   кнопки отличаются только слоем, который виден при открытии.

   Почему счёт идёт клетками, а не пикселями. Полный растр Земли — это
   8 × 10^14 колонок, а один кадр 1600 × 900 — 1,4 млн колонок. Колонка стоит
   около трёх микросекунд, то есть полный кадр «блок за блок» — четыре секунды
   на кадр. Поэтому полотно делится на квадратные клетки: клетка покрывает
   `cellBlocks` блоков мира и рисуется как `cs × cs` пикселей. Пиксель остаётся
   блоком (на близком масштабе — ровно один блок на пиксель), но выборок на
   кадр становится в `cs²` раз меньше. Дальше картинка растягивается без
   сглаживания — это и даёт блочный вид.

   Почему рисование идёт по строкам. Строка клеток дешевле кадра, поэтому
   карта проявляется сверху вниз порциями по бюджету времени, а не одним
   залпом. Панорамирование и смена слоя начинают рисование заново с той строки,
   где остановились, а прогресс виден в полоске под панелью.

   Слои — это один и тот же мир, у которого спрашивают разное: биом, высоту,
   температуру, осадки, блок на ярусе, долю пустот, руду, деревни. Ярус режет
   мир горизонтальной плоскостью, как в игре, и по нему же считается блок. */

import { icon } from '../ui/icons.js';
import { motionOff, motionQuery } from '../ui/motion.js';
import { BIOME_COLORS, BIOMES, biomeName, WATER_NONE } from '../gen/biomes.js';
import { blockRgb, blockName, GRASS_BLOCK } from '../gen/blocks.js';
import { areaLabel, digits, elevationMeters, SEA_LEVEL, WORLD_Y } from '../gen/scale.js';
import { C, COLUMN_SIZE, createBlockWorld, S, STAGE, STAGE_LABEL } from '../gen/world.js';

/** Слои карты: имя кнопки и подсказка, что именно видно. */
export const LAYERS = Object.freeze([
  { id: 'biome', name: 'биомы', hint: 'Цвет биома: так выглядит мир сверху' },
  { id: 'relief', name: 'рельеф', hint: 'Высоты с отмывкой склонов — как на настоящей карте' },
  { id: 'continents', name: 'материки', hint: 'Каждый кусок суши своим цветом: материки — плотным, острова — бледным' },
  { id: 'climate', name: 'климат', hint: 'Температура: у экватора тепло, у полюсов мороз' },
  { id: 'rain', name: 'осадки', hint: 'Годовые осадки: пустыни светлые, джунгли синие' },
  { id: 'blocks', name: 'блоки', hint: 'Срез мира на выбранном ярусе — тот же блок, что в игре' },
  { id: 'villages', name: 'деревни', hint: 'Постройки: площадки деревень, дома и дороги' },
]);

/** Ярусы мира по кнопкам — как пресеты в карте блоков. */
export const TIER_PRESETS = Object.freeze([
  { id: 'canopy', name: 'кроны', hint: 'Верх крон деревьев' },
  { id: 'surface', name: 'поверхность', hint: 'Тот блок, на который падает свет' },
  { id: 'sea', name: 'море', hint: 'Уровень моря — 63-й ярус' },
  { id: 'caves', name: 'пещеры', hint: 'Сорок блоков под поверхностью' },
  { id: 'ores', name: 'руды', hint: 'Ярус 12: полоса алмаза и редстоуна' },
  { id: 'bedrock', name: 'основание', hint: 'Нижний ярус мира' },
]);

/** Слои, которым нужна полная колонка: они стоят дороже остальных. */
const HEAVY_LAYERS = new Set(['blocks', 'villages']);
/** Размер клетки в пикселях: у дорогих слоёв крупнее, иначе кадр не успевает. */
const CELL_PX = { light: 2, heavy: 4 };
/** Потолок выборок на кадр — по нему выбирается размер клетки. */
const CELL_BUDGET = 120_000;
/** Бюджет счёта строк на кадр. Больше — и панорамирование начнёт рваться. */
const PAINT_BUDGET_MS = 12;
/** Потолок отметок деревень в кадре: слой не должен превращаться в кашу. */
const VILLAGE_LIMIT = 240;

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/* Палитры слоёв. Гипсометрия задана в метрах над уровнем моря — тех же, что
   показывает строка состояния, — а не в ярусах: иначе шкала растягивается на
   всю высоту мира (11 км), и вся суша оказывается в белом. Реальные ориентиры:
   шельф, берег, равнина, предгорья, горы, снеговая линия. Температура и осадки
   — условные шкалы от −40 до +40 °C и от 0 до 2400 мм. */
const HYPSOMETRY = [
  [-11000, [8, 14, 38]], [-5000, [12, 30, 68]], [-2500, [18, 52, 104]],
  [-1000, [28, 82, 134]], [-200, [46, 118, 152]], [0, [64, 138, 152]],
  [200, [110, 162, 126]], [800, [156, 172, 108]], [1800, [190, 168, 104]],
  [3000, [168, 132, 96]], [4500, [152, 140, 136]], [6000, [206, 206, 204]], [9000, [246, 250, 252]],
];
const TEMPERATURE = [
  [64, 92, 168], [92, 134, 186], [128, 176, 178], [188, 196, 138], [206, 156, 106], [184, 96, 80],
];
const PRECIPITATION = [
  [196, 178, 120], [168, 186, 132], [124, 176, 158], [86, 152, 176], [58, 112, 176], [40, 76, 156],
];

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Цвет по равномерной шкале: t от 0 до 1. */
const palette = (stops, t) => {
  const scaled = clamp(t, 0, 1) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return mix(stops[index], stops[index + 1], scaled - index);
};
/** Цвет по шкале с опорными значениями: сами значения задают кривую. */
const paletteAt = (stops, value) => {
  if (!(value > stops[0][0])) return stops[0][1];
  const last = stops[stops.length - 1];
  if (!(value < last[0])) return last[1];
  let index = 0;
  while (index < stops.length - 2 && stops[index + 1][0] <= value) index += 1;
  const a = stops[index];
  const b = stops[index + 1];
  return mix(a[1], b[1], (value - a[0]) / (b[0] - a[0]));
};

const rgbOf = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255];

/** Цвет по тону: материки различаются тоном, а не заливкой из палитры. */
const hsl = (hue, saturation, lightness) => {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = lightness - c / 2;
  const sector = Math.floor(hue * 6) % 6;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
};

/* Дёрн и листва в игре зеленеют от биома: тот же приём, что в генераторе
   колонок, — иначе близкий вид расходится с цветом блока в подсказке. */
const LEAVES_EXCEPT_GRASS = new Set([38, 39, 40, 41, 42, 43]);
const GRASS_TINT = BIOMES.map((biome) => rgbOf(biome.grass));
const isGrassy = (block) => block === GRASS_BLOCK || LEAVES_EXCEPT_GRASS.has(block);

/**
 * @param {HTMLElement} host элемент, в который монтируется вид
 * @param {{mode?: 'map'|'blocks', config?: object, onExit?: () => void}} [options]
 */
export const mountBlockWorldView = (host, options = {}) => {
  const mode = options.mode === 'blocks' ? 'blocks' : 'map';
  if (!host) return { element: null, error: 'Негде показать карту.', dispose: () => {} };
  const config = options.config ?? {};
  const seed = String(config.seed ?? '') || 'мир';
  const width = Number(config.width) > 0 ? Number(config.width) : undefined;
  const height = Number(config.height) > 0 ? Number(config.height) : undefined;

  const root = document.createElement('div');
  root.className = 'world-voxel';
  root.dataset.role = 'world-voxel';
  root.dataset.mode = mode;
  root.innerHTML = `
<canvas class="world-voxel-canvas" data-role="voxel-canvas" tabindex="0" aria-label="Карта блочного мира"></canvas>
<div class="world-voxel-toolbar">
<button class="world-voxel-button" type="button" data-voxel-action="spawn" aria-label="К точке появления" title="К точке появления (R)">${icon('crosshair', 'icon--xs')}<span>Появление</span></button>
<button class="world-voxel-button" type="button" data-voxel-action="earth" aria-label="Показать весь мир" title="Показать весь мир (W)">${icon('globe', 'icon--xs')}<span>Весь мир</span></button>
<button class="world-voxel-button" type="button" data-voxel-action="exit" aria-label="Назад к редактору карты" title="Назад к редактору (Esc)">${icon('map', 'icon--xs')}<span>К карте</span></button>
</div>
<div class="world-voxel-layers" data-role="voxel-layers">
<div class="world-voxel-row" data-role="voxel-tier-row">
<span class="world-voxel-label">ярус</span>
<button class="world-voxel-step" type="button" data-voxel-action="level-down" aria-label="Ярус ниже">${icon('minus', 'icon--xs')}</button>
<input class="world-voxel-slider" type="range" data-role="voxel-level" min="0" max="${WORLD_Y - 1}" step="1" value="${SEA_LEVEL}" aria-label="Ярус среза мира">
<button class="world-voxel-step" type="button" data-voxel-action="level-up" aria-label="Ярус выше">${icon('plus', 'icon--xs')}</button>
<output class="world-voxel-value" data-role="voxel-level-value"></output>
</div>
<div class="world-voxel-row" data-role="voxel-presets"></div>
<div class="world-voxel-row">
<span class="world-voxel-label">слой</span>
<span class="world-voxel-row" data-role="voxel-overlays"></span>
</div>
<div class="world-voxel-row">
<span class="world-voxel-label">масштаб</span>
<button class="world-voxel-step" type="button" data-voxel-action="zoom-out" aria-label="Мельче" title="Мельче (минус)">${icon('minus', 'icon--xs')}</button>
<output class="world-voxel-value" data-role="voxel-zoom-value"></output>
<button class="world-voxel-step" type="button" data-voxel-action="zoom-in" aria-label="Крупнее" title="Крупнее (плюс)">${icon('plus', 'icon--xs')}</button>
<span class="world-voxel-label world-voxel-label--right">материки</span>
<span class="world-voxel-row" data-role="voxel-continents"></span>
</div>
<p class="world-voxel-hud" data-role="voxel-hud" role="status" aria-live="off">Мир строится…</p>
</div>
<p class="world-voxel-note" data-role="voxel-note" hidden></p>
<div class="world-voxel-legend" data-role="voxel-legend" aria-hidden="true"></div>
<div class="world-voxel-progress" data-role="voxel-progress" aria-hidden="true"><i></i></div>
<div class="world-voxel-wait" data-role="voxel-wait" role="status">
<span class="world-voxel-wait__pulse" aria-hidden="true"></span>
<p class="world-voxel-wait__text" data-role="voxel-wait-text">Строю мир…</p>
</div>`;
  host.append(root);

  const canvas = root.querySelector('[data-role="voxel-canvas"]');
  /* Контекста может не быть вовсе — в jsdom его нет, и это не повод падать:
     вид обязан собраться, показать панели и честно сказать, что холста нет. */
  const context = (() => {
    try {
      return canvas.getContext('2d');
    } catch {
      return null;
    }
  })();
  const hud = root.querySelector('[data-role="voxel-hud"]');
  const note = root.querySelector('[data-role="voxel-note"]');
  const slider = root.querySelector('[data-role="voxel-level"]');
  const levelValue = root.querySelector('[data-role="voxel-level-value"]');
  const zoomValue = root.querySelector('[data-role="voxel-zoom-value"]');
  const tierRow = root.querySelector('[data-role="voxel-tier-row"]');
  const presetHost = root.querySelector('[data-role="voxel-presets"]');
  const layerHost = root.querySelector('[data-role="voxel-overlays"]');
  const continentHost = root.querySelector('[data-role="voxel-continents"]');
  const legendHost = root.querySelector('[data-role="voxel-legend"]');
  const progress = root.querySelector('[data-role="voxel-progress"]');
  const progressBar = progress.firstElementChild;
  const waitBox = root.querySelector('[data-role="voxel-wait"]');
  const waitText = root.querySelector('[data-role="voxel-wait-text"]');

  const world = createBlockWorld({ seed, width, height });
  const planet = world.planet;
  const maxLevel = planet.maxLevel;
  const cleanups = [];
  const listen = (target, type, handler, opts) => {
    target.addEventListener(type, handler, opts);
    cleanups.push(() => target.removeEventListener(type, handler, opts));
  };

  const view = {
    element: root,
    mode,
    world,
    error: context ? '' : 'Браузер не дал холст для карты.',
    waiting: true,
    center: [planet.width / 2, planet.height / 2],
    level: mode === 'blocks' ? Math.max(0, maxLevel - 3) : Math.max(0, maxLevel - 13),
    layer: mode === 'blocks' ? 'blocks' : 'biome',
    tier: SEA_LEVEL,
    tierPreset: 'sea',
    cursor: null,
    centered: false,
    dispose: () => {},
  };

  /* Появление вида: та же анимация, что была у карты блоков (класс is-reveal),
     и она же гасится правилом движения — одно правило на весь интерфейс. */
  let revealTimer = 0;
  if (!motionOff(motionQuery())) {
    root.classList.add('is-reveal');
    revealTimer = window.setTimeout(() => root.classList.remove('is-reveal'), 1900);
  }

  /* ---------- состояние рисования ---------- */

  const paint = {
    layer: '',
    tier: Number.NaN,
    cellBlocks: 0,
    cols: 0,
    rows: 0,
    cs: 0,
    floor: null, // offscreen-холст размером клеток
    floorCtx: null,
    image: null,
    flags: null, // 1 — клетка уже посчитана
    originX: 0,
    originZ: 0,
    nextRow: 0,
    done: false,
  };
  const scratchSample = new Float64Array(24);
  const scratchColumn = new Float64Array(COLUMN_SIZE);
  let prevRowHeights = new Float32Array(0);

  const cellPixels = (layer) => (HEAVY_LAYERS.has(layer) ? CELL_PX.heavy : CELL_PX.light);
  const blocksPerPixel = () => 2 ** (maxLevel - view.level);
  /* Мелкий слой рельефа (сотни метров) виден только тогда, когда клетка его
     крупнее: на грубых уровнях он не рисует рельеф, а сыплет шумом. */
  const detailFor = (cellBlocks) => (cellBlocks >= 64 ? 3 : 4);

  /** Размер полотна в пикселях устройства не важен: пиксель карты — блок. */
  const fitCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(96, Math.round(rect.width || canvas.width || 960));
    const height = Math.max(96, Math.round(rect.height || canvas.height || 540));
    if (canvas.width === width && canvas.height === height) return false;
    canvas.width = width;
    canvas.height = height;
    return true;
  };

  const layout = () => {
    if (!context) return false;
    const mpp = blocksPerPixel();
    const cs = cellPixels(view.layer);
    const cellBlocks = mpp * cs;
    /* Ничего не изменилось — старую картинку не пересчитываем: панорама и
       смена масштаба приходят сюда на каждое движение мыши. */
    if (paint.cellBlocks === cellBlocks && paint.layer === view.layer && paint.tier === view.tier
      && paint.cs === cs && paint.cols === Math.ceil(canvas.width / cs) && paint.rows === Math.ceil(canvas.height / cs)) return false;
    const cols = Math.ceil(canvas.width / cs);
    const rows = Math.ceil(canvas.height / cs);
    paint.layer = view.layer;
    paint.tier = view.tier;
    paint.cellBlocks = cellBlocks;
    paint.cols = cols;
    paint.rows = rows;
    paint.cs = cs;
    paint.floor = document.createElement('canvas');
    paint.floor.width = cols;
    paint.floor.height = rows;
    paint.floorCtx = paint.floor.getContext('2d');
    if (!paint.floorCtx) {
      paint.image = null;
      paint.flags = new Uint8Array(cols * rows);
      return false;
    }
    paint.image = paint.floorCtx.createImageData(cols, rows);
    const data = paint.image.data;
    for (let index = 3; index < data.length; index += 4) data[index] = 255;
    paint.flags = new Uint8Array(cols * rows);
    paint.originX = view.center[0] - (canvas.width / 2) * mpp;
    paint.originZ = view.center[1] - (canvas.height / 2) * mpp;
    paint.nextRow = 0;
    paint.done = false;
    prevRowHeights = new Float32Array(cols);
    return true;
  };

  /* ---------- цвет точки ---------- */

  const write = (col, row, r, g, b) => {
    const offset = (row * paint.cols + col) * 4;
    const data = paint.image.data;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    paint.flags[row * paint.cols + col] = 1;
  };

  /** Клетка за краем мира: там ничего нет, и вид говорит об этом фоном. */
  const writeVoid = (col, row) => {
    const offset = (row * paint.cols + col) * 4;
    const data = paint.image.data;
    data[offset] = 10;
    data[offset + 1] = 15;
    data[offset + 2] = 22;
    paint.flags[row * paint.cols + col] = 1;
  };

  /**
   * Цвет одной клетки. Сюда сходятся все правила окраски: слой решает, что
   * именно спрашивают у мира, а форма ответа одна — три канала.
   */
  const colorAt = (x, z, col, row, cellBlocks) => {
    const layer = view.layer;
    if (layer === 'blocks') {
      world.columnAt(x, z, scratchColumn);
      const height = scratchColumn[C.HEIGHT];
      const y = clamp(Math.round(view.tier), 0, WORLD_Y - 1);
      const block = world.blockInColumn(x, y, z, scratchColumn);
      /* Плоскость реза выше поверхности — значит смотрим на верх мира, а не
         внутрь: показываем тот блок, на который падает свет. Иначе на обзорном
         масштабе весь материк оказался бы небом. */
      const skin = y > height;
      if (block === 0) {
        if (skin) {
          const top = world.blockInColumn(x, height, z, scratchColumn) || scratchColumn[C.SURFACE];
          const [sr, sg, sb] = blockRgb(top);
          write(col, row, sr * 0.9, sg * 0.9, sb * 0.9);
          return height;
        }
        /* Ниже поверхности пустота — это пещера: чем глубже, тем темнее. */
        const fade = clamp((height - y) / 120, 0, 1);
        write(col, row, 42 - fade * 18, 46 - fade * 18, 56 - fade * 16);
        return height;
      }
      const [br, bg, bb] = blockRgb(block);
      let r = br;
      let g = bg;
      let b = bb;
      if (isGrassy(block)) {
        const tint = GRASS_TINT[scratchColumn[C.BIOME]] ?? [br, bg, bb];
        r = (r + tint[0]) * 0.5;
        g = (g + tint[1]) * 0.5;
        b = (b + tint[2]) * 0.5;
      }
      /* Тень по высоте: без неё срез выглядит плоской заливкой. */
      const shade = 1 + clamp((height - 64) / 160, -0.22, 0.3);
      write(col, row, r * shade, g * shade, b * shade);
      return height;
    }
    if (layer === 'continents') {
      /* Материк — это то, что мир перечисляет, а не то, что видно глазом:
         цвет берётся у куска суши, а не у высоты или биома. */
      const component = world.grid ? world.grid.componentAt(x, z) : null;
      if (!component) {
        /* Океан: у суши свой цвет, у моря — общий фон. */
        world.columnAt(x, z, scratchColumn);
        const sea = scratchColumn[C.WATER] !== WATER_NONE;
        write(col, row, sea ? 24 : 30, sea ? 44 : 48, sea ? 72 : 62);
        return scratchColumn[C.HEIGHT];
      }
      const hue = (component.id * 0.6180339887) % 1;
      const [r, g, b] = hsl(hue, component.continent ? 0.44 : 0.2, component.continent ? 0.56 : 0.62);
      write(col, row, r, g, b);
      return world.grid.heightAt(x, z);
    }
    if (layer === 'villages') {
      world.columnAt(x, z, scratchColumn);
      const height = scratchColumn[C.HEIGHT];
      const village = world.villageAt(x, z);
      if (village) {
        const near = clamp(1 - village.distance / Math.max(1, village.radius), 0, 1);
        write(col, row, 140 + near * 60, 112 + near * 52, 74 + near * 40);
        return height;
      }
      const index = scratchColumn[C.BIOME] * 3;
      write(col, row, BIOME_COLORS[index] * 0.62, BIOME_COLORS[index + 1] * 0.62, BIOME_COLORS[index + 2] * 0.62);
      return height;
    }

    /* Карты поверхности: рельеф, климат, осадки, биомы. */
    world.sampleInto(x, z, detailFor(cellBlocks), scratchSample);
    const height = scratchSample[S.HEIGHT];
    if (layer === 'relief') {
      /* Высота в метрах: там, где вода, шкала уходит вглубь, а на суше —
         вверх от берега. Так цвета совпадают с числами в строке состояния. */
      const meters = scratchSample[S.WATER] !== WATER_NONE
        ? elevationMeters(Math.min(height, SEA_LEVEL))
        : elevationMeters(height);
      const [r, g, b] = paletteAt(HYPSOMETRY, meters);
      write(col, row, r, g, b);
      return height;
    }
    if (layer === 'climate') {
      const [r, g, b] = palette(TEMPERATURE, (scratchSample[S.TEMPERATURE] + 1) / 2);
      write(col, row, r, g, b);
      return height;
    }
    if (layer === 'rain') {
      const [r, g, b] = palette(PRECIPITATION, clamp(scratchSample[S.PRECIPITATION] / 2400, 0, 1));
      write(col, row, r, g, b);
      return height;
    }
    const biome = scratchSample[S.BIOME];
    const index = biome * 3;
    const water = scratchSample[S.WATER];
    if (water !== WATER_NONE) {
      /* Вода темнеет с глубиной — это единственная «высота» на морской карте. */
      const deep = clamp((scratchSample[S.WATER_Y] - height) / 46, 0, 1);
      const light = water === 2 || water === 3 ? 1.12 : 1;
      write(col, row,
        BIOME_COLORS[index] * (1 - deep * 0.4) * light,
        BIOME_COLORS[index + 1] * (1 - deep * 0.4) * light,
        BIOME_COLORS[index + 2] * (1 - deep * 0.32) * light);
      return height;
    }
    const shade = clamp((height - SEA_LEVEL) / 220, -0.14, 0.2);
    write(col, row,
      BIOME_COLORS[index] * (1 + shade),
      BIOME_COLORS[index + 1] * (1 + shade),
      BIOME_COLORS[index + 2] * (1 + shade));
    return height;
  };

  /* Высоты двух последних строк: по ним считается отмывка склонов — сосед
     слева и сверху уже посчитан, поэтому отмывка достаётся даром. */
  let heightsPrev = new Float32Array(0);
  let heightsRow = new Float32Array(0);

  const paintRow = (row) => {
    if (heightsPrev.length !== paint.cols) {
      heightsPrev = new Float32Array(paint.cols);
      heightsRow = new Float32Array(paint.cols);
    }
    const layer = view.layer;
    const z = paint.originZ + (row + 0.5) * paint.cellBlocks;
    const rowStart = row * paint.cols;
    /* Строка целиком за краем мира — весь ряд фон. */
    const rowOutside = z < 0 || z >= planet.height;
    let leftHeight = Number.NaN;
    for (let col = 0; col < paint.cols; col += 1) {
      const index = rowStart + col;
      const x = paint.originX + (col + 0.5) * paint.cellBlocks;
      if (rowOutside || x < 0 || x >= planet.width) {
        if (!paint.flags[index]) writeVoid(col, row);
        heightsRow[col] = Number.NaN;
        leftHeight = Number.NaN;
        continue;
      }
      const height = paint.flags[index] ? heightsPrev[col] : colorAt(x, z, col, row, paint.cellBlocks);
      heightsRow[col] = height;
      if ((layer === 'relief' || layer === 'biome') && !paint.flags[index]) {
        /* Склон: разница с левым и верхним соседом, в блоках на клетку. */
        let slope = 0;
        if (Number.isFinite(leftHeight)) slope += (height - leftHeight) / 22;
        if (row > 0) slope += (height - heightsPrev[col]) / 22;
        if (slope) {
          const east = clamp(1 + clamp(slope, -0.4, 0.4), 0.62, 1.38);
          const offset = index * 4;
          const data = paint.image.data;
          data[offset] *= east;
          data[offset + 1] *= east;
          data[offset + 2] *= east;
        }
      }
      leftHeight = height;
    }
    const swap = heightsPrev;
    heightsPrev = heightsRow;
    heightsRow = swap;
  };

  /* ---------- слой поверх картинки: реки, деревни, отметки ---------- */

  const drawOverlays = () => {
    if (!context) return;
    const mpp = blocksPerPixel();
    const halfW = (canvas.width / 2) * mpp;
    const halfZ = (canvas.height / 2) * mpp;
    const x0 = view.center[0] - halfW;
    const z0 = view.center[1] - halfZ;
    const x1 = view.center[0] + halfW;
    const z1 = view.center[1] + halfZ;
    const layer = view.layer;

    /* Реки линиями — но только с того масштаба, где они читаются сетью.
       Речная сетка мира грубая (клетка ≈ 104 км), и на обзорном кадре, где
       пиксель покрывает десятки километров, прямые пробеги D8 превращаются в
       длинные линейки через полкарты. Настоящие карты так же не рисуют реку
       тоньше пикселя: она появляется, когда её видно. */
    const hydro = world.hydro;
    const showRivers = mpp <= 8192 && (layer === 'biome' || layer === 'relief' || layer === 'rain' || layer === 'continents');
    if (hydro && showRivers) {
      context.lineWidth = mpp >= 256 ? 1.5 : 2;
      context.strokeStyle = layer === 'relief' ? 'rgba(74,140,214,0.9)' : 'rgba(96,168,244,0.92)';
      context.beginPath();
      for (const segment of hydro.segments) {
        if (segment.x0 < x0 - 200_000 || segment.x0 > x1 + 200_000) continue;
        if (segment.z0 < z0 - 200_000 || segment.z0 > z1 + 200_000) continue;
        context.moveTo((segment.x0 - x0) / mpp, (segment.z0 - z0) / mpp);
        context.lineTo((segment.x1 - x0) / mpp, (segment.z1 - z0) / mpp);
      }
      context.stroke();
      /* Озёра: клетка гидрологии заливается целиком — на этом масштабе её
         границы и есть форма озера. */
      context.fillStyle = 'rgba(72,132,230,0.8)';
      const cellW = hydro.cellW;
      const cellH = hydro.cellH;
      const cx0 = Math.max(0, Math.floor((x0 - cellW) / cellW));
      const cx1 = Math.min(hydro.cols - 1, Math.ceil((x1 + cellW) / cellW));
      const cy0 = Math.max(0, Math.floor((z0 - cellH) / cellH));
      const cy1 = Math.min(hydro.rows - 1, Math.ceil((z1 + cellH) / cellH));
      for (let cy = cy0; cy <= cy1; cy += 1) {
        for (let cx = cx0; cx <= cx1; cx += 1) {
          if (!hydro.isLake[cy * hydro.cols + cx]) continue;
          context.fillRect((cx * cellW - x0) / mpp, (cy * cellH - z0) / mpp, cellW / mpp, cellH / mpp);
        }
      }
    }

    /* Деревни: точка и имя. Список берётся прямоугольником кадра — их немного. */
    if (mpp <= 24) {
      const villages = world.villagesIn(x0, z0, x1, z1).slice(0, VILLAGE_LIMIT);
      context.font = '600 11px system-ui, sans-serif';
      context.textBaseline = 'middle';
      for (const village of villages) {
        const px = (village.x - x0) / mpp;
        const pz = (village.z - z0) / mpp;
        context.beginPath();
        context.arc(px, pz, 3, 0, Math.PI * 2);
        context.fillStyle = '#e8d9a0';
        context.fill();
        context.strokeStyle = 'rgba(18,24,30,0.9)';
        context.lineWidth = 1;
        context.stroke();
        if (mpp <= 8) {
          context.fillStyle = 'rgba(12,18,24,0.75)';
          context.fillText(village.name, px + 5, pz + 0.5);
          context.fillStyle = '#f2e6c0';
          context.fillText(village.name, px + 5, pz);
        }
      }
    }

    /* Точка появления и курсор: две отметки, которые есть всегда. */
    const spawn = world.ready ? world.spawn() : null;
    if (spawn && spawn.x >= x0 - mpp * 20 && spawn.x <= x1 + mpp * 20 && spawn.z >= z0 - mpp * 20 && spawn.z <= z1 + mpp * 20) {
      const px = (spawn.x - x0) / mpp;
      const pz = (spawn.z - z0) / mpp;
      context.strokeStyle = 'rgba(16,22,28,0.9)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(px - 7, pz);
      context.lineTo(px + 7, pz);
      context.moveTo(px, pz - 7);
      context.lineTo(px, pz + 7);
      context.stroke();
      context.strokeStyle = '#f3f5f8';
      context.lineWidth = 1.5;
      context.stroke();
    }
    if (view.cursor) {
      const [px, pz] = view.cursor;
      context.strokeStyle = 'rgba(255,255,255,0.55)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(px - 6, pz);
      context.lineTo(px + 6, pz);
      context.moveTo(px, pz - 6);
      context.lineTo(px, pz + 6);
      context.stroke();
    }

    /* Масштабная линейка: без неё «1 px = 4 бл.» ничего не говорит о мире. */
    const barPx = Math.min(canvas.width * 0.32, 220);
    const barBlocks = barPx * mpp;
    const barKm = barBlocks / 1000;
    context.fillStyle = 'rgba(12,18,24,0.72)';
    context.fillRect(12, canvas.height - 26, barPx + 16, 18);
    context.strokeStyle = 'rgba(240,244,248,0.85)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(20, canvas.height - 12.5);
    context.lineTo(20 + barPx, canvas.height - 12.5);
    context.moveTo(20, canvas.height - 16.5);
    context.lineTo(20, canvas.height - 8.5);
    context.moveTo(20 + barPx, canvas.height - 16.5);
    context.lineTo(20 + barPx, canvas.height - 8.5);
    context.stroke();
    context.fillStyle = 'rgba(240,244,248,0.92)';
    context.font = '500 10px system-ui, sans-serif';
    context.fillText(barKm >= 1000 ? `${digits(barKm / 1000)} тыс. км` : `${digits(barKm)} км`, 28, canvas.height - 11);
  };

  const render = () => {
    if (!context || !paint.floor) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(paint.floor, 0, 0, paint.cols, paint.rows, 0, 0, canvas.width, canvas.height);
    drawOverlays();
  };

  /* ---------- подписи, легенда, подсказка ---------- */

  const syncLabels = () => {
    const mpp = blocksPerPixel();
    zoomValue.textContent = mpp <= 1 ? '1 блок = 1 px' : `1 px = ${digits(mpp)} бл.`;
    const tier = Math.round(view.tier);
    const meters = elevationMeters(tier);
    levelValue.textContent = `ярус ${tier} · ${digits(Math.abs(meters))} м ${meters >= 0 ? 'над морем' : 'под морем'}`;
    slider.value = String(tier);
    tierRow.hidden = view.layer !== 'blocks';
    presetHost.hidden = view.layer !== 'blocks';
    for (const chip of presetHost.querySelectorAll('[data-tier]')) {
      const on = chip.dataset.tier === view.tierPreset;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (const chip of layerHost.querySelectorAll('[data-layer]')) {
      const on = chip.dataset.layer === view.layer;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };

  const updateLegend = () => {
    if (view.layer === 'blocks') {
      legendHost.innerHTML = [
        ['вода', 30], ['песок', 18], ['дёрн', 13], ['камень', 1], ['сланец', 2], ['уголь', 61], ['железо', 62], ['алмаз', 67],
      ].map(([name, id]) => {
        const rgb = blockRgb(id);
        return `<span class="world-voxel-legend__item"><i style="background:rgb(${rgb[0]},${rgb[1]},${rgb[2]})"></i>${name}</span>`;
      }).join('');
      return;
    }
    if (view.layer === 'biome' || view.layer === 'villages') {
      legendHost.innerHTML = BIOMES
        .filter((biome) => biome.category !== 'ocean' || biome.key === 'ocean')
        .slice(0, 10)
        .map((biome) => {
          const rgb = rgbOf(biome.color);
          return `<span class="world-voxel-legend__item"><i style="background:rgb(${rgb[0]},${rgb[1]},${rgb[2]})"></i>${biome.name}</span>`;
        })
        .join('');
      return;
    }
    if (view.layer === 'continents') {
      legendHost.innerHTML = '<span class="world-voxel-legend__item">цвет — свой у каждого куска суши, бледный у островов</span>';
      return;
    }
    legendHost.innerHTML = '';
  };

  const updateHud = () => {
    const mpp = blocksPerPixel();
    const x = clamp(Math.round(view.center[0] + (view.cursor ? (view.cursor[0] - canvas.width / 2) * mpp : 0)), 0, planet.width - 1);
    const z = clamp(Math.round(view.center[1] + (view.cursor ? (view.cursor[1] - canvas.height / 2) * mpp : 0)), 0, planet.height - 1);
    const info = world.columnInfo(x, z);
    view.cursorInfo = info;
    const geo = world.geoAt(x, z);
    const parts = [
      `${digits(x)}, ${digits(z)}`,
      `${geo.lat.toFixed(1).replace('.', ',')}° ш., ${geo.lon.toFixed(1).replace('.', ',')}° д.`,
      biomeName(info.biome),
      `${info.height} бл. (${digits(info.height >= SEA_LEVEL ? elevationMeters(info.height) : -elevationMeters(info.height))} м)`,
      `${(info.temperature * 40).toFixed(0)} °C`,
      `${digits(info.precipitation)} мм`,
    ];
    const continent = world.continentAt(x, z);
    if (continent?.name) parts.push(`${continent.name} · ${areaLabel(continent.areaKm2)}`);
    if (info.water === 2) parts.push(`река ${digits(Math.round(info.riverWidth))} бл., водосбор ${areaLabel(info.riverArea)}`);
    else if (info.water === 3) parts.push(`озеро глубиной ${info.lakeDepth.toFixed(1).replace('.', ',')} бл.`);
    if (info.structure) parts.push(`деревня «${info.structure}»`);
    if (view.layer === 'blocks') {
      const block = world.blockInColumn(x, Math.round(view.tier), z, scratchColumn);
      parts.push(block ? `${blockName(block)} на ярусе ${Math.round(view.tier)}` : 'пусто');
    }
    if (!paint.done && paint.rows) parts.push(`рисую ${Math.round((paint.nextRow / paint.rows) * 100)} %`);
    hud.textContent = parts.join(' · ');
  };

  const setNote = (text) => {
    note.textContent = text ?? '';
    note.hidden = !text;
  };

  const syncWorld = () => {
    if (world.ready) {
      if (view.waiting) {
        view.waiting = false;
        waitBox.hidden = true;
        view.revision = world.revision;
        /* До первой стройки центр мира — середина карты; после неё честнее
           показать точку появления, если игрок ещё ничего не трогал. */
        if (!view.centered) {
          const spawn = world.spawn();
          if (spawn?.x) {
            view.center = [spawn.x, spawn.z];
            view.centered = true;
            setNote(`Точка появления: ${digits(spawn.x)}, ${digits(spawn.z)} — ${biomeName(world.columnInfo(spawn.x, spawn.z).biome)}.`);
          }
        }
        layout();
        syncContinents();
        setNoteOnce();
      }
      return;
    }
    waitText.textContent = `${STAGE_LABEL[world.stage] ?? 'Строю мир'}…`;
    progressBar.style.width = world.stage === STAGE.CONTINENTS ? '15%' : world.stage === STAGE.TERRAIN ? '35%' : '65%';
  };

  /** Первая записка о мире: что за мир получился — одной строкой. */
  let noteShown = false;
  const setNoteOnce = () => {
    if (noteShown) return;
    noteShown = true;
    if (note.hidden) setNote(world.summary());
  };

  const syncContinents = () => {
    const list = world.grid?.continents ?? [];
    if (!list.length || continentHost.childElementCount === list.length) return;
    continentHost.innerHTML = list
      .slice(0, 8)
      .map((continent) => `<button class="world-voxel-chip" type="button" data-continent="${continent.name}" title="${areaLabel(continent.areaKm2)}">${continent.name}</button>`)
      .join('');
    for (const chip of continentHost.querySelectorAll('[data-continent]')) {
      chip.addEventListener('click', () => {
        const continent = list.find((item) => item.name === chip.dataset.continent);
        if (!continent) return;
        view.center = [continent.centerX, continent.centerZ];
        /* Масштаб подбирается так, чтобы материк занял примерно половину
           полотна: у материков разная площадь, и общий уровень им не годится. */
        const spanBlocks = Math.max(continent.widthKm, continent.heightKm) * 1000;
        const wanted = Math.floor(Math.log2(Math.max(1, spanBlocks / Math.max(200, canvas.width))));
        view.level = clamp(maxLevel - wanted, 0, maxLevel);
        view.centered = true;
        setNote(`${continent.name}: ${areaLabel(continent.areaKm2)}, ${digits(continent.widthKm)} × ${digits(continent.heightKm)} км.`);
        layout();
        syncLabels();
      });
    }
  };

  /* ---------- управление ---------- */

  const clampCenter = () => {
    view.center[0] = clamp(view.center[0], 0, planet.width - 1);
    view.center[1] = clamp(view.center[1], 0, planet.height - 1);
  };
  const zoom = (delta, anchor = null) => {
    const next = clamp(view.level + delta, 0, maxLevel);
    if (next === view.level) return;
    const mppBefore = blocksPerPixel();
    view.level = next;
    const mppAfter = blocksPerPixel();
    if (anchor) {
      /* Мир под точкой экрана остаётся на месте: центр сдвигается на разницу
         «сколько блоков было под пикселем». */
      view.center[0] += anchor[0] * (mppBefore - mppAfter);
      view.center[1] += anchor[1] * (mppBefore - mppAfter);
    }
    clampCenter();
    layout();
    syncLabels();
  };
  const panBy = (dxPixels, dyPixels) => {
    const mpp = blocksPerPixel();
    view.center[0] += dxPixels * mpp;
    view.center[1] += dyPixels * mpp;
    clampCenter();
    layout();
  };
  const toSpawn = () => {
    const spawn = world.spawn();
    if (!spawn?.x) return;
    view.center = [spawn.x, spawn.z];
    view.centered = true;
    view.level = mode === 'blocks' ? Math.max(0, maxLevel - 3) : Math.max(0, maxLevel - 9);
    clampCenter();
    layout();
    syncLabels();
    setNote(`Точка появления: ${digits(spawn.x)}, ${digits(spawn.z)} — ${biomeName(world.columnInfo(spawn.x, spawn.z).biome)}.`);
  };
  const toEarth = () => {
    view.center = [planet.width / 2, planet.height / 2];
    /* Весь мир целиком: блоков на пиксель берём столько, чтобы в кадр влезла
       большая сторона мира. Округление вниз — чтобы по краям был запас, а не
       обрезка. */
    const mppNeeded = Math.max(planet.width / Math.max(200, canvas.width), planet.height / Math.max(200, canvas.height));
    view.level = clamp(maxLevel - Math.floor(Math.log2(Math.max(1, mppNeeded))), 0, maxLevel);
    view.centered = true;
    layout();
    syncLabels();
    setNote(`Весь мир: ${digits(planet.widthKm)} × ${digits(planet.heightKm)} км, ${world.summary()}`);
  };

  let drag = null;
  listen(canvas, 'pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    canvas.setPointerCapture?.(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    canvas.focus({ preventScroll: true });
  });
  listen(canvas, 'pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    view.cursor = [event.clientX - rect.left, event.clientY - rect.top];
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    panBy(-dx, -dy);
  });
  listen(canvas, 'pointerup', (event) => {
    canvas.releasePointerCapture?.(event.pointerId);
    drag = null;
  });
  listen(canvas, 'pointercancel', () => {
    drag = null;
  });
  listen(canvas, 'pointerleave', () => {
    view.cursor = null;
  });
  listen(canvas, 'wheel', (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoom(-Math.sign(event.deltaY), [event.clientX - rect.left - canvas.width / 2, event.clientY - rect.top - canvas.height / 2]);
  }, { passive: false });
  listen(canvas, 'keydown', (event) => {
    const fast = event.shiftKey ? 240 : 64;
    if (event.key === 'ArrowLeft') panBy(-fast, 0);
    else if (event.key === 'ArrowRight') panBy(fast, 0);
    else if (event.key === 'ArrowUp') panBy(0, -fast);
    else if (event.key === 'ArrowDown') panBy(0, fast);
    else if (event.key === '+' || event.key === '=') zoom(1);
    else if (event.key === '-' || event.key === '_') zoom(-1);
    else if (event.key === 'PageUp') view.tier = clamp(view.tier + 4, 0, WORLD_Y - 1);
    else if (event.key === 'PageDown') view.tier = clamp(view.tier - 4, 0, WORLD_Y - 1);
    else if (event.key === 'r' || event.key === 'R' || event.key === 'к' || event.key === 'К') toSpawn();
    else if (event.key === 'w' || event.key === 'W' || event.key === 'ц' || event.key === 'Ц') toEarth();
    else return;
    event.preventDefault();
    syncLabels();
  });

  presetHost.innerHTML = TIER_PRESETS
    .map((preset) => `<button class="world-voxel-chip" type="button" data-tier="${preset.id}" title="${preset.hint}">${preset.name}</button>`)
    .join('');
  layerHost.innerHTML = LAYERS
    .map((layer) => `<button class="world-voxel-chip" type="button" data-layer="${layer.id}" title="${layer.hint}">${layer.name}</button>`)
    .join('');

  listen(presetHost, 'click', (event) => {
    const chip = event.target.closest?.('[data-tier]');
    if (!chip) return;
    view.tierPreset = chip.dataset.tier;
    const info = view.cursorInfo ?? world.columnInfo(view.center[0], view.center[1]);
    if (view.tierPreset === 'canopy') view.tier = Math.round(info.canopyTop || info.height);
    else if (view.tierPreset === 'surface') view.tier = info.height;
    else if (view.tierPreset === 'sea') view.tier = SEA_LEVEL;
    else if (view.tierPreset === 'caves') view.tier = Math.max(5, info.height - 40);
    else if (view.tierPreset === 'ores') view.tier = 12;
    else if (view.tierPreset === 'bedrock') view.tier = 2;
    layout();
    syncLabels();
  });
  listen(layerHost, 'click', (event) => {
    const chip = event.target.closest?.('[data-layer]');
    if (!chip) return;
    view.layer = chip.dataset.layer;
    if (view.layer === 'blocks') view.tier = view.tierPreset === 'custom' ? view.tier : view.tier;
    layout();
    updateLegend();
    syncLabels();
    setNote(LAYERS.find((layer) => layer.id === view.layer)?.hint ?? '');
  });
  listen(slider, 'input', () => {
    view.tier = clamp(Number(slider.value) || 0, 0, WORLD_Y - 1);
    view.tierPreset = 'custom';
    layout();
    syncLabels();
  });
  for (const button of root.querySelectorAll('[data-voxel-action]')) {
    listen(button, 'click', () => {
      const action = button.dataset.voxelAction;
      if (action === 'spawn') toSpawn();
      else if (action === 'earth') toEarth();
      else if (action === 'exit') options.onExit?.();
      else if (action === 'zoom-in') zoom(1);
      else if (action === 'zoom-out') zoom(-1);
      else if (action === 'level-up') {
        view.tier = clamp(Math.round(view.tier) + 4, 0, WORLD_Y - 1);
        view.tierPreset = 'custom';
        layout();
        syncLabels();
      } else if (action === 'level-down') {
        view.tier = clamp(Math.round(view.tier) - 4, 0, WORLD_Y - 1);
        view.tierPreset = 'custom';
        layout();
        syncLabels();
      }
    });
  }

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (fitCanvas()) layout();
  }) : null;
  resizeObserver?.observe(canvas);
  cleanups.push(() => resizeObserver?.disconnect());

  /* ---------- кадр ---------- */

  let raf = 0;
  let running = true;
  let hudStamp = 0;
  const frame = (now) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!world.ready) {
      world.step(10);
      syncWorld();
    }
    if (fitCanvas()) layout();
    /* Строки: считаем, пока не вышел бюджет кадра. Готовое рисуется сразу —
       карта проявляется сверху вниз, а не появляется целиком в конце. */
    if (!paint.done && paint.image && context) {
      const started = performance.now();
      while (!paint.done && performance.now() - started < PAINT_BUDGET_MS) {
        if (paint.nextRow >= paint.rows) {
          paint.done = true;
          break;
        }
        paintRow(paint.nextRow);
        paint.nextRow += 1;
      }
      paint.floorCtx.putImageData(paint.image, 0, 0);
      progress.classList.toggle('is-on', !paint.done);
      progressBar.style.width = `${Math.round((paint.nextRow / paint.rows) * 100)}%`;
    } else if (!world.ready) {
      progress.classList.add('is-on');
    } else {
      progress.classList.remove('is-on');
    }
    render();
    if (now - hudStamp > 120) {
      hudStamp = now;
      updateHud();
      syncLabels();
    }
  };

  view.dispose = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    window.clearTimeout(revealTimer);
    for (const cleanup of cleanups.splice(0)) cleanup();
    world.dispose();
    root.remove();
  };

  fitCanvas();
  layout();
  updateLegend();
  syncLabels();
  waitBox.hidden = false;
  waitText.textContent = `${STAGE_LABEL[world.stage] ?? 'Строю мир'}…`;
  render();
  raf = requestAnimationFrame(frame);
  return view;
};
