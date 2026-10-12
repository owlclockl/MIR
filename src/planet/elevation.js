/* Рельеф планеты: высоты в шкале Azgaar и пирамида тайлов.

   Высоты живут в единицах Azgaar: 0…100, уровень моря — 20. Сделано затем, чтобы
   правила, перенесённые из генератора (биомы по влажности и температуре, «земля
   начинается с 20», ширина реки из стока), работали без пересчёта: смотри
   docs/planet-map.md, раздел «Что взято из Azgaar». Сама шкала — в `zscale.js`.

   **География бывает двух видов.** Если к миру приложен снимок карт Azgaar
   (`src/planet/source.js`), материки, берега и долины берутся из него: базовое
   поле — высоты генератора, переведённые в z-шкалу, а шуму остаётся деталь
   мельче клетки источника. Тогда берег карты планеты лежит ровно там, где берег
   нарисован на карте, — это не «похожая форма», а те же самые границы.
   Снимка нет — включается процедурная география: сумма октав, где континенты
   рисует нулевая октава.

   Как устроена пирамида. Поле высот — сумма октав:

       F(p) = base(p) + fade(p) · [ Σ aᵢ·n(p/λᵢ) + belt(p)·Σ rᵢ·(1 − |n(p/λᵢ)|) − C ]

   Она линейна по октавам, и это главное свойство: тайл уровня L не считает
   заново двадцать одну октаву, а берёт родителя (уровень L−1), растягивает его
   вдвое и добавляет только те октавы, которые появились на этом уровне, —
   обычно одну-две. Поэтому цена тайла почти не зависит от приближения. `base` и
   `fade` от уровня не зависят вовсе (они берутся из решётки на весь мир), так
   что растягивание родителя остаётся честным и с приложенной картой.

   Нелинейность (берег, шельф, пологие равнины, глубокие впадины) вынесена из
   суммы в функцию `heightFromRaw`, которая применяется к уже готовому тайлу на
   этапе раскраски. Будь она внутри суммы, растягивание родителя стало бы
   приближением и береговая линия «замылилась» бы до разрешения грубого уровня.

   Как держится берег. Два условия, оба — про `fade`:

     • у берега деталь гаснет до нуля (`fade` разгоняется от 0,35 клетки
       источника до единицы на двух) — граница суша/вода остаётся границей
       источника;
     • деталь не может перенести клетку через уровень моря: её множитель режется
       запасом высоты `|base − море| / (GUARD_SIGMAS·σ)`. Без этого на пологом
       шельфе каждая десятая клетка моря становилась бы островом, и совпадение
       границ разваливалось бы ровно там, где берег самый плоский. */

import { clamp, levelPixels, mppAt, TILE } from './scale.js';
import { fbm3, noise3 } from './noise.js';
import { GUARD_SIGMAS, createSourceField, detailFirstOctave } from './source.js';
import { SEA_LEVEL, heightFromRaw, heightMeters, rawFromHeight, rawFromMeters } from './zscale.js';
import { TECT, createTectonics } from './tectonics.js';
import { ERO, createErosion } from './erosion.js';

/* Шкалу переэкспортируем: heightFromRaw и компания — часть публичного лица
   рельефа, а климату, стоку и виду безразлично, в каком файле лежит формула. */
export {
  HEIGHT_EXPONENT, OCEAN_M_PER_UNIT, SEA_LEVEL, heightFromMeters, heightFromRaw,
  heightMeters, heightToZ, rawFromHeight,
} from './zscale.js';

/** Длина волны нулевой октавы — восьмая часть ширины карты: континенты. */
export const BASE_WAVELENGTH_DIV = 8;
/** Последняя октава: 2–3 метра, мельче пикселя на максимальном зуме незаметно. */
export const MAX_OCTAVE = 21;

/* ---------- параметры рельефа (настраиваются по кадру предпросмотра) ---------- */

const CONT_AMPLITUDE = 21; // амплитуда нулевой октавы континентов
/* Спад амплитуды 0,63 — это показатель Хёрста ≈0,67: деталь видна на любом
   приближении, от материка до осыпи. При 0,5 (H = 1) рельеф гладкий и на
   масштабе метра в пикселе смотреть не на что: перепад по тайлу — миллиметры. */
