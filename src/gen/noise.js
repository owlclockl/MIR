/* Шум, хеши и сплайны собственного генератора мира.

   Всё здесь — чистые функции без DOM и без Math.random: мир обязан быть
   одинаковым у мастера и у игрока при одном seed, а колонка блока — одинаковой
   при любом порядке вычисления. Отсюда два правила:

     • никакого состояния между вызовами: значение зависит только от seed и
       координат (целочисленный хеш углов решётки), поэтому ленивая выборка
       колонки не расходится с растровой;
     • никаких объектов в горячем пути: сэмплер уровня Земли зовут миллионы раз
       за кадр, поэтому функции пишут в переданный массив, а не возвращают
       объект.

   Шум — улучшенный Перлин (как в Minecraft: градиенты на целочисленной
   решётке + сглаживание квинтикой). Диапазон примерно −1…1, октавы
   складываются в fbm с lacunarity 2 и gain 0.5 по умолчанию. */

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

/** 32-битный хеш от четырёх целых: основа и шума, и случайности структур. */
export const hash32 = (a, b = 0, c = 0, d = 0) => {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b9);
  h = Math.imul(h ^ (c | 0) ^ 0x85ebca6b, 0xcc9e2d51);
  h = (h << 13) | (h >>> 19);
  h = Math.imul(h ^ (d | 0) ^ 0x1b873593, 0x1b873593);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
};

/** Случайное число 0…1 из целых координат — «бросок кубика» в точке мира. */
export const rand01 = (a, b = 0, c = 0, d = 0) => hash32(a, b, c, d) / 4294967296;

/** Смешать seed и пару координат в одно число: хеш участка карты (структуры). */
export const scramble = (seed, a, b, salt = 0x51ed2701) => hash32(seed, a | 0, b | 0, salt);

