/* 2D-карта блоками: мир показан слоем (ярусом), а не перспективой.

Ярус Y означает «срезать мир по высоте Y»: столбцы, чья вершина выше

плоскости, показывают свою кожу на этой плоскости (её и видно сверху), а что

ниже Y — читается как есть. Плоский «разрез» по холмистой карте не читается: в

центре острова там один камень, и ни реки, ни берега не увидеть.

Блоки берутся из тех же чанков, что строит генератор: `blockAt`, цвет — из

процедурного атласа, той грани, которая видна сверху. Поэтому картинка слоя

и данные не могут разойтись: и то, и другое — один и тот же массив.

Что рисуется поверх блоков:

• течение — шевроны по направлению стока (D8), фаза бежит по течению,

поэтому движение видно без всякой физики жидкости;

• граница уровня моря — линия там, где суша соседствует с водой;

• отметки высот на вершинах — цифры рисует пиксельный шрифт 3×5, без DOM

и без шрифтов: срез остаётся чистой функцией от данных и проверяется в

Node как обычный модуль.

Ярус ставится ползунком; пресеты считают его по самим данным — где в кадре

больше всего пустот, там пещеры, где больше всего жил, там руды. Так «слой»

не выдуманное число, а ответ на вопрос «что здесь интересного». */

import {
  AIR,
  BLOCKS,
  COAL_ORE,
  GEM_ORE,
  GOLD_ORE,
  GRASS,
  ICE,
  IRON_ORE,
  LAVA,
  SAND,
  STONE,
  WATER,
  isOpaque,
} from './blocks.js';

import { CHUNK_SX, CHUNK_SZ, blockAt, columnBlock, fieldProfile, paletteCache } from './chunk.js';

import { F_BEACH, F_ICE, F_RIVER, F_WATER, flowVector, fold, latticeCell } from './field.js';

/** Пикселей экрана на блок. Ниже 1 — блоки всё равно не разобрать. */

export const ZOOM_MIN = 1;

export const ZOOM_MAX = 8;

export const ZOOM_DEFAULT = 3;

/** Шаг шевронов течения: на каждом блоке стрелки слились бы в кашу. */

const ARROW_STRIDE = 4;

/* Течение рек: световые гребни идут по направлению русла. Период — в блоках,
   скорость — блоков в секунду; амплитуда мала, чтобы вода не мерцала. */
const FLOW_PERIOD = 6;
const FLOW_SPEED = 3.2;
const FLOW_AMPLITUDE = 0.1;

/** Вершины ищем на этой решётке: чаще — цифры шумят, реже — теряются. */

const LABEL_STRIDE = 22;

const SKY = [224, 234, 238];

const VOID = [26, 26, 34];

const COAST = [26, 32, 38];

const LIGHT = [250, 252, 250];

/* ---------- ярусы и пресеты ---------- */

/**

* Что за зона под ползунком — по поверхности конкретной колонки, а не по

* «средней высоте мира»: на склоне подпись обязана меняться.

*/

/**

* Подпись под ползунком: что именно показывает выбранный ярус. `ground` —

* медианная высота рельефа в кадре; без неё не отличить «срез выше вершин»

* (карта как есть) от «срез в толще породы».

*/

export const zoneName = (field, level, ground) => {
  if (level >= field.worldHeight - 1) return 'выше всех вершин — мир не срезан';

  if (level <= 2) return 'основание мира: бедрок';

  if (!Number.isFinite(ground)) return 'ярус вне кадра';

  if (level >= ground) return 'выше вершин кадра — рельеф не тронут';

  if (level > field.seaY) return ground - level > 24 ? 'склоны и плато в срезе' : 'холмы у воды в срезе';

  if (level > field.seaY - 12) return 'зеркало водоёмов, русла и отмели';

  return 'толща под водой: пещеры и жилы';
};

export const LAYER_PRESETS = [
  { id: 'canopy', name: 'Кроны', hint: 'горы срезаны до крон: видно, где лес сомкнут' },

  { id: 'surface', name: 'Поверхность', hint: 'верхний ярус: ничего не срезано — обычная карта' },

  { id: 'sea', name: 'Вода', hint: 'уровень моря и озёр: русла, поймы, берега' },

  { id: 'bottom', name: 'Дно', hint: 'на 4 блока ниже: дно, отмели, обрывы' },

  { id: 'caves', name: 'Пещеры', hint: 'ярус, где в грунте больше всего пустот' },

  { id: 'ores', name: 'Руды', hint: 'ярус, где в кадре больше всего жил' },

  { id: 'root', name: 'Основание', hint: 'зубчатый слой бедрока внизу мира' },
];

