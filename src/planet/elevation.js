/* Рельеф планеты: высоты в шкале Azgaar и пирамида тайлов.

   Высоты живут в единицах Azgaar: 0…100, уровень моря — 20. Сделано затем, чтобы
   правила, перенесённые из генератора (биомы по влажности и температуре, «земля
   начинается с 20», ширина реки из стока), работали без пересчёта: смотри
   docs/planet-map.md, раздел «Что взято из Azgaar». Метры получаются из этих
   единиц формулой ниже и только для показа и физики (уклоны, перепад высот).

   Как устроена генерация. Поле высот — сумма октав шума, снятого с цилиндра:

       F(p) = Σ a_i · n(p/λ_i) + belt(p) · Σ r_i · (1 − |n(p/λ_i)|)

   Она линейна по октавам, и это главное свойство: тайл уровня L не считает заново
   двадцать одну октаву, а берёт родителя (уровень L−1), растягивает его вдвое и
   добавляет только те октавы, которые появились на этом уровне, — обычно одну-две.
   Поэтому цена тайла почти не зависит от приближения: на максимальном зуме мир не
   «дороже», чем на обзорном.

   Нелинейность (берег, шельф, пологие равнины, глубокие впадины) вынесена из
   суммы в функцию `heightFromRaw`, которая применяется к уже готовому тайлу на
   этапе раскраски. Будь она внутри суммы, растягивание родителя стало бы
   приближением и береговая линия «замылилась» бы до разрешения грубого уровня. */

import { clamp, levelPixels, mppAt, TILE } from './scale.js';
import { fbm3, noise3 } from './noise.js';

/** Уровень моря в шкале Azgaar. Ниже — вода, выше — суша. */
export const SEA_LEVEL = 20;
/** (h − 18)^EXP метров над уровнем моря: h = 100 даёт 8848 м. */
export const HEIGHT_EXPONENT = 2.06;
/** Метров глубины на единицу шкалы: h = 0 даёт 11 000 м. */
export const OCEAN_M_PER_UNIT = 550;

/** Длина волны нулевой октавы — восьмая часть экватора: континенты. */
export const BASE_WAVELENGTH_DIV = 8;
/** Последняя октава: 2–3 метра, мельче пикселя на максимальном зуме незаметно. */
export const MAX_OCTAVE = 21;

/** Высоты в метрах: плюс — суша, минус — глубина. */
export const heightMeters = (h) =>
  h >= SEA_LEVEL ? (h - 18) ** HEIGHT_EXPONENT : -(SEA_LEVEL - h) * OCEAN_M_PER_UNIT;

/** Метры в единицы шкалы — обратная функция, нужна порогам («выше 2000 м»). */
export const heightFromMeters = (m) =>
  m >= 0 ? 18 + Math.abs(m) ** (1 / HEIGHT_EXPONENT) : SEA_LEVEL - Math.abs(m) / OCEAN_M_PER_UNIT;

/** Сырое значение, дающее заданную высоту в единицах шкалы: для порогов. */
export const rawFromHeight = (h) => {
  const t = clamp((Math.max(h, SEA_LEVEL) - SEA_LEVEL) / 80, 0, 1) ** (1 / LAND_POW);
  return RAW_MEAN + RAW_SIGMA * (SEA_Z + t * (LAND_Z - SEA_Z));
};

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
/* Сумма октав сама по себе не имеет наглядного масштаба: у неё есть среднее
   (положительное — хребты только прибавляют) и разброс, одинаковые у всех
   миров, потому что задаются амплитудами, а не зерном. Сырое поле приводится к
   z-шкале, и дальше все пороги — в σ, а не в «единицах шума». */
const RAW_MEAN = 9.2;
const RAW_SIGMA = 10.6;
const SEA_Z = 0.52; // граница суши: около 30 % площади остаётся выше неё
const LAND_Z = 3; // z, дающий Эверест
const LAND_POW = 1.9; // равнины широкие, вершины редкие
const SHELF_Z = 0.24; // ширина шельфа: до этих пор глубина растёт медленно
const SHELF_DEPTH = 0.4; // единиц шкалы на шельфе: ≈220 м
const ABYSS_DEPTH = 12; // единиц шкалы на ложе: ≈6,6 км
const WARP_M = 420_000; // амплитуда доменного искажения, метры
const COARSE_CELL_M = 128_000; // шаг грубых глобальных полей (масштабируется планетой)

