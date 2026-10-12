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
import { heightFromRaw, heightMeters } from './zscale.js';

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
  for (let gy = 0; gy < h; gy += 1) {
    for (let gx = 0; gx < w; gx += 1) {
      /* Мир плоский: узел решётки стоит в тех же метрах, что и пиксель карты.
         Перевод в цилиндр был нужен только замыканию по долготе. */
      fill(out, (gx + 0.5) * stepX, (gy + 0.5) * stepY);
      const base = (gy * w + gx) * channels;
      for (let c = 0; c < channels; c += 1) data[base + c] = out[c];
    }
  }
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
export const createElevation = (planet, { bytes = 72 * 1024 * 1024, source = null } = {}) => {
  const seed = planet.seedNumber;
  const quad = new Float32Array(4);
  const scalarTarget = new Float32Array(1);

  /* Все четыре величины, меняющиеся на тысячах километров, живут в одном поле
     из четырёх каналов: выборка поля — это вычисление индексов и весов
     интерполяции, и платить за него четырежды за каждый пиксель каждого тайла
     было бы самой дорогой операцией генерации (11 мс из 28 на тайл). */
  const shape = createCoarseField(planet, 4, (out, mx, my) => {
    /* 0, 1 — доменное искажение: материки перестают быть «блинами» от fbm.
       К краям не гасим: цилиндр, который вырождается в линию на полюсах,
       остался в прошлой версии мира. */
    const f = 3 / planet.widthM;
    const wx = fbm3(mx, my, 0, { seed: seed + 11, octaves: 2, frequency: f, gain: 0.5 });
    const wy = fbm3(mx + 9137, my - 4211, 0, { seed: seed + 29, octaves: 2, frequency: f, gain: 0.5 });
    out[0] = wx * WARP_M * planet.size;
    out[1] = wy * WARP_M * planet.size * 0.5;

    /* 2 — пояс гор: хребтовый шум в степени даёт длинные цепи, а не пятна. */
    const ridge = 1 - Math.abs(fbm3(mx, my, 0, { seed: seed + 71, octaves: 3, frequency: 2.2 / planet.widthM, gain: 0.55 }));
    const region = fbm3(mx + 5551, my + 331, 0, { seed: seed + 97, octaves: 2, frequency: 1.1 / planet.widthM, gain: 0.5 });
    const mask = clamp((region + 0.25) / 0.7, 0, 1);
    out[2] = clamp(ridge ** 2.6 * 2.6, 0, 1) * mask;

    /* 3 — древние щиты: плоские платформы, на которых горы не растут. */
    out[3] = clamp(fbm3(mx + 7717, my - 1543, 0, { seed: seed + 173, octaves: 2, frequency: 1.4 / planet.widthM, gain: 0.5 }) * 2 + 0.5, 0, 1);
  });

  /* Вулканизм: для слоёв «породы», «сейсмика» и «ресурсы». */
  const volcanic = createCoarseField(planet, 1, (out, mx, my) => {
    const ridge = 1 - Math.abs(fbm3(mx - 2003, my + 6607, 0, { seed: seed + 131, octaves: 2, frequency: 2.6 / planet.widthM, gain: 0.5 }));
    out[0] = clamp(ridge ** 4 * 3.4, 0, 1);
  });

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
  let sigmaFull = 0;
  if (geography) {
    const sums = new Float64Array(MAX_OCTAVE + 1);
    const squares = new Float64Array(MAX_OCTAVE + 1);
    const ridgeTo = Math.min(MAX_OCTAVE, RIDGE_MAX_OCTAVE);
    for (let s = 0; s < DETAIL_SAMPLES; s += 1) {
      /* Точки — регулярная решётка по всей планете со взаимно простым шагом:
         несмещённости хватает, а разброс от порядка выборок не зависит. */
      const mx = (((s * 61) % 97) + 0.5) / 97 * planet.widthM;
      const my = (((s * 37) % 89) + 0.5) / 89 * planet.heightM;
      shape.sample(mx, my, quad);
      const x = mx + quad[0];
      const y = my + quad[1];
      const mask = quad[2] * (1 - 0.55 * quad[3]);
      for (let i = detailFrom; i <= MAX_OCTAVE; i += 1) {
        const frequency = 2 ** i / baseWavelength;
        let value = CONT_AMPLITUDE * CONT_GAIN ** i * noise3(x * frequency, y * frequency, 0, seed + i * 71);
        if (i <= ridgeTo) {
          const n = noise3(x * frequency, y * frequency, 0, seed + 3001 + i * 131);
          value += RIDGE_AMPLITUDE * RIDGE_GAIN ** i * (1 - Math.abs(n)) * mask;
        }
        sums[i] += value;
        squares[i] += value * value;
      }
    }
    let variance = 0;
    for (let i = detailFrom; i <= MAX_OCTAVE; i += 1) {
      const mean = sums[i] / DETAIL_SAMPLES;
      detailMean[i] = mean;
      /* Октавы независимы (разные зерно и частота), поэтому дисперсии суммы —
         сумма дисперсий: так среднее для любого диапазона берётся без перебора. */
      variance += Math.max(squares[i] / DETAIL_SAMPLES - mean * mean, 0);
    }
    sigmaFull = Math.sqrt(variance);
  }
  /** Среднее суммы октав с `from` по `to` включительно. */
  const centerOf = (from, to) => {
    let sum = 0;
    for (let i = from; i <= to; i += 1) sum += detailMean[i];
    return sum;
  };
  /** Сколько raw-единиц детали допустимо на единицу запаса до берега. */
  const guardScale = geography && sigmaFull > 0 ? 1 / (GUARD_SIGMAS * sigmaFull) : 0;

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
  const fillTile = (level, tx, ty, parent) => {
    const mpp = mppAt(planet, level);
    const total = octaveCount(planet, mpp);
    const from = Math.max(detailFrom, parent ? octaveCount(planet, mpp * 2) + 1 : 0);
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
            const a = rawPixel(level - 1, gx, gy);
            const b = rawPixel(level - 1, gx + 1, gy);
            const c = rawPixel(level - 1, gx, gy + 1);
            const d = rawPixel(level - 1, gx + 1, gy + 1);
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
        /* На древних щитах хребты придавлены: платформа остаётся плоской. */
        const detail = acc.value + acc.ridge * quad[2] * (1 - 0.55 * quad[3]);
        const index = py * TILE + px;
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
        } else {
          out[index] += detail;
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

  /** Одно значение суммы октав на уровне level в пиксельных координатах.
      Координаты за краем карты допустимы: они прижимаются к краю. */
  const rawPixel = (level, px, py) => {
    const { w, h } = levelPixels(planet, level);
    const x = Math.min(Math.max(px, 0), w - 1);
    const y = Math.min(Math.max(py, 0), h - 1);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const tile = rawTile(level, tx, ty);
    return tile[(y - ty * TILE) * TILE + (x - tx * TILE)];
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
    /* Поля отдаются наружу затем же, чем и высоты: слоям «породы» и «сейсмика»
       нужны пояс гор и вулканизм, а проверкам — возможность посмотреть на них
       отдельно от генератора. */
    fields: { shape, volcanic },
    /** Базовое поле из карты Azgaar — или null, если мир процедурный. */
    geography,
    /** С какой октавы деталь: 0 у процедурного мира; у карты генератора —
        ступень, на которой длина волны вдвое короче клетки источника. */
    detailFrom,
    stats: () => ({
      tiles: tiles.size,
      bytes: used,
      budget: bytes,
      geography: geography ? 'azgaar' : 'procedural',
      detailFrom,
      sigma: sigmaFull,
      source: geography ? geography.stats() : null,
    }),
    /** Очистить кэш: смена размера планеты или seed. */
    clear: () => {
      tiles.clear();
      used = 0;
    },
  };
};