const levelsBetween = (from, to, step) => {
  const list = [];

  for (let y = from; y <= to; y += step) list.push(y);

  if (list.length && list[list.length - 1] !== to) list.push(to);

  return list;
};

/** Кадр в блоках: левый верхний угол и размер. Общие вычисления для всех функций. */

export const makeView = (center, cellsX, cellsZ) => ({
  x0: Math.round(center[0] - cellsX / 2),

  z0: Math.round(center[1] - cellsZ / 2),

  cellsX: Math.max(1, Math.round(cellsX)),

  cellsZ: Math.max(1, Math.round(cellsZ)),
});

const sampleView = (field, view, stepX, stepZ, visit) => {
  for (let cz = 0; cz < view.cellsZ; cz += stepZ) {
    for (let cx = 0; cx < view.cellsX; cx += stepX) {
      const x = view.x0 + cx;

      const z = view.z0 + cz;

      const { u, v } = fold(field, x, z);

      visit(v * field.width + u, x, z);
    }
  }
};

/** Медиана поверхности по кадру: по ней ставятся «поверхность» и «кроны». */

/**

* Медианная высота рельефа в кадре. `dry: true` считает только сушу над морем:

* в кадре, где половина — океан, общая медиана лежит на дне, и «Кроны» сели бы

* по дно водоёмов вместо верхушек.

*/

const medianGround = (field, view, { dry = false } = {}) => {
  const values = [];

  const land = [];

  sampleView(field, view, Math.max(1, Math.round(view.cellsX / 24)), Math.max(1, Math.round(view.cellsZ / 24)), (i) => {
    const height = field.ground[i];

    values.push(height);

    if (height > field.seaY) land.push(height);
  });

  const chosen = dry && land.length >= 8 ? land : values;

  if (!chosen.length) return field.seaY + 4;

  chosen.sort((a, b) => a - b);

  return chosen[Math.floor(chosen.length / 2)];
};

const isOre = (id) => id === COAL_ORE || id === IRON_ORE || id === GOLD_ORE || id === GEM_ORE;

/**

* Ярус, где в кадре больше всего подходящих блоков. Считается по построенным

* чанкам через переданный доступ к блокам — так функция проверяется в Node без

* хранилища и без браузера.

*/

const richestLevel = (field, blockAtWorld, view, score) => {
  const bottom = 4;

  /* Верхняя граница — потолок мира, а не «медиана поверхности»: на карте, где

полтора шара — океан, медиана лежит на дне, и с ней из поиска выпадали все

суходольные ярусы, где пещер как раз больше всего. Допустимость столбца

решает проверка «y ниже вершины минус один». */

  const levels = levelsBetween(bottom, field.worldHeight - 2, 3);

  const hits = new Int32Array(levels.length);

  const seen = new Int32Array(levels.length);

  sampleView(
    field,

    view,

    /* ~1200 колонок: больше — не точнее, а клик по пресету начал бы думать. */

    Math.max(1, Math.round(view.cellsX / 36)),

    Math.max(1, Math.round(view.cellsZ / 30)),

    (i, x, z) => {
      const surface = field.ground[i];

      for (let li = 0; li < levels.length; li += 1) {
        const y = levels[li];

        if (y >= surface - 1) continue;

        const id = blockAtWorld(x, y, z);

        if (id === null || id === undefined) continue;

        seen[li] += 1;

        hits[li] += score(id, y, surface);
      }
    },
  );

  /* Доля, а не число: чем глубже, тем больше столбцов «под поверхностью», и по

количеству пустот побеждал бы самый нижний ярус, где пещер нет. */

  let best = -1;

  let bestShare = 0;

  for (let li = 0; li < levels.length; li += 1) {
    if (seen[li] < 24 || hits[li] === 0) continue;

    const share = hits[li] / seen[li];

    if (share > bestShare) {
      bestShare = share;

      best = li;
    }
  }

  return best < 0 ? null : levels[best];
};

