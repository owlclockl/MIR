/* Материки: не «шум везде», а конечное число континентов земного вида.

   Идея простая и намеренно не шумовая. В бесконечном мире Minecraft материки
   получаются сами из фрактального шума, потому что мира нет конца. У нашего
   мира конец есть (край карты — край мира), и требование звучит иначе:
   «сгенерируй материки». Поэтому материки здесь — сущности:

     • сиды континентов (6 ± 2, как на Земле) раскладываются по карте;
     • каждый даёт эллиптическую «плиту» с доменным искажением — форма не
       круглая, а с заливами, полуостровами и перешейками;
     • у берега подмешиваются островные дуги и архипелаги;
     • порог «суша/вода» калибруется по доле суши: на Земле суша — 29 %
       поверхности, и мир обязан выглядеть так же, а не «как получится».

   Из этого выходит главное свойство: океан между материками глубокий и
   настоящий, а не случайная дырка в шуме, и количество материков известно
   заранее — их можно перечислить, назвать и измерить (см. src/gen/grid.js). */

import { hashSeed, fbm2, rand01, ridged2, warp2 } from './noise.js';
import { clamp, EARTH_EQUATOR_M, EARTH_POLE_M } from './scale.js';

const EARTH_AREA_KM2 = (EARTH_EQUATOR_M / 1000) * (EARTH_POLE_M / 1000);
/** Доля суши на Земле: 29 % — по ней калибруется порог. */
export const EARTH_LAND_FRACTION = 0.29;
/** Порог, с которого кусок суши считается материком, а не островом (км²). */
export const CONTINENT_MIN_KM2 = 3_000_000;
/** Область, где подмешиваются островные дуги: у самого берега материка. */
const ARC_BAND = 0.3;

/**
 * Названия: их получают куски суши по убыванию площади — самый большой
 * называется первым. Список длиннее любого возможного числа материков: если
 * имена кончатся, остров остаётся безымянным (в интерфейсе — «безымянный
 * остров»).
 */
export const CONTINENT_NAMES = Object.freeze([
  'Эрдеван', 'Валория', 'Сармат', 'Киммерия', 'Атлан', 'Гондван',
  'Лавразия', 'Тартария', 'Аврелия', 'Зеланд', 'Нордланд', 'Терра Australis',
  'Инсула', 'Кордильера', 'Мегалазия', 'Ориента', 'Гиперборея', 'Панталасса',
  'Мезогея', 'Аркадия', 'Эректус', 'Титан', 'Сколоп', 'Авалон',
]);

/**
 * Сколько материков у мира такого размера. Земля даёт шесть; маленький мир
 * (проверки, демонстрация) — один-два, иначе на карте не осталось бы воды.
 */
export const continentCountFor = (width, height, seed = '') => {
  const share = (width * height) / (EARTH_EQUATOR_M * EARTH_POLE_M);
  const base = Math.sqrt(Math.max(share, 0));
  const spread = rand01(hashSeed(seed), 11, 3, 7);
  const wanted = 5 + Math.round(spread * 3); // 5…8
  const scaled = Math.round(wanted * base);
  return clamp(scaled, 1, 9);
};

/**
 * Раскладка сидов: сетка «jittered grid» — ни слипаний, ни идеального порядка.
 * Радиусы разные: так у мира есть и крупный материк, и материк-малыш.
 */
const laySeeds = (seed, count, width, height) => {
  const R = hashSeed(seed);
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const seeds = [];
  /* Площадь круга, приходящаяся на один материк: доля суши, делённая на число
     материков. Радиус берём с запасом: калибровка потом отрежет лишнее. */
  const cellArea = (width / cols) * (height / rows);
  const baseRadius = Math.sqrt((cellArea * EARTH_LAND_FRACTION * 1.9) / Math.PI);
  for (let i = 0; i < count; i += 1) {
    const gx = i % cols;
    const gy = Math.floor(i / cols);
    const jx = rand01(R, i, 101, 1);
    const jy = rand01(R, i, 103, 2);
    const jr = rand01(R, i, 107, 3);
    const je = rand01(R, i, 109, 4);
    const cx = ((gx + 0.2 + jx * 0.6) / cols) * width;
    const cy = ((gy + 0.2 + jy * 0.6) / rows) * height;
    /* Радиус: от 0.65 до 1.5 базового — крупный материк и «карлик». */
    const radius = baseRadius * (0.65 + jr * 0.85);
    /* Эллипс: вытянутость задаёт полуострова и перешейки, угол — направление. */
    const stretch = 0.55 + je * 0.55;
    const angle = je * Math.PI;
    seeds.push({
      id: i,
      x: cx,
      z: cy,
      radius,
      stretch,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      weight: 0.8 + jr * 0.4,
    });
  }
  return seeds;
};

/**
 * Материки мира: сиды, порог суши и функция континентальности.
 *
 * Континентальность — та же величина, что в Minecraft зовётся continentalness:
 * она входит в таблицу высот (src/gen/terrain.js) и в выбор биома. −1 — открытый
 * океан, 0 — берег, 1 — внутренность материка.
 *
 * @param {{seed?: string, width?: number, height?: number, count?: number,
 *          landFraction?: number}} [options]
 */