const CONT_GAIN = 0.63;
const RIDGE_AMPLITUDE = 13; // амплитуда горных хребтов
const RIDGE_GAIN = 0.6;
/* Хребты — явление крупное: мельче 1,2 км они уже не горы, а шершавость.
   Ограничение ещё и экономит половину выборок шума на глубоких уровнях. */
const RIDGE_MAX_OCTAVE = 12;
/* Среднее и разброс суммы октав задаются амплитудами, а не зерном, поэтому они
   одинаковы у всех миров; приводить поле к z-шкале и сравнивать пороги в σ
   нужно именно поэтому (RAW_MEAN, RAW_SIGMA — в zscale.js). */
const WARP_M = 420_000; // амплитуда доменного искажения, метры
/* Насколько близко к урезу воды деталь обязана гаснуть. Три σ: у самой кромки
   воды мелкий рельеф пропадает, но уже через несколько километров возвращается.
   Так берег остаётся берегом, а не полосой случайных островов. */
const PROC_GUARD_SIGMAS = 3;
const COARSE_CELL_M = 128_000; // шаг грубых глобальных полей (масштабируется планетой)
/** Точек на оценку среднего и разброса детали: 768 × 21 октава — это ~4 мс. */
const DETAIL_SAMPLES = 768;

/** Длина волны октавы i в метрах. */
export const octaveWavelength = (planet, i) => planet.widthM / BASE_WAVELENGTH_DIV / 2 ** i;

/** Сколько октав видит уровень с разрешением mpp: мельче двух пикселей не считаем. */
export const octaveCount = (planet, mpp) => {
  const base = planet.widthM / BASE_WAVELENGTH_DIV;
  const count = Math.floor(Math.log2(base / (2 * mpp))) + 1;
  return clamp(count, 0, MAX_OCTAVE);
};

/* ---------- грубые глобальные поля ---------- */

/**
 * Поле на грубой решётке с bilinear-выборкой. Годится для того, что меняется на
 * тысячах километров: доменное искажение континентов, пояс гор, вулканизм.
 * Значение поля в точке не зависит от уровня приближения, поэтому пирамида
 * остаётся точной: родитель и ребёнок видят одно и то же число.
 */
const createCoarseField = (planet, channels, fill) => {
  const cell = COARSE_CELL_M * planet.size;
  const w = Math.max(2, Math.ceil(planet.widthM / cell));
  const h = Math.max(2, Math.ceil(planet.heightM / cell) + 1);
  const data = new Float32Array(w * h * channels);
  const stepX = planet.widthM / w;
  const stepY = planet.heightM / (h - 1);
  const out = new Float32Array(channels);
  /* Поле заполняется при первом обращении: под ним лежит тектоника с эрозией,
     и платить полсекунды при создании планеты, которую могут и не спросить,
     незачем. Планета маленькая, а мир большой. */
  let ready = false;
  const prepare = () => {
    if (ready) return;
    ready = true;
    for (let gy = 0; gy < h; gy += 1) {
      for (let gx = 0; gx < w; gx += 1) {
        /* Мир плоский: узел решётки стоит в тех же метрах, что и пиксель карты.
           Перевод в цилиндр был нужен только замыканию по долготе. */
        fill(out, (gx + 0.5) * stepX, (gy + 0.5) * stepY);
        const base = (gy * w + gx) * channels;
        for (let c = 0; c < channels; c += 1) data[base + c] = out[c];
      }
    }
  };
  /* Обратные шаги: умножение вместо деления. Поля опрашиваются за каждый
     пиксель каждого тайла, и здесь экономия заметнее, чем где-либо ещё. */
  const invX = w / planet.widthM;
  const invY = (h - 1) / planet.heightM;
  return {
    cell,
    w,
    h,
    /** Выборка в метрах карты; и по долготе, и по широте прижата к краю —
        за рамкой карты земли нет, а зеркалить её нечем. */
    sample(mx, my, target) {
      prepare();
      let fx = mx * invX;
      let fy = my * invY;
      if (fx < 0) fx = 0;
      else if (fx > w - 1) fx = w - 1;
      if (fy < 0) fy = 0;
      else if (fy > h - 1) fy = h - 1;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, w - 1);
      const y1 = Math.min(y0 + 1, h - 1);
      const tx = fx - x0;
      const ty = fy - y0;
      for (let c = 0; c < channels; c += 1) {
        const a = data[(y0 * w + x0) * channels + c];
        const b = data[(y0 * w + x1) * channels + c];
        const d = data[(y1 * w + x0) * channels + c];
        const e = data[(y1 * w + x1) * channels + c];
        const top = a + (b - a) * tx;
        const bottom = d + (e - d) * tx;
        target[c] = top + (bottom - top) * ty;
      }
      return target;
    },
  };
};