/**

* @param {object} field растр из buildField

* @param {(x:number,y:number,z:number)=>number|null} blockAtWorld блок или null, если чанка нет

* @param {object} view кадр в блоках (makeView)

* @param {string} id пресета из LAYER_PRESETS

* @returns {number} ярус

*/

export const presetLevel = (field, blockAtWorld, view, id) => {
  const ground = medianGround(field, view);

  const ceiling = field.worldHeight - 1;

  switch (id) {
    case 'canopy':
      /* Кронами зовём верхушки суши, поэтому медиана берётся по суше. */

      return Math.min(ceiling, medianGround(field, view, { dry: true }) + 5);

    case 'surface':
      return ceiling;

    case 'sea':
      return field.seaY;

    case 'bottom':
      return Math.max(1, field.seaY - 4);

    case 'root':
      return 2;

    case 'caves': {
      /* Пустоты считаем только под поверхностью и выше дна водоёмов, иначе

«пещерой» станет любое мелководье. */

      const hollow = richestLevel(field, blockAtWorld, view, (blockId) => (blockId === AIR ? 1 : 0));

      return hollow ?? Math.max(4, ground - 12);
    }

    case 'ores': {
      const vein = richestLevel(field, blockAtWorld, view, (blockId) => (isOre(blockId) ? 1 : 0));

      return vein ?? Math.max(4, ground - 20);
    }

    default:
      return ceiling;
  }
};

/* ---------- пиксельные примитивы ---------- */

/* Цифры 3×5, верхняя строка первая. Свой шрифт нужен, чтобы отметка высоты

была частью данных среза, а не текстом поверх холста: тогда её видно и на

снимке слоя, и в тесте. */

const DIGITS = [
  ['111', '101', '101', '101', '111'],

  ['010', '110', '010', '010', '111'],

  ['111', '001', '111', '100', '111'],

  ['111', '001', '111', '001', '111'],

  ['101', '101', '111', '001', '001'],

  ['111', '100', '111', '001', '111'],

  ['111', '100', '111', '101', '111'],

  ['111', '001', '010', '010', '010'],

  ['111', '101', '111', '101', '111'],

  ['111', '101', '111', '001', '111'],
];

const GLYPH_W = 3;

const GLYPH_H = 5;

const GLYPH_ADVANCE = 4;

/**

* Затемнение срезанного рельефа. Одной линейной тенью нельзя: на холме в

* 26 блоков она насыщается на первых же 18, и остров превращается в серое

* пятно без единой детали. Поэтому добавлены изогипты — полоса каждые

* CONTOUR шагов, как на топографической карте, плюс медленная общая тень

* глубины.

*/

const CONTOUR = 12;

const bandFactor = (relief) => {
  const band = 1 - 0.22 * (1 - (relief % CONTOUR) / CONTOUR);

  const depth = 1 - Math.min(0.34, relief * 0.008);

  return band * depth;
};

const putPixel = (data, width, height, x, y, rgb, alpha) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;

  const offset = (y * width + x) * 4;

  if (alpha >= 1) {
    data[offset] = rgb[0];

    data[offset + 1] = rgb[1];

    data[offset + 2] = rgb[2];

    data[offset + 3] = 255;

    return;
  }

  data[offset] = Math.round(data[offset] * (1 - alpha) + rgb[0] * alpha);

  data[offset + 1] = Math.round(data[offset + 1] * (1 - alpha) + rgb[1] * alpha);

  data[offset + 2] = Math.round(data[offset + 2] * (1 - alpha) + rgb[2] * alpha);

  data[offset + 3] = 255;
};

/**

* Метка течения: хвост, середина, яркое остриё и два уси по перпендикуляру.

* Геометрия берётся из flowVector (то же D8, что пишет поле), поэтому стрелка

* физически не может разойтись с направлением, а 8 рукописных масок как раз

* расходятся.

*/

const ARROW_RGB = [236, 250, 255];

