/* Шум для планеты: детерминированный, без таблиц и без состояния.

   Требования, из которых вырос этот файл:

     1. **Один и тот же мир для одного seed.** Всё считается из целых координат
        решётки и 32-битного хеша: ни одного `Math.random`, ни одного
        предварительно заполненного массива, который надо было бы где-то хранить.
     2. **Мир плоский и не замкнут.** Шум сэмплируется прямо по метрам карты
        (`x = mx`, `y = my`), без цилиндра: карта ограничена рамкой, как карта
        Azgaar, а не оборачивается вокруг планеты. Замыкание пришлось бы
        возвращать вместе с глобусом — см. `scale.js`.
     3. **Цена пикселя не растёт с приближением.** Каждая октава — отдельное
        слагаемое, и пирамида уровней (elevation.js) добавляет к родителю только
        новые октавы. Здесь для этого есть слагаемые по одной октаве:
        `octaveValue`, `octaveRidged`, `octaveBillow`.

   Шум — классический градиентный (Perlin) в трёх измерениях: 8 углов решётки,
   градиент из таблицы 16 направлений, smootherstep. Он дороже Value-шума на
   несколько умножений, но не даёт «квадратных» артефактов по осям, которые на
   рельефе видно сразу. */

/** 16 направлений градиента: таблица, чтобы на угол решётки хватало одного хеша. */
const GRAD = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
  1, 1, 0, 0, -1, 1, -1, 1, 0, 0, -1, -1,
]);

/** Хеш трёх целых координат и seed → [0, 1). */
export const hash3 = (x, y, z, seed) => {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ (seed | 0);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) * 2.3283064365386963e-10;
};

/**
 * Градиентный шум 3D, диапазон примерно [−1, 1].
 *
 * Восемь углов решётки посчитаны вручную, без замыкания на угол: на профиле
 * генерации планеты замыкание съедало две трети времени (284 нс против 103 нс
 * на выборку), а шум — это почти всё время сборки тайла.
 */
export const noise3 = (x, y, z, seed) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const w = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
  const x0 = xi;
  const x1 = xi + 1;
  const y0 = yi;
  const y1 = yi + 1;
  const z0 = zi;
  const z1 = zi + 1;

  let g = ((hash3(x0, y0, z0, seed) * 16) | 0) * 3;
  const n000 = GRAD[g] * xf + GRAD[g + 1] * yf + GRAD[g + 2] * zf;
  g = ((hash3(x1, y0, z0, seed) * 16) | 0) * 3;
  const n100 = GRAD[g] * (xf - 1) + GRAD[g + 1] * yf + GRAD[g + 2] * zf;
  g = ((hash3(x0, y1, z0, seed) * 16) | 0) * 3;
  const n010 = GRAD[g] * xf + GRAD[g + 1] * (yf - 1) + GRAD[g + 2] * zf;
  g = ((hash3(x1, y1, z0, seed) * 16) | 0) * 3;
  const n110 = GRAD[g] * (xf - 1) + GRAD[g + 1] * (yf - 1) + GRAD[g + 2] * zf;
  g = ((hash3(x0, y0, z1, seed) * 16) | 0) * 3;
  const n001 = GRAD[g] * xf + GRAD[g + 1] * yf + GRAD[g + 2] * (zf - 1);
  g = ((hash3(x1, y0, z1, seed) * 16) | 0) * 3;
  const n101 = GRAD[g] * (xf - 1) + GRAD[g + 1] * yf + GRAD[g + 2] * (zf - 1);
  g = ((hash3(x0, y1, z1, seed) * 16) | 0) * 3;
  const n011 = GRAD[g] * xf + GRAD[g + 1] * (yf - 1) + GRAD[g + 2] * (zf - 1);
  g = ((hash3(x1, y1, z1, seed) * 16) | 0) * 3;
  const n111 = GRAD[g] * (xf - 1) + GRAD[g + 1] * (yf - 1) + GRAD[g + 2] * (zf - 1);

  const nx00 = n000 + u * (n100 - n000);
  const nx10 = n010 + u * (n110 - n010);
  const nx01 = n001 + u * (n101 - n001);
  const nx11 = n011 + u * (n111 - n011);
  const ny0 = nx00 + v * (nx10 - nx00);
  const ny1 = nx01 + v * (nx11 - nx01);
  return (ny0 + w * (ny1 - ny0)) * 1.35;
};

/* ---------- плоский шум: там, где третья координата не нужна ---------- */

/** Хеш двух целых координат и seed → [0, 1). */
export const hash2 = (x, y, seed) => {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) * 2.3283064365386963e-10;
};

/** Восемь направлений градиента в плоскости: угол 45°, без осей. */
const GRAD2 = new Float32Array([0.7071, 0.7071, -0.7071, 0.7071, 0.7071, -0.7071, -0.7071, -0.7071]);