export const createContinents = (options = {}) => {
  const seed = String(options.seed ?? '');
  const width = Math.max(64, Math.round(options.width ?? EARTH_EQUATOR_M));
  const height = Math.max(64, Math.round(options.height ?? EARTH_POLE_M));
  const landFraction = clamp(options.landFraction ?? EARTH_LAND_FRACTION, 0.02, 0.85);
  const count = clamp(Math.round(options.count ?? continentCountFor(width, height, seed)), 1, 9);
  const R = hashSeed(seed);
  const seeds = laySeeds(seed, count, width, height);

  /* Периоды в долях карты: у Земли материк — это тысячи километров, поэтому
     шум берётся с периодом в десятки градусов, а не в километры. */
  const span = Math.min(width, height);
  const warpPeriod = span * 0.12;
  const warpStrength = span * 0.035;
  const fractalPeriod = span * 0.05;
  const arcPeriod = span * 0.012;
  const out = new Float64Array(2);

  /**
   * Сырая маска суши: > 0 — суша, < 0 — океан. Ноль порога калибруется ниже,
   * поэтому пока это просто «форма материков».
   */
  const rawMask = (x, z, detail = 4) => {
    warp2(R, x, z, warpPeriod, warpStrength, out);
    const wx = out[0];
    const wz = out[1];
    let best = -Infinity;
    for (let i = 0; i < seeds.length; i += 1) {
      const s = seeds[i];
      const dx = wx - s.x;
      const dz = wz - s.z;
      /* Поворот на угол сида, затем сжатие по одной оси — эллипс. */
      const rx = (dx * s.cos + dz * s.sin) / s.radius;
      const rz = (-dx * s.sin + dz * s.cos) / (s.radius * s.stretch);
      const d = Math.sqrt(rx * rx + rz * rz);
      const value = (1 - d) * s.weight;
      if (value > best) best = value;
    }
    /* Фрактальная береговая линия: без неё материк — это овал. */
    /* Октавы зависят от уровня детализации: на грубых уровнях пирамиды мельче
       сотни километров всё равно не видно, а стоят они столько же. */
    const fractal = fbm2(R ^ 0x5bf03635, x, z, fractalPeriod, { octaves: detail >= 3 ? 3 : 2 }) * 0.24
      + (detail >= 3 ? fbm2(R ^ 0x27d4eb2f, x, z, fractalPeriod * 0.22, { octaves: 2 }) * 0.06 : 0);
    /* Островные дуги: подмешиваются там, где маска близка к нулю — у берега. */
    const arc = ridged2(R ^ 0x165667b1, x, z, arcPeriod, { octaves: 2 });
    const arcBand = Math.max(0, 1 - Math.abs(best) / ARC_BAND);
    return best + fractal + (arc - 0.55) * 0.3 * arcBand;
  };
  const mask = rawMask;

  /* Калибровка порога: доля суши должна совпасть с земной. Считаем маску на
     редкой решётке (десятки тысяч точек) и берём квантиль — сортировка такого
     массива мгновенна, а точность порога достаточна: он не «плывёт» от seed. */
  const calibCols = 192;
  const calibRows = Math.max(32, Math.round((calibCols * height) / width));
  const samples = new Float32Array(calibCols * calibRows);
  let k = 0;
  for (let iz = 0; iz < calibRows; iz += 1) {
    const z = ((iz + 0.5) / calibRows) * height;
    for (let ix = 0; ix < calibCols; ix += 1) {
      const x = ((ix + 0.5) / calibCols) * width;
      samples[k] = rawMask(x, z);
      k += 1;
    }
  }
  const sorted = Float32Array.from(samples).sort();
  const threshold = sorted[clamp(Math.floor(sorted.length * (1 - landFraction)), 0, sorted.length - 1)];

  /* Размах по обе стороны порога: по нему маска превращается в −1…1. Размахи
     разные: океанский склон длиннее — так шельф переходит в абиссаль плавно. */
  const spreadLand = Math.max(0.08, percentile(sorted, 1 - landFraction * 0.35) - threshold);
  const spreadOcean = Math.max(0.12, threshold - percentile(sorted, 1 - landFraction - 0.45));

  const continentalnessAt = (x, z, detail = 4) => {
    const value = rawMask(x, z, detail) - threshold;
    return value >= 0
      ? clamp(value / spreadLand, 0, 1)
      : clamp(value / spreadOcean, -1, 0);
  };

  return {
    seed,
    width,
    height,
    count,
    seeds,
    landFraction,
    threshold,
    spreadLand,
    spreadOcean,
    mask,
    continentalnessAt,
    /** Доля суши по маске: по ней проверяется, что калибровка сработала. */
    isLand: (x, z, detail = 4) => rawMask(x, z, detail) >= threshold,
  };
};

/** Квантиль по уже отсортированному массиву (0…1). */
const percentile = (sorted, q) => {
  const index = clamp(Math.round((sorted.length - 1) * q), 0, sorted.length - 1);
  return sorted[index];
};