const drawFlowMark = (data, width, height, x, z, dir, alpha) => {
  const [dx, dz] = flowVector(dir);

  if (!dx && !dz) return;

  const px = dz;

  const pz = -dx;

  putPixel(data, width, height, x - dx, z - dz, ARROW_RGB, alpha * 0.35);

  putPixel(data, width, height, x, z, ARROW_RGB, alpha * 0.75);

  putPixel(data, width, height, x + dx, z + dz, ARROW_RGB, alpha);

  putPixel(data, width, height, x + dx + px, z + dz + pz, ARROW_RGB, alpha * 0.85);

  putPixel(data, width, height, x + dx - px, z + dz - pz, ARROW_RGB, alpha * 0.85);
};

/* ---------- отложенные пометки ---------- */

/* Стрелки течения и береговая линия пишутся и в соседние клетки, а сосед в

основном проходе закрашивается ПОЗЖЕ — наложенный пиксель стирался бы: у

стрелки пропала бы половина, у берега — длинная сторона. Поэтому пометки

сначала копятся, потом накладываются. Буферы общие для модуля и растут по надобности:

за кадр их заводить — значит платить сборщику мусора каждые 70 мс. */

let coastMarks = new Int32Array(0);

let flowMarks = new Float64Array(0);

let coastDone = new Uint8Array(0);

let coastCount = 0;

let flowCount = 0;

const ensureMarks = (cells) => {
  const flowCap = Math.ceil(cells / 8) * 4;

  if (coastMarks.length < cells) coastMarks = new Int32Array(cells);

  if (flowMarks.length < flowCap) flowMarks = new Float64Array(flowCap);

  if (coastDone.length < cells) coastDone = new Uint8Array(cells);
  else coastDone.fill(0, 0, cells);

  coastCount = 0;

  flowCount = 0;
};

/** Один береговой пиксель на клетку: клетка, омываемая водой с двух сторон,

иначе получила бы два затемнения и на песке вместо линии берега появилась бы

чёрная полоса. */

const pushCoast = (cellsX, x, z) => {
  const idx = z * cellsX + x;

  if (coastDone[idx]) return;

  coastDone[idx] = 1;

  coastMarks[coastCount * 2] = x;

  coastMarks[coastCount * 2 + 1] = z;

  coastCount += 1;
};

const drawDigits = (data, width, height, x, y, value, rgb) => {
  const text = String(Math.max(0, Math.round(value)));

  const left = x - 1;

  const right = x + (text.length - 1) * GLYPH_ADVANCE + GLYPH_W;

  /* Плашка под цифрами, а не обводка вокруг каждого пикселя: обводка сливается

в сплошное тёмное пятно размером с саму подпись, и цифр в ней не видно. */

  for (let row = -1; row <= GLYPH_H; row += 1) {
    for (let col = left; col <= right; col += 1) putPixel(data, width, height, col, y + row, COAST, 0.62);
  }

  for (let n = 0; n < text.length; n += 1) {
    const rows = DIGITS[text.charCodeAt(n) - 48];

    if (!rows) continue;

    const glyphLeft = x + n * GLYPH_ADVANCE;

    for (let row = 0; row < GLYPH_H; row += 1) {
      for (let col = 0; col < GLYPH_W; col += 1) {
        if (rows[row][col] === '1') putPixel(data, width, height, glyphLeft + col, y + row, rgb, 1);
      }
    }
  }
};

/* ---------- блоки → цвет ---------- */

const mix = (rgb, factor) => [
  Math.max(0, Math.min(255, Math.round(rgb[0] * factor))),

  Math.max(0, Math.min(255, Math.round(rgb[1] * factor))),

  Math.max(0, Math.min(255, Math.round(rgb[2] * factor))),
];

/** Тайл, которым блок покажется на срезе: сверху — крышка, внутри — бок. */

const tileOf = (id, atSurface) => {
  const block = BLOCKS[id];

  if (!block) return BLOCKS[STONE].top;

  return atSurface ? block.top : block.side;
};

/**

* Цвет блока. Для несуществующих id (чанк ещё не построен) — approximation по

* полю: рельеф тот же, поэтому схема остаётся похожей, а не пустой.

*/

/** Занят ли блок этого столбца водой на выбранном ярусе. */

/**

* Ярус, который реально видно в колонке `i` при срезе `level`: над вершиной

* ничего не срезано, и показываем саму вершину (для воды — её зеркало). То же

* правило внутри buildSlice и в подписи под курсором — иначе HUD начал бы

* называть блок, которого на картинке нет.

*/