/* ---------- пирамида ---------- */

const TILE_BYTES = TILE * TILE * 4;

/**
 * Поле высот планеты.
 *
 * @param {object} planet — геометрия из scale.js
 * @param {{ bytes?: number, source?: object|null }} [options]
 *   бюджет памяти на кэш тайлов; `source` — снимок карт Azgaar из `readSource`
 *   (тогда география берётся из карты генератора, а не из шума)
 */
/**
 * Основа рельефа: тектоника и эрозия.
 *
 * Строится **лениво**: мир из шума и мира из карты Azgaar обходятся по-разному,
 * а сама тектоника стоит полсекунды — платить за неё при каждом создании
 * планеты незачем. Поля считаются один раз на грубой решётке (52 км) и
 * опрашиваются билинейно: значение в точке не зависит от уровня пирамиды,
 * поэтому родитель и ребёнок видят ровно одну и ту же высоту, а тайл уровня
 * L+1 остаётся честным продолжением тайла уровня L.
 */
const createTerrainBase = (planet) => {
  let cache = null;
  const build = () => {
    if (cache) return cache;
    /* Плиты и океанское дно — тектоника; долины — эрозия. Порядок обязателен:
       эрозия течёт по тому, что подняла тектоника. */
    const tectonics = createTectonics(planet, { landTarget: 0.3 });
    const erosion = createErosion(planet, tectonics, {});
    const grid = erosion.grid;
    /* Сырая шкала считается один раз: в ней спрашивается высота на каждом
       пикселе тайла, и функция с возведением в степень там стоила бы дороже
       всей выборки поля. */
    const raw = new Float32Array(grid.w * grid.h);
    for (let i = 0; i < raw.length; i += 1) raw[i] = rawFromMeters(grid.at(i, ERO.elevation));
    cache = { tectonics, erosion, grid, raw };
    return cache;
  };
  return build;
};