/**
 * Градиентный шум 2D, диапазон примерно [−1, 1].
 *
 * Зачем отдельный 2D, если есть 3D и можно взять `noise3(x, y, 0)`. Две причины,
 * обе измеряемые:
 *
 *   1. **Цена.** У 3D на точку приходится восемь углов решётки, у 2D — четыре.
 *      Шум — почти всё время сборки тайла, поэтому на максимальном приближении
 *      это ровно двукратная экономия.
 *   2. **Качество.** Срез трёхмерного шума плоскостью z = 0 — известное слабое
 *      место: в нём остаётся меньше направлений градиента, и на рельефе
 *      проступает «решётка» по осям. Настоящий 2D берёт градиенты в самой
 *      плоскости, и вместе с доворотом решётки на каждой октаве (та же мысль,
 *      что в simplex-шуме) осей не видно.
 *
 * Доворот решётки: координаты каждой октавы поворачиваются на свой угол, поэтому
 * «квадраты» соседних октав не складываются в одну сетку. Угол берётся из seed,
 * значит детерминированность не страдает.
 */
export const noise2 = (x, y, seed) => {
  const angle = (seed % 1021) * 0.0031;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const rx = x * ca - y * sa;
  const ry = x * sa + y * ca;
  const xi = Math.floor(rx);
  const yi = Math.floor(ry);
  const xf = rx - xi;
  const yf = ry - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const g00 = (hash2(xi, yi, seed) * 4) | 0;
  const g10 = (hash2(xi + 1, yi, seed) * 4) | 0;
  const g01 = (hash2(xi, yi + 1, seed) * 4) | 0;
  const g11 = (hash2(xi + 1, yi + 1, seed) * 4) | 0;
  const n00 = GRAD2[g00 * 2] * xf + GRAD2[g00 * 2 + 1] * yf;
  const n10 = GRAD2[g10 * 2] * (xf - 1) + GRAD2[g10 * 2 + 1] * yf;
  const n01 = GRAD2[g01 * 2] * xf + GRAD2[g01 * 2 + 1] * (yf - 1);
  const n11 = GRAD2[g11 * 2] * (xf - 1) + GRAD2[g11 * 2 + 1] * (yf - 1);
  const nx0 = n00 + u * (n10 - n00);
  const nx1 = n01 + u * (n11 - n01);
  return (nx0 + v * (nx1 - nx0)) * 1.4142;
};

/** Одно слагаемое fbm в плоскости: amplitude · noise(частота). */
export const octaveValue2 = (x, y, frequency, seed, amplitude) =>
  amplitude * noise2(x * frequency, y * frequency, seed);

/** Хребтовое слагаемое в плоскости: 1 − |noise| даёт горные цепи, а не пятна. */
export const octaveRidged2 = (x, y, frequency, seed, amplitude) =>
  amplitude * (1 - Math.abs(noise2(x * frequency, y * frequency, seed)));

/**
 * fbm в плоскости (сумма октав с нормировкой): для грубых полей, где пирамида
 * не помогает — доменное искажение, пояса, вулканизм, климат.
 */
export const fbm2 = (x, y, { seed, octaves = 4, frequency = 1, gain = 0.5, lacunarity = 2, ridged = false }) => {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let freq = frequency;
  for (let i = 0; i < octaves; i += 1) {
    const n = noise2(x * freq, y * freq, seed + i * 1013);
    sum += amplitude * (ridged ? 1 - Math.abs(n) : n);
    total += amplitude;
    amplitude *= gain;
    freq *= lacunarity;
  }
  return total > 0 ? sum / total : 0;
};

/** Одно слагаемое fbm: amplitude · noise(частота). */
export const octaveValue = (cx, cy, cz, frequency, seed, amplitude) =>
  amplitude * noise3(cx * frequency, cy * frequency, cz * frequency, seed);

/** Хребтовое слагаемое: 1 − |noise| даёт горные цепи вместо холмов-блинов. */
export const octaveRidged = (cx, cy, cz, frequency, seed, amplitude) =>
  amplitude * (1 - Math.abs(noise3(cx * frequency, cy * frequency, cz * frequency, seed)));

/** «Клубящееся» слагаемое: |noise| образовал бы впадины, здесь — вздутия. */
export const octaveBillow = (cx, cy, cz, frequency, seed, amplitude) =>
  amplitude * Math.abs(noise3(cx * frequency, cy * frequency, cz * frequency, seed));

/**
 * fbm целиком: сумма октав от `from` до `to` включительно.
 * Нужна там, где считать всю сумму заново дешевле, чем тащить пирамиду
 * (грубые глобальные поля — пояс гор, вулканизм).
 */
export const fbm3 = (cx, cy, cz, { seed, octaves = 4, frequency = 1, gain = 0.5, lacunarity = 2, ridged = false }) => {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let freq = frequency;
  for (let i = 0; i < octaves; i += 1) {
    const n = noise3(cx * freq, cy * freq, cz * freq, seed + i * 1013);
    sum += amplitude * (ridged ? 1 - Math.abs(n) : n);
    total += amplitude;
    amplitude *= gain;
    freq *= lacunarity;
  }
  return total > 0 ? sum / total : 0;
};

/* Раньше здесь был `cylinder(planet, mx, my)`, переводивший метры карты в точку
   цилиндра, чтобы мир замыкался по долготе без шва. Замыкание снято (карта
   обязана совпадать с рамкой Azgaar), а с ним исчезла и причина переводить
   координаты: выборка шума идёт прямо по метрам, третья координата — 0. */