export const cutY = (field, i, level) => {
  const ground = field.ground[i];

  const wet = (field.flags[i] & F_WATER) !== 0;

  const crown = wet && field.waterY[i] > ground ? field.waterY[i] : ground;

  return level > crown ? crown : level;
};

/**

* Видно ли в клетке воду при срезе `level`: плоскость стоит в толще воды либо

* выше вершины — тогда клетка показывает зеркало воды. Правило «level ≤

* waterY» сюда не годится: на ярусе выше вершин море остался бы сухим.

*/

const waterShown = (field, i, level, cell) => {
  if ((field.flags[i] & F_WATER) === 0) return false;

  if (field.waterY[i] <= field.ground[i] || level <= field.ground[i]) return false;

  /* Лёд на поверхности — блок, а не жидкость: замёрзшая вода не течёт и не
     пульсирует, и береговая линия не должна обводить её как открытую воду.
     Правило одно с `columnBlock` — иначе лёд спорит с построенными чанками. */

  if ((field.flags[i] & F_ICE) === 0) return true;

  const thickness = field.cellTemp[cell] <= -12 ? 3 : 1;

  return level <= field.waterY[i] - thickness;
};


/* ---------- срез ---------- */

/**

* Один кадр 2D-карты: RGBA по одному пикселю на блок.

*

* @param {object} field

* @param {Array<[number,number,number]>} colors цвета тайлов (buildTileColors)

* @param {{get:(cx:number,cz:number)=>object|null}|null} world хранилище чанков

* @param {object} view кадр в блоках

* @param {{level?:number, time?:number, coast?:boolean, arrows?:boolean, labels?:boolean, shade?:boolean, flow?:boolean}} options

* @returns {{width:number,height:number,data:Uint8ClampedArray,level:number,fromChunks:number,fromField:number,water:number}}

*/