/** Длина волны октавы i в метрах. */
export const octaveWavelength = (planet, i) => planet.widthM / BASE_WAVELENGTH_DIV / 2 ** i;

/** Сколько октав видит уровень с разрешением mpp: мельче двух пикселей не считаем. */
export const octaveCount = (planet, mpp) => {
  const base = planet.widthM / BASE_WAVELENGTH_DIV;
  const count = Math.floor(Math.log2(base / (2 * mpp))) + 1;
  return clamp(count, 0, MAX_OCTAVE);
};

/**
 * Нелинейная шкала: из суммы октав получаем высоту в единицах Azgaar.
 * До нуля — океан с шельфом у берега и пологим ложем; после — равнины,
 * плато и линейный рост выше насыщения.
 */
export const heightFromRaw = (raw) => {
  const z = (raw - RAW_MEAN) / RAW_SIGMA;
  if (z >= SEA_Z) return SEA_LEVEL + 80 * clamp((z - SEA_Z) / (LAND_Z - SEA_Z), 0, 1) ** LAND_POW;
  const d = SEA_Z - z;
  if (d <= SHELF_Z) return SEA_LEVEL - SHELF_DEPTH * (d / SHELF_Z) ** 1.5;
  /* Ложе океана выходит на насыщение: глубина растёт, но всё медленнее, иначе
     половина мира лежала бы на одиннадцатикилометровой плоскости. */
  return Math.max(1, SEA_LEVEL - SHELF_DEPTH - ABYSS_DEPTH * (1 - Math.exp(-(d - SHELF_Z) / 1.2)));
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
      const theta = ((gx * stepX) / planet.widthM) * Math.PI * 2;
      const cx = planet.radius * Math.cos(theta);
      const cz = planet.radius * Math.sin(theta);
      const cy = gy * stepY;
      fill(out, cx, cy, cz, gy * stepY);
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
    /** Выборка в метрах карты; по долготе мир замкнут, по широте прижат к краю. */
    sample(mx, my, target) {
      let fx = mx * invX;
      if (fx < 0 || fx >= w) fx = ((fx % w) + w) % w;
      let fy = my * invY;
      if (fy < 0) fy = 0;
      else if (fy > h - 1) fy = h - 1;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = (x0 + 1) % w;
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
 * @param {{ bytes?: number }} [options] — бюджет памяти на кэш тайлов
 */
export const createElevation = (planet, { bytes = 72 * 1024 * 1024 } = {}) => {
  const seed = planet.seedNumber;
  const quad = new Float32Array(4);
  const scalarTarget = new Float32Array(1);

  /* Все четыре величины, меняющиеся на тысячах километров, живут в одном поле
     из четырёх каналов: выборка поля — это вычисление индексов и весов
     интерполяции, и платить за него четырежды за каждый пиксель каждого тайла
     было бы самой дорогой операцией генерации (11 мс из 28 на тайл). */
  const shape = createCoarseField(planet, 4, (out, cx, cy, cz, my) => {
    /* 0, 1 — доменное искажение: материки перестают быть «блинами» от fbm. */
    const f = 3 / planet.widthM;
    const wx = fbm3(cx, cy, cz, { seed: seed + 11, octaves: 2, frequency: f, gain: 0.5 });
    const wy = fbm3(cx + 9137, cy - 4211, cz + 7717, { seed: seed + 29, octaves: 2, frequency: f, gain: 0.5 });
    /* К полюсам искажение гасим: там цилиндр вырождается в линию. */
    const polar = Math.cos((my / planet.heightM - 0.5) * Math.PI) ** 0.5;
    out[0] = wx * WARP_M * planet.size * polar;
    out[1] = wy * WARP_M * planet.size * polar * 0.5;

    /* 2 — пояс гор: хребтовый шум в степени даёт длинные цепи, а не пятна. */
    const ridge = 1 - Math.abs(fbm3(cx, cy, cz, { seed: seed + 71, octaves: 3, frequency: 2.2 / planet.widthM, gain: 0.55 }));
    const region = fbm3(cx + 5551, cy + 331, cz - 8801, { seed: seed + 97, octaves: 2, frequency: 1.1 / planet.widthM, gain: 0.5 });
    const mask = clamp((region + 0.25) / 0.7, 0, 1);
    out[2] = clamp(ridge ** 2.6 * 2.6, 0, 1) * mask;

    /* 3 — древние щиты: плоские платформы, на которых горы не растут. */
    out[3] = clamp(fbm3(cx + 7717, cy - 1543, cz + 9091, { seed: seed + 173, octaves: 2, frequency: 1.4 / planet.widthM, gain: 0.5 }) * 2 + 0.5, 0, 1);
  });

  /* Вулканизм: для слоёв «породы», «сейсмика» и «ресурсы». */
  const volcanic = createCoarseField(planet, 1, (out, cx, cy, cz) => {
    const ridge = 1 - Math.abs(fbm3(cx - 2003, cy + 6607, cz + 4409, { seed: seed + 131, octaves: 2, frequency: 2.6 / planet.widthM, gain: 0.5 }));
    out[0] = clamp(ridge ** 4 * 3.4, 0, 1);
  });

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

  /* Октавы с `from` по `to` включительно, в точке цилиндра (cx, cy, cz). */
  const addOctaves = (out, cx, cy, cz, from, to) => {
    const base = planet.widthM / BASE_WAVELENGTH_DIV;
    const ridgeTo = Math.min(to, RIDGE_MAX_OCTAVE);
    for (let i = from; i <= to; i += 1) {
      const frequency = 2 ** i / base;
      out.value += CONT_AMPLITUDE * CONT_GAIN ** i * noise3(cx * frequency, cy * frequency, cz * frequency, seed + i * 71);
      if (i > ridgeTo) continue;
      const ridge = noise3(cx * frequency, cy * frequency, cz * frequency, seed + 3001 + i * 131);
      out.ridge += RIDGE_AMPLITUDE * RIDGE_GAIN ** i * (1 - Math.abs(ridge));
    }
  };

  /** Заполнить тайл суммой октав. `parent` — родитель уровня L−1 или null. */
  const fillTile = (level, tx, ty, parent) => {
    const mpp = mppAt(planet, level);
    const total = octaveCount(planet, mpp);
    const from = parent ? octaveCount(planet, mpp * 2) + 1 : 0;
    const out = new Float32Array(TILE * TILE);
    const origin = { x: tx * TILE * mpp, y: ty * TILE * mpp };

    if (parent) {
      /* Растягиваем родителя: центр пикселя ребёнка приходится на
         (b·128 + px/2 − 0,25) пикселя родителя — четверть его шага. За пределами
         родительского тайла (последние ряд и столбец) значения берём уже не из
         массива, а через rawPixel: он сам найдёт соседний тайл, замкнёт долготу
         и прижмёт полюс. Иначе на границах тайлов появилась бы ровная полоска. */
      const bx = (tx & 1) * 128;
      const by = (ty & 1) * 128;
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
    for (let py = 0; py < TILE; py += 1) {
      const my = origin.y + (py + 0.5) * mpp;
      for (let px = 0; px < TILE; px += 1) {
        const mx = origin.x + (px + 0.5) * mpp;
        shape.sample(mx, my, quad);
        const wx = mx + quad[0];
        const wy = my + quad[1];
        const theta = (wx / planet.widthM) * Math.PI * 2;
        const cx = planet.radius * Math.cos(theta);
        const cz = planet.radius * Math.sin(theta);
        const cy = wy;
        acc.value = 0;
        acc.ridge = 0;
        addOctaves(acc, cx, cy, cz, from, total);
        /* На древних щитах хребты придавлены: платформа остаётся плоской. */
        const ridge = acc.ridge * quad[2] * (1 - 0.55 * quad[3]);
        out[py * TILE + px] += acc.value + ridge;
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
      Координаты за краем мира допустимы: долгота замыкается, широта прижимается. */
  const rawPixel = (level, px, py) => {
    const { w, h } = levelPixels(planet, level);
    const x = ((px % w) + w) % w;
    const y = clamp(py, 0, h - 1);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const tile = rawTile(level, tx, ty);
    return tile[(y - ty * TILE) * TILE + (x - tx * TILE)];
  };

  /** Bilinear-выборка суммы октав: по долготе с переносом, по широте с прижатием. */
  const sampleRaw = (level, px, py) => {
    const { w, h } = levelPixels(planet, level);
    const x = ((px % w) + w) % w;
    const y = clamp(py, 0, h - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const x1 = (x0 + 1) % w;
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
       нужны пояс гор и вулканизм, а тестам — возможность проверить их отдельно. */
    fields: { shape, volcanic },
    stats: () => ({ tiles: tiles.size, bytes: used, budget: bytes }),
    /** Очистить кэш: смена размера планеты или seed. */
    clear: () => {
      tiles.clear();
      used = 0;
    },
  };
};