export const createElevation = (planet, { bytes = 72 * 1024 * 1024, source = null } = {}) => {
  const seed = planet.seedNumber;
  const quad = new Float32Array(5);
  const scalarTarget = new Float32Array(1);
  const terrainBase = createTerrainBase(planet);
  let tileForBaseCell = null;

  /* Основа: она есть только у процедурного мира. У мира из карты Azgaar высоту
     задаёт сама карта (source.js), а тектонические поля идут в модуляцию
     детали — подменять высоты генератора своими нельзя, иначе поедут берега. */
  const baseRawAt = (mx, my) => {
    const base = terrainBase();
    const gx = clamp(Math.floor(mx / base.grid.stepX), 0, base.grid.w - 1);
    const gy = clamp(Math.floor(my / base.grid.stepY), 0, base.grid.h - 1);
    const index = gy * base.grid.w + gx;
    const fx = clamp(mx / base.grid.stepX - gx, 0, 1);
    const fy = clamp(my / base.grid.stepY - gy, 0, 1);
    const x1 = gx + 1 < base.grid.w ? gx + 1 : gx;
    const y1 = gy + 1 < base.grid.h ? gy + 1 : gy;
    const a = base.raw[index];
    const b = base.raw[gy * base.grid.w + x1];
    const c = base.raw[y1 * base.grid.w + gx];
    const d = base.raw[y1 * base.grid.w + x1];
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fy;
  };

  /* Пять величин, меняющихся на тысячах километров, живут в одном поле: выборка
     поля — вычисление индексов и весов интерполяции, и платить за него
     отдельно за каждую было бы самой дорогой операцией генерации. Искажение
     берётся из шума, а пояс гор, щиты и шероховатость — из тектоники и эрозии:
     хребты стоят там, где сходятся плиты, а не там, где совпал шум. */
  const shape = createCoarseField(planet, 5, (out, mx, my) => {
    /* 0, 1 — доменное искажение: деталь не выстраивается по осям решётки.
       К краям не гасим: цилиндр, который вырождается в линию на полюсах,
       остался в прошлой версии мира. */
    const f = 3 / planet.widthM;
    const wx = fbm3(mx, my, 0, { seed: seed + 11, octaves: 2, frequency: f, gain: 0.5 });
    const wy = fbm3(mx + 9137, my - 4211, 0, { seed: seed + 29, octaves: 2, frequency: f, gain: 0.5 });
    out[0] = wx * WARP_M * planet.size;
    out[1] = wy * WARP_M * planet.size * 0.5;

    /* Тектонические каналы лежат в поле тектоники, каналы эрозии — в поле
       эрозии: у эрозии своя, более короткая шкала каналов. */
    const tek = terrainBase().tectonics.grid;
    /* 2 — пояс гор и вулканических дуг: где хребты, там деталь крупная. */
    out[2] = clamp(tek.sample1(mx, my, TECT.belt) * 1.35, 0, 1);
    /* 3 — щиты: плоские платформы, на которых горы не растут. */
    out[3] = tek.sample1(mx, my, TECT.craton);
    /* 4 — шероховатость: множитель мелкой детали. В орогенах и на лавовых
       плато рельеф рубленый, на щитах и абиссали — почти гладкий. */
    out[4] = tek.sample1(mx, my, TECT.roughness);
  });

  /* Вулканизм: дуги, плюмы и рифты — для слоёв «породы», «сейсмика», «ресурсы». */
  const volcanic = createCoarseField(planet, 1, (out, mx, my) => {
    out[0] = clamp(terrainBase().tectonics.grid.sample1(mx, my, TECT.volcanic), 0, 1);
  });

  /** Канал тектонического поля в точке: у эрозии своя шкала каналов. */
  const tekAt = (mx, my, channel) => terrainBase().tectonics.grid.sample1(mx, my, channel);

  /* ---------- география из карты Azgaar ---------- */

  const geography = source && source.cellH && source.cellsX > 1 ? createSourceField(planet, source) : null;
  const baseWavelength = planet.widthM / BASE_WAVELENGTH_DIV;
  /* С какой октавы начинается деталь. У процедурного мира — с нулевой: там
     континенты и есть деталь, и снимать их нечем. */
  const detailFrom = geography ? clamp(detailFirstOctave(baseWavelength, geography.cellM), 0, MAX_OCTAVE) : 0;

  /**
   * Среднее и разброс октав детали — по одной октаве.
   *
   * Нужны не для красоты, а чтобы берег не уползал: сумма октав имеет
   * положительное среднее (хребты только прибавляют), и неснятое среднее
   * приподняло бы весь мир над морем источника — на пологом берегу это
   * десятки километров сушу там, где у генератора вода. Разброс — второе
   * условие: им режется множитель детали у берега.
   *
   * Оценивается выбором по всей планете, а не из формулы: пояс гор и щиты
   * перемножают октавы с полем, и аналитическое среднее было бы оценкой
   * «на глаз», а тут — честное число ровно того мира, который строится.
   */
  const detailMean = new Float64Array(MAX_OCTAVE + 1);
  const detailVariance = new Float64Array(MAX_OCTAVE + 1);
  const sums = new Float64Array(MAX_OCTAVE + 1);
  const squares = new Float64Array(MAX_OCTAVE + 1);
  const ridgeTo = Math.min(MAX_OCTAVE, RIDGE_MAX_OCTAVE);
  let roughSum = 0;
  for (let s = 0; s < DETAIL_SAMPLES; s += 1) {
    /* Точки — регулярная решётка по всей планете со взаимно простым шагом:
       несмещённости хватает, а разброс от порядка выборок не зависит. */
    const mx = (((s * 61) % 97) + 0.5) / 97 * planet.widthM;
    const my = (((s * 37) % 89) + 0.5) / 89 * planet.heightM;
    shape.sample(mx, my, quad);
    const x = mx + quad[0];
    const y = my + quad[1];
    const rough = 0.35 + 0.65 * clamp(quad[4], 0, 1.6);
    roughSum += rough;
    const mask = quad[2] * (1 - 0.55 * quad[3]);
    for (let i = detailFrom; i <= MAX_OCTAVE; i += 1) {
      const frequency = 2 ** i / baseWavelength;
      let value = CONT_AMPLITUDE * CONT_GAIN ** i * noise3(x * frequency, y * frequency, 0, seed + i * 71) * rough;
      if (i <= ridgeTo) {
        const n = noise3(x * frequency, y * frequency, 0, seed + 3001 + i * 131);
        value += RIDGE_AMPLITUDE * RIDGE_GAIN ** i * (1 - Math.abs(n)) * mask;
      }
      sums[i] += value;
      squares[i] += value * value;
    }
  }
  for (let i = detailFrom; i <= MAX_OCTAVE; i += 1) {
    const mean = sums[i] / DETAIL_SAMPLES;
    detailMean[i] = mean;
    /* Октавы независимы (разные зерно и частота), поэтому дисперсии суммы —
       сумма дисперсий: так среднее и разброс для любого диапазона берутся без
       перебора. Среднее важно не меньше разброса: хребтовое слагаемое имеет
       положительное среднее, и неснятое среднее подняло бы весь мир над водой. */
    detailVariance[i] = Math.max(squares[i] / DETAIL_SAMPLES - mean * mean, 0);
  }
  /** Среднее суммы октав с `from` по `to` включительно. */
  const centerOf = (from, to) => {
    let sum = 0;
    for (let i = from; i <= to; i += 1) sum += detailMean[i];
    return sum;
  };
  /** Разброс суммы октав с `from` по `to` включительно. */
  const sigmaOf = (from, to) => {
    let variance = 0;
    for (let i = from; i <= to; i += 1) variance += detailVariance[i];
    return Math.sqrt(variance);
  };
  const sigmaFull = sigmaOf(detailFrom, MAX_OCTAVE);
  /* Множитель шероховатости меняется по карте (в орогенах до 1,4, на щитах 0,4),
     поэтому σ по миру — средняя величина, а не худший случай. Охрана берега
     обязана держать **худший** случай: там, где деталь самая крупная, клетка
     дальше всего уходит от своей высоты. Отсюда отношение пика к среднему. */
  const roughRatio = Math.max(1, (0.35 + 0.65 * 1.6) / Math.max(roughSum / DETAIL_SAMPLES, 1e-6));
  /** Сколько raw-единиц детали допустимо на единицу запаса до берега. */
  const guardScale = geography && sigmaFull > 0 ? 1 / (GUARD_SIGMAS * sigmaFull * roughRatio) : 0;

  const tiles = new Map();
  let used = 0;

  const key = (level, tx, ty) => `${level}:${tx}:${ty}`;

  const evict = () => {
    /* Карта хранит порядок обращения: первый ключ — самый давний. */
    for (const name of tiles.keys()) {
      if (used <= bytes) break;
      tiles.delete(name);
      used -= TILE_BYTES;
    }
  };

  const touch = (name, tile) => {
    if (tiles.has(name)) {
      tiles.delete(name);
      tiles.set(name, tile);
      return tile;
    }
    tiles.set(name, tile);
    used += TILE_BYTES;
    evict();
    return tile;
  };

  /* Октавы с `from` по `to` включительно, в точке карты (x, y) — метры. */
  const addOctaves = (out, x, y, from, to) => {
    const ridgeTo = Math.min(to, RIDGE_MAX_OCTAVE);
    for (let i = from; i <= to; i += 1) {
      const frequency = 2 ** i / baseWavelength;
      out.value += CONT_AMPLITUDE * CONT_GAIN ** i * noise3(x * frequency, y * frequency, 0, seed + i * 71);
      if (i > ridgeTo) continue;
      const ridge = noise3(x * frequency, y * frequency, 0, seed + 3001 + i * 131);
      out.ridge += RIDGE_AMPLITUDE * RIDGE_GAIN ** i * (1 - Math.abs(ridge));
    }
  };

  /** База источника в центре пикселя `level`−1 сетки (x, y) — в тех же метрах,
      что и stretching родителя: пиксель родителя шире в два раза. */
  const baseAtPixel = (originX, originY, pitch, px, py) =>
    geography ? geography.baseAt(originX + (px + 0.5) * pitch, originY + (py + 0.5) * pitch) : 0;

  /** Заполнить тайл суммой октав. `parent` — родитель уровня L−1 или null. */
  const seaRaw = rawFromHeight(SEA_LEVEL);
  const fillTile = (level, tx, ty, parent) => {
    const mpp = mppAt(planet, level);
    const total = octaveCount(planet, mpp);
    const from = Math.max(detailFrom, parent ? octaveCount(planet, mpp * 2) + 1 : 0);
    /* Запас до воды режется по **полному** разбросу детали, а не по октавам
       этого уровня: множитель обязан быть одной и той же функцией места для
       родителя и ребёнка, иначе растянутый родитель и добавленная деталь
       разойдутся и пирамида перестанет быть продолжением. */
    const guardLocal = PROC_GUARD_SIGMAS * Math.max(sigmaFull, 1e-6) * roughRatio;
    const out = new Float32Array(TILE * TILE);
    const origin = { x: tx * TILE * mpp, y: ty * TILE * mpp };
    const center = geography ? centerOf(from, total) : 0;
    /* Координаты сетки родителя: они нужны и растягиванию, и пересъёму базы
       (шаг родителя вдвое крупнее — см. baseAtPixel). */
    const parentMpp = mpp * 2;
    const parentOriginX = (tx >> 1) * TILE * parentMpp;
    const parentOriginY = (ty >> 1) * TILE * parentMpp;
    const bx = (tx & 1) * 128;
    const by = (ty & 1) * 128;

    if (parent) {
      /* Растягиваем родителя: центр пикселя ребёнка приходится на
         (b·128 + px/2 − 0,25) пикселя родителя — четверть его шага. За пределами
         родительского тайла (последние ряд и столбец) значения берём уже не из
         массива, а через rawPixel: он сам найдёт соседний тайл и прижмёт край
         карты. Иначе на границах тайлов появилась бы ровная полоска. */
      const parentX = (tx >> 1) * TILE;
      const parentY = (ty >> 1) * TILE;
      for (let py = 0; py < TILE; py += 1) {
        const qy = by + py * 0.5 - 0.25;
        const y0 = Math.floor(qy);
        const fy = qy - y0;
        for (let px = 0; px < TILE; px += 1) {
          const qx = bx + px * 0.5 - 0.25;
          const x0 = Math.floor(qx);
          const fx = qx - x0;
          let top;
          let bottom;
          if (x0 >= 0 && y0 >= 0 && x0 < TILE - 1 && y0 < TILE - 1) {
            const i00 = y0 * TILE + x0;
            top = parent[i00] + (parent[i00 + 1] - parent[i00]) * fx;
            const i10 = i00 + TILE;
            bottom = parent[i10] + (parent[i10 + 1] - parent[i10]) * fx;
          } else {
            const gy = parentY + y0;
            const gx = parentX + x0;
            /* У соседнего тайла спрашиваем **только октавы**: основа в тайлы не
               входит (она прибавляется при выборке высоты), и если подмешать её
               здесь, растянутый родитель получит добавку на краю тайла — тайл
               разойдётся с соседом изнутри. */
            const a = tilePixel(level - 1, gx, gy);
            const b = tilePixel(level - 1, gx + 1, gy);
            const c = tilePixel(level - 1, gx, gy + 1);
            const d = tilePixel(level - 1, gx + 1, gy + 1);
            top = a + (b - a) * fx;
            bottom = c + (d - c) * fx;
          }
          out[py * TILE + px] = top + (bottom - top) * fy;
        }
      }
    }

    const acc = { value: 0, ridge: 0 };
    const geo = new Float32Array(2);
    for (let py = 0; py < TILE; py += 1) {
      const my = origin.y + (py + 0.5) * mpp;
      const qy = by + py * 0.5 - 0.25;
      const y0 = Math.floor(qy);
      const fy = qy - y0;
      for (let px = 0; px < TILE; px += 1) {
        const mx = origin.x + (px + 0.5) * mpp;
        shape.sample(mx, my, quad);
        const x = mx + quad[0];
        const y = my + quad[1];
        acc.value = 0;
        acc.ridge = 0;
        addOctaves(acc, x, y, from, total);
        /* Модуляция детали: где поднимаются горы, там и мелкий рельеф крупный,
           на щитах он придавлен. Даже на щите деталь не исчезает совсем —
           полностью гладких равнин в природе не бывает. */
        const rough = 0.35 + 0.65 * clamp(quad[4], 0, 1.6);
        const detail = acc.value * rough + acc.ridge * quad[2] * (1 - 0.55 * quad[3]);
        const index = py * TILE + px;
        if (!geography && parent) {
          /* У береговой линии деталь гаснет по запасу высоты основы — ровно
             так же, как у мира из карты Azgaar. Иначе на пологом шельфе (там
             перепад меньше сотни метров на сотни километров) шум переносил бы
             клетки через урез воды и берег рассыпался бы на острова. */
          const base = baseRawAt(mx, my);
          const reserve = Math.abs(base - seaRaw);
          const fade = reserve < guardLocal ? reserve / guardLocal : 1;
          out[index] += (detail - centerOf(from, total)) * fade;
          continue;
        }
        if (geography) {
          geography.sample(mx, my, geo);
          /* Множитель детали: гладкий рост от берега, но не больше запаса,
             чтобы клетка не перешагнула через уровень моря источника. */
          const cap = Math.abs(geo[0] - geography.rawCoast) * guardScale;
          const fade = geo[1] < cap ? geo[1] : cap;
          if (parent) {
            /* В растянутом родителе база уже лежит — но та, что снята с его
               сетки (шаг в два раза крупнее). Оставить её как есть значило бы
               заковать берег в разрешение нулевого уровня: 262 км на планете 1×
               и огранённая коса там, где у генератора плавная дуга. Поэтому база
               переснимается точно для этого уровня, а вклад родителя — только
               деталь. Вычитание стоит четыре выборки поля на пиксель, это ~6 %
               времени тайла. */
            const qx = bx + px * 0.5 - 0.25;
            const x0 = Math.floor(qx);
            const fx = qx - x0;
            const top = baseAtPixel(parentOriginX, parentOriginY, parentMpp, x0, y0)
              + (baseAtPixel(parentOriginX, parentOriginY, parentMpp, x0 + 1, y0)
                - baseAtPixel(parentOriginX, parentOriginY, parentMpp, x0, y0)) * fx;
            const bottom = baseAtPixel(parentOriginX, parentOriginY, parentMpp, x0, y0 + 1)
              + (baseAtPixel(parentOriginX, parentOriginY, parentMpp, x0 + 1, y0 + 1)
                - baseAtPixel(parentOriginX, parentOriginY, parentMpp, x0, y0 + 1)) * fx;
            const inherited = top + (bottom - top) * fy;
            out[index] += geo[0] - inherited + fade * (detail - center);
          } else {
            /* У корня пирамиды тащить нечего: база и есть тайл. */
            out[index] = geo[0] + fade * (detail - center);
          }
        } else if (parent) {
          out[index] += detail - centerOf(from, total);
        } else {
          /* У корня пирамиды деталь центрируется: её среднее снимается, а
             макрорельеф задаёт тектоническая основа, которая прибавляется при
             выборке высоты. */
          const base = baseRawAt(mx, my);
          const reserve = Math.abs(base - seaRaw);
          const fade = reserve < guardLocal ? reserve / guardLocal : 1;
          out[index] = (detail - centerOf(from, total)) * fade;
        }
      }
    }
    return out;
  };

  const rawTile = (level, tx, ty) => {
    const name = key(level, tx, ty);
    const cached = tiles.get(name);
    if (cached) {
      /* Повторный доступ — в конец очереди вытеснения. */
      tiles.delete(name);
      tiles.set(name, cached);
      return cached;
    }
    let parent = null;
    if (level > 0) parent = rawTile(level - 1, tx >> 1, ty >> 1);
    else if (level < 0) throw new Error(`Уровень пирамиды не может быть отрицательным: ${level}`);
    const tile = fillTile(level, tx, ty, parent);
    return touch(name, tile);
  };

  /**
   * Высота рельефа в пикселе уровня — **вместе с тектонической основой**.
   *
   * Основа прибавляется именно здесь, а не при сборке тайла, по двум причинам.
   * Во-первых, тайл остаётся чистой суммой октав и общего кэша не портит: поле
   * основы одно на весь мир и опрашивается по пикселю. Во-вторых, основа — поле
   * на грубой решётке, и в точке она одна и та же для родителя и ребёнка,
   * поэтому пирамида остаётся точной без «вычитания вклада родителя».
   */
  const tilePixel = (level, px, py) => {
    const { w, h } = levelPixels(planet, level);
    const x = Math.min(Math.max(px, 0), w - 1);
    const y = Math.min(Math.max(py, 0), h - 1);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const tile = rawTile(level, tx, ty);
    return tile[(y - ty * TILE) * TILE + (x - tx * TILE)];
  };

  const rawPixel = (level, px, py) => {
    const { w, h } = levelPixels(planet, level);
    const x = Math.min(Math.max(px, 0), w - 1);
    const y = Math.min(Math.max(py, 0), h - 1);
    const octaves = tilePixel(level, x, y);
    if (geography) return octaves;
    const mpp = mppAt(planet, level);
    return octaves + baseRawAt((x + 0.5) * mpp, (y + 0.5) * mpp);
  };

  /** Bilinear-выборка суммы октав: у краёв карты — с прижатием. */
  const sampleRaw = (level, px, py) => {
    const { w, h } = levelPixels(planet, level);
    const x = clamp(px, 0, w - 1);
    const y = clamp(py, 0, h - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const a = rawPixel(level, x0, y0);
    const b = rawPixel(level, x1, y0);
    const c = rawPixel(level, x0, y1);
    const d = rawPixel(level, x1, y1);
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fy;
  };

  /** Высота в единицах Azgaar в точке карты, заданной в метрах. */
  const heightAtMeters = (level, mx, my) => {
    const mpp = mppAt(planet, level);
    return heightFromRaw(sampleRaw(level, mx / mpp - 0.5, my / mpp - 0.5));
  };

  /** Грубые поля — для слоёв «породы», «сейсмика», «ресурсы». */
  const fieldAt = (field, mx, my) => {
    field.sample(mx, my, scalarTarget);
    return scalarTarget[0];
  };
  const fieldAtN = (field, mx, my, channel) => {
    field.sample(mx, my, quad);
    return quad[channel];
  };

  return {
    planet,
    heightFromRaw,
    rawTile,
    rawPixel,
    sampleRaw,
    sampleHeight: (level, px, py) => heightFromRaw(sampleRaw(level, px, py)),
    heightAtMeters,
    heightMetersAt: (level, mx, my) => heightMeters(heightAtMeters(level, mx, my)),
    belt: (mx, my) => fieldAtN(shape, mx, my, 2),
    volcanic: (mx, my) => fieldAt(volcanic, mx, my),
    craton: (mx, my) => fieldAtN(shape, mx, my, 3),
    roughness: (mx, my) => fieldAtN(shape, mx, my, 4),
    /* Поля тектоники и эрозии наружу: слоям нужны границы плит, возраст коры,
       сейсмика и врезанные долины, а проверкам — возможность посмотреть на них
       отдельно от генератора. */
    plate: (mx, my) => tekAt(mx, my, TECT.plate),
    crust: (mx, my) => tekAt(mx, my, TECT.crust),
    boundary: (mx, my) => tekAt(mx, my, TECT.boundaryType),
    boundaryDistance: (mx, my) => tekAt(mx, my, TECT.boundaryDist),
    crustAge: (mx, my) => tekAt(mx, my, TECT.age),
    crustThickness: (mx, my) => tekAt(mx, my, TECT.thickness),
    spreading: (mx, my) => tekAt(mx, my, TECT.convergence),
    seismic: (mx, my) => tekAt(mx, my, TECT.seismicity),
    rift: (mx, my) => tekAt(mx, my, TECT.rift),
    hotspot: (mx, my) => tekAt(mx, my, TECT.hotspot),
    trench: (mx, my) => tekAt(mx, my, TECT.trench),
    arc: (mx, my) => tekAt(mx, my, TECT.arc),
    drainage: (mx, my) => terrainBase().grid.sample1(mx, my, ERO.drainage),
    incision: (mx, my) => terrainBase().grid.sample1(mx, my, ERO.incision),
    dissection: (mx, my) => terrainBase().grid.sample1(mx, my, ERO.dissection),
    /** Основа: тектоника и эрозия. Строится при первом обращении. */
    terrain: () => terrainBase(),
    /** Все поля основы разом — для проверок и слоёв. */
    terrainFields: () => {
      const base = terrainBase();
      return { tectonics: base.tectonics, erosion: base.erosion };
    },
    /** Поля отдаются наружу затем же, чем и высоты. */
    fields: { shape, volcanic },
    /** Базовое поле из карты Azgaar — или null, если мир процедурный. */
    geography,
    /** С какой октавы деталь: 0 у процедурного мира; у карты генератора —
        ступень, на которой длина волны вдвое короче клетки источника. */
    detailFrom,
    stats: () => {
      const base = terrainBase();
      return {
        tiles: tiles.size,
        bytes: used,
        budget: bytes,
        geography: geography ? 'azgaar' : 'procedural',
        detailFrom,
        sigma: sigmaFull,
        roughRatio,
        source: geography ? geography.stats() : null,
        tectonics: base.tectonics.stats(),
        erosion: base.erosion.stats(),
      };
    },
    /** Очистить кэш: смена размера планеты или seed. */
    clear: () => {
      tiles.clear();
      used = 0;
    },
  };
};