export const buildSlice = (field, colors, world, view, options = {}) => {
  const level = Math.max(0, Math.min(field.worldHeight - 1, Math.round(options.level ?? field.seaY + 4)));

  const cellsX = view.cellsX;

  const cellsZ = view.cellsZ;

  const data = new Uint8ClampedArray(cellsX * cellsZ * 4);

  const time = options.time ?? 0;

  const show = { coast: true, arrows: true, labels: true, shade: true, flow: true, ...options };

  const flowPhase = time * 1.7;

  /* Блоки лежат в чанках, поэтому доступ к ним кешируем по строке: z у строки

один, x идёт подряд — попадание в кеш почти стопроцентное. */

  let cacheRow = null;

  let cache = new Map();

  const chunkOf = (cx, cz) => {
    if (cz !== cacheRow) {
      cacheRow = cz;

      cache = new Map();
    }

    let found = cache.get(cx);

    if (found === undefined) {
      const record = world ? world.get(cx, cz) : null;

      found = record && record.chunk ? record.chunk : null;

      cache.set(cx, found);
    }

    return found;
  };

  let fromChunks = 0;

  let fromField = 0;

  let water = 0;

  /* Пиксель без чанка считается из поля тем же правилом, что строит колонку:
     профиль и палитры клеток держим при кадре, чтобы не собирать их заново на
     каждом пикселе. */
  const pixelProfile = {};
  const pixelPalettes = paletteCache(field);

  ensureMarks(cellsX * cellsZ);

  for (let z = 0; z < cellsZ; z += 1) {
    const wz = view.z0 + z;

    const cz = Math.floor(wz / CHUNK_SZ);

    for (let x = 0; x < cellsX; x += 1) {
      const wx = view.x0 + x;

      const { u, v } = fold(field, wx, wz);

      const i = v * field.width + u;

      const ground = field.ground[i];

      const flags = field.flags[i];

      const wet = (flags & F_WATER) !== 0;

      /* Верхняя граница воды: -1, если столбец сухой. Вершиной столбца вода

считается наравне с грунтом — иначе на уровне моря вместо глади было

бы дно. */

      const waterTop = wet && field.waterY[i] > ground ? field.waterY[i] : -1;

      const crown = waterTop >= 0 ? waterTop : ground;

      const cut = cutY(field, i, level);

      /* Насколько вершина столбца выступает над плоскостью — то же самое, что

глубина среза. Обратно (level - cut) быть не может: тогда «ничего не

срезано» (ярус выше вершин) оказалось бы самым тёмным кадром. */

      const relief = crown > level ? crown - level : 0;

      /* «Вода» — про нарисованный блок, а не про выбранный ярус: стрелки

течения и береговая линия должны появляться и на поверхности (срез выше

вершин), и в толще моря, а не только ровно по зеркалу. */

      let isLiquid = false;

      const chunk = chunkOf(Math.floor(wx / CHUNK_SX), cz);

      let id = null;

      if (chunk) {
        const lx = wx - chunk.x0;

        const lz = wz - chunk.z0;

        if (lx >= 0 && lx < chunk.sx && lz >= 0 && lz < chunk.sz) {
          id = blockAt(chunk, lx, cut, lz);

          fromChunks += 1;
        }
      }

      if (id === null) {
        /* Чанка на этот пиксель ещё нет: блок берётся тем же правилом, что
           строит колонку. Приглушать поле нельзя — граница построенных чанков
           читалась бы прямоугольником на всю загруженную область. */
        id = columnBlock(cut, fieldProfile(field, u, v, i, pixelProfile, pixelPalettes));

        fromField += 1;
      }

      let rgb;

      let alpha = 1;

      if (id === AIR) {
        /* Пусто внутри грунта — это пещера: её надо видеть чёрной дырой,

а не небом. Снаружи (выше вершины) — небо. */

        rgb = cut < ground ? VOID : SKY;
      } else if (BLOCKS[id]?.liquid) {
        rgb = colors[BLOCKS[id].top] ?? [70, 130, 180];

        isLiquid = true;

        /* Ровно по зеркалу вода плотная, а та, что досталась «по кожу» после

срезки, чуть прозрачнее — сквозь неё видно дно русла. */

        alpha = id === LAVA ? 1 : cut === waterTop ? 0.92 : 0.8;

        water += 1;
      } else if (!isOpaque(id)) {
        /* Листва и трава полупрозрачны: за ними должен читаться грунт, иначе

кроны сливаются в сплошной ковёр без единой детали. */

        const below = chunk ? blockAt(chunk, wx - chunk.x0, Math.max(0, cut - 1), wz - chunk.z0) : AIR;

        const base = below !== AIR ? (colors[tileOf(below, false)] ?? SKY) : SKY;

        rgb = blend(mix(base, 0.9), colors[tileOf(id, true)] ?? [90, 140, 70], 0.72);
      } else {
        rgb = colors[tileOf(id, cut >= crown)] ?? [120, 120, 128];
      }

      if (show.shade) rgb = mix(rgb, reliefFactor(field, i, cut, ground));

      /* Вода в русле течёт: гребень проходит по направлению D8 и возвращается,
         так что русло «дышит» на месте, а не просто мигает. */
      if (show.flow && isLiquid && (field.flags[i] & F_RIVER) !== 0) {
        const dir = field.flow[i] & 15;

        if (dir) {
          const [fx, fz] = flowVector(dir);

          const along = (wx * fx + wz * fz) / FLOW_PERIOD - time * (FLOW_SPEED / FLOW_PERIOD);

          const crest = 0.5 + 0.5 * Math.sin(along * Math.PI * 2);

          rgb = mix(rgb, 1 + FLOW_AMPLITUDE * (crest - 0.5) * 2);
        }
      }

      /* То, что ушло под плоскость, темнее: тень по глубине среза читается как

изогипты и не даёт картинке превратиться в кашу. */

      if (relief > 0) rgb = mix(rgb, bandFactor(relief));

      const offset = (z * cellsX + x) * 4;

      data[offset] = rgb[0];

      data[offset + 1] = rgb[1];

      data[offset + 2] = rgb[2];

      data[offset + 3] = Math.round(alpha * 255);

      if (show.coast) {
        /* Линия воды — граница «занято / свободно» по текущему ярусу: русла,

озёра и море обведены одним правилом, поэтому берег реки виден и на

поверхности, и на затопленном ярусе. Рисуем её по сухую сторону:

иначе русло шириной в две клетки целиком закрашивается берегом, и вода

в реке исчезает. */

        if (x + 1 < cellsX && waterShown(field, i + 1, level, latticeCell(field, u + 1, v)) !== isLiquid) {
          pushCoast(cellsX, isLiquid ? x + 1 : x, z);
        }

        if (z + 1 < cellsZ && waterShown(field, i + field.width, level, latticeCell(field, u, v + 1)) !== isLiquid) {
          pushCoast(cellsX, x, isLiquid ? z + 1 : z);
        }
      }

      /* Решётка — по мировым координатам, иначе при перетаскивании стрелки

скользили бы по руслу туда-сюда вместо того, чтобы стоять на воде. */

      if (show.arrows && isLiquid && wx % ARROW_STRIDE === 0 && wz % ARROW_STRIDE === 0) {
        const dir = field.flow[i] & 15;

        if (dir) {
          const pulse = 0.5 + 0.5 * Math.abs(Math.sin(flowPhase + (wx + wz) * 0.16));

          flowMarks[flowCount * 4] = x;

          flowMarks[flowCount * 4 + 1] = z;

          flowMarks[flowCount * 4 + 2] = dir;

          flowMarks[flowCount * 4 + 3] = 0.4 + 0.6 * pulse;

          flowCount += 1;
        }
      }
    }
  }

  for (let n = 0; n < coastCount; n += 1) {
    putPixel(data, cellsX, cellsZ, coastMarks[n * 2], coastMarks[n * 2 + 1], COAST, 0.45);
  }

  for (let n = 0; n < flowCount; n += 1) {
    drawFlowMark(
      data,
      cellsX,
      cellsZ,
      flowMarks[n * 4],
      flowMarks[n * 4 + 1],
      flowMarks[n * 4 + 2] | 0,
      flowMarks[n * 4 + 3],
    );
  }

  if (show.labels) labelPeaks(field, view, data, cellsX, cellsZ);

  return { width: cellsX, height: cellsZ, data, level, fromChunks, fromField, water };
};