/** Строка seed → 32 бита. Свой хеш: значение не должно зависеть от движка. */
export const hashSeed = (seed) => {
  const text = String(seed ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  /* Пустой seed — не «нулевой мир», а отдельная константа. */
  return (h ^ 0x9e3779b9) >>> 0;
};

/* Градиенты 2D (восемь) и 3D (двенадцать) — как в классическом улучшенном
   Перлине. Таблица перестановок строится из seed один раз и живёт в кэше: в
   горячем пути это две выборки из массива вместо хеша на каждый угол. */
const GRAD2 = new Float64Array([
  1, 1, -1, 1, 1, -1, -1, -1,
  1, 0, -1, 0, 0, 1, 0, -1,
]);
const INV_SQRT2 = Math.SQRT1_2;
const GRAD3 = new Float64Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

const tables = new Map();
const TABLE_LIMIT = 64;
const tableFor = (seed) => {
  const key = seed >>> 0;
  const cached = tables.get(key);
  if (cached) return cached;
  /* Перестановка 0…255: тасуем линейный ряд детерминированным генератором
     (xorshift32 от seed) — так у каждого поля шума своя решётка. */
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  let state = (key ^ 0x9e3779b9) >>> 0 || 1;
  for (let i = 255; i > 0; i -= 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const j = state % (i + 1);
    const swap = base[i];
    base[i] = base[j];
    base[j] = swap;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = base[i & 255];
  const table = { perm };
  if (tables.size >= TABLE_LIMIT) tables.clear();
  tables.set(key, table);
  return table;
};

/** 2D-шум: единица координат — один узел решётки (период волны 1). */
export const perlin2 = (seed, x, y) => {
  const perm = tableFor(seed).perm;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fade(fx);
  const v = fade(fy);
  const ix = x0 & 255;
  const iy = y0 & 255;
  const a = perm[ix] + iy;
  const b = perm[ix + 1] + iy;
  const g00 = (perm[a & 255] & 7) << 1;
  const g10 = (perm[b & 255] & 7) << 1;
  const g01 = (perm[(a + 1) & 255] & 7) << 1;
  const g11 = (perm[(b + 1) & 255] & 7) << 1;
  const n00 = GRAD2[g00] * fx + GRAD2[g00 + 1] * fy;
  const n10 = GRAD2[g10] * (fx - 1) + GRAD2[g10 + 1] * fy;
  const n01 = GRAD2[g01] * fx + GRAD2[g01 + 1] * (fy - 1);
  const n11 = GRAD2[g11] * (fx - 1) + GRAD2[g11 + 1] * (fy - 1);
  /* 1.41 — предел наклона: так результат уверенно ложится в −1…1. */
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * INV_SQRT2 * 2;
};

/** 3D-шум: пещеры, рудные жилы и объёмные поля — только здесь. */
export const perlin3 = (seed, x, y, z) => {
  const perm = tableFor(seed).perm;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const u = fade(fx);
  const v = fade(fy);
  const w = fade(fz);
  const ix = x0 & 255;
  const iy = y0 & 255;
  const iz = z0 & 255;
  const a = perm[ix] + iy;
  const b = perm[ix + 1] + iy;
  const aa = perm[a & 255] + iz;
  const ab = perm[(a + 1) & 255] + iz;
  const ba = perm[b & 255] + iz;
  const bb = perm[(b + 1) & 255] + iz;
  const g000 = (perm[aa & 255] % 12) * 3;
  const g100 = (perm[ba & 255] % 12) * 3;
  const g010 = (perm[ab & 255] % 12) * 3;
  const g110 = (perm[bb & 255] % 12) * 3;
  const g001 = (perm[(aa + 1) & 255] % 12) * 3;
  const g101 = (perm[(ba + 1) & 255] % 12) * 3;
  const g011 = (perm[(ab + 1) & 255] % 12) * 3;
  const g111 = (perm[(bb + 1) & 255] % 12) * 3;
  const n000 = GRAD3[g000] * fx + GRAD3[g000 + 1] * fy + GRAD3[g000 + 2] * fz;
  const n100 = GRAD3[g100] * (fx - 1) + GRAD3[g100 + 1] * fy + GRAD3[g100 + 2] * fz;
  const n010 = GRAD3[g010] * fx + GRAD3[g010 + 1] * (fy - 1) + GRAD3[g010 + 2] * fz;
  const n110 = GRAD3[g110] * (fx - 1) + GRAD3[g110 + 1] * (fy - 1) + GRAD3[g110 + 2] * fz;
  const n001 = GRAD3[g001] * fx + GRAD3[g001 + 1] * fy + GRAD3[g001 + 2] * (fz - 1);
  const n101 = GRAD3[g101] * (fx - 1) + GRAD3[g101 + 1] * fy + GRAD3[g101 + 2] * (fz - 1);
  const n011 = GRAD3[g011] * fx + GRAD3[g011 + 1] * (fy - 1) + GRAD3[g011 + 2] * (fz - 1);
  const n111 = GRAD3[g111] * (fx - 1) + GRAD3[g111 + 1] * (fy - 1) + GRAD3[g111 + 2] * (fz - 1);
  const x00 = lerp(n000, n100, u);
  const x10 = lerp(n010, n110, u);
  const x01 = lerp(n001, n101, u);
  const x11 = lerp(n011, n111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 1.15;
};

/**
 * Фрактальный шум (fbm). `period` — длина волны первой октавы в единицах
 * координат мира (у нас — в блоках): материки берут периоды в тысячи
 * километров, деталь рельефа — в километры.
 *
 * `octaves` можно уменьшить на грубых уровнях пирамиды: октавы мельче
 * пикселя всё равно не видны, а стоят столько же.
 *
 * @param {number} seed
 * @param {number} x координата в блоках
 * @param {number} y координата в блоках
 * @param {number} period период первой октавы, блоков
 * @param {{octaves?: number, gain?: number, lacunarity?: number, ridged?: boolean}} [options]
 */
export const fbm2 = (seed, x, y, period, options = {}) => {
  const octaves = Math.max(1, Math.round(options.octaves ?? 4));
  const gain = options.gain ?? 0.5;
  const lacunarity = options.lacunarity ?? 2;
  const ridged = options.ridged === true;
  let sum = 0;
  let weight = 1;
  let total = 0;
  let scale = 1 / period;
  for (let o = 0; o < octaves; o += 1) {
    let n = perlin2((seed + o * 7919) >>> 0, x * scale, y * scale);
    if (ridged) n = 1 - Math.abs(n);
    sum += n * weight;
    total += weight;
    weight *= gain;
    scale *= lacunarity;
  }
  return sum / total;
};

/** Гребневый шум: 0 на гребне, 1 в ложбине — так собираются горные хребты. */
export const ridged2 = (seed, x, y, period, options = {}) => 1 - Math.abs(fbm2(seed, x, y, period, options));

/** Доменное искажение: сдвигает координаты шумом — берега и реки перестают быть «шумными», становятся природными. */
export const warp2 = (seed, x, y, period, strength, out) => {
  const wx = perlin2(seed ^ 0x51ed_2701, x / period, y / period) * strength;
  const wy = perlin2(seed ^ 0x1b87_3593, x / period, y / period) * strength;
  out[0] = x + wx;
  out[1] = y + wy;
  return out;
};

/* ---------- сплайны ---------- */

/**
 * Монотонный кубический сплайн по точкам [[x, y], …] — как CubicSpline в
 * Minecraft: по нему высота рельефа переводится из континентальности и эрозии
 * в блоки, без «ступенек» на границах биомов.
 *
 * Наклоны считаются по Фричу — Карлсону (Fritsch & Carlson, 1980): кривая не
 * выходит за заданные значения между точками, поэтому океанский склон не
 * выпирает выше берега.
 */
export const spline = (points) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const n = xs.length;
  const slope = new Float64Array(n);
  const delta = new Float64Array(Math.max(0, n - 1));
  for (let i = 0; i < n - 1; i += 1) delta[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  slope[0] = delta[0];
  slope[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    if (delta[i - 1] * delta[i] <= 0) slope[i] = 0;
    else slope[i] = (delta[i - 1] + delta[i]) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (delta[i] === 0) {
      slope[i] = 0;
      slope[i + 1] = 0;
      continue;
    }
    const a = slope[i] / delta[i];
    const b = slope[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      slope[i] = t * a * delta[i];
      slope[i + 1] = t * b * delta[i];
    }
  }
  return (value) => {
    if (value <= xs[0]) {
      /* За крайними точками — линейное продолжение по последнему наклону:
         сплайн не должен «полочить» океан за пределами таблицы. */
      return ys[0] + slope[0] * (value - xs[0]);
    }
    if (value >= xs[n - 1]) return ys[n - 1] + slope[n - 1] * (value - xs[n - 1]);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] > value) hi = mid;
      else lo = mid;
    }
    const h = xs[hi] - xs[lo];
    const t = (value - xs[lo]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * ys[lo] + h10 * h * slope[lo] + h01 * ys[hi] + h11 * h * slope[hi];
  };
};

/** Округление к ближайшему с заданным шагом — для сеток кратных 2. */
export const alignTo = (value, step) => Math.ceil(value / step) * step;