const rgbOf = (colors, id) => colors[tileOf(id, false)] ?? [120, 120, 128];

const blend = (a, b, t) => [
  Math.round(a[0] * (1 - t) + b[0] * t),

  Math.round(a[1] * (1 - t) + b[1] * t),

  Math.round(a[2] * (1 - t) + b[2] * t),
];

/** Свет от рельефа: склон к западу и к «северу» темнее, отлогое — светлее. */

const reliefFactor = (field, i, level, ground) => {
  if (level > ground) return 1;

  const west = i > 0 ? field.ground[i - 1] : ground;

  const north = i >= field.width ? field.ground[i - field.width] : ground;

  const slope = ground - west + (ground - north);

  return 1 + Math.max(-0.3, Math.min(0.24, slope * 0.055));
};

/** Отметки высот: локальные максимумы поверхности на coarse-решётке. */

const labelPeaks = (field, view, data, cellsX, cellsZ) => {
  const step = LABEL_STRIDE;

  for (let z = 0; z + GLYPH_H < cellsZ; z += step) {
    /* Плато даёт целую вереницу одинаковых отметок: соседние узлы решётки

стоящие на одной высоте. В пределах строки повторяющуюся высоту не

дублируем — иначе карта покрывается рядами «160 160 160». */

    let rowHeight = -1;

    for (let x = 0; x + GLYPH_W * 3 + 2 < cellsX; x += step) {
      const wx = view.x0 + x;

      const wz = view.z0 + z;

      const here = fold(field, wx, wz);

      const i = here.v * field.width + here.u;

      const ground = field.ground[i];

      if (ground <= field.seaY + 4) continue; // воду и отмели не подписываем

      /* Вершину ищем среди узлов той же решётки, а не среди соседних клеток:

детали рельефа делают каждый «склоном», и на шумном профиле локальных

максимумов не нашлось бы вовсе. */

      let peak = true;

      for (let dz = -1; dz <= 1 && peak; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dz) continue;

          const n = fold(field, wx + dx * step, wz + dz * step);

          if (field.ground[n.v * field.width + n.u] > ground) {
            peak = false;

            break;
          }
        }
      }

      if (!peak) continue;

      if (ground === rowHeight) continue;

      rowHeight = ground;

      /* Отметка — высота холма в блоках (тот же масштаб, что у ползунка), а не

уровень среза: по метке должно быть видно, что именно срезали. */

      drawDigits(data, cellsX, cellsZ, x, z, ground, LIGHT);
    }
  }
};
