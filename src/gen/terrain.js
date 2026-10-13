/* Рельеф: мультишумовой сэмплер уровня Земли.

   Здесь живёт формула высоты — единственное место, где мир вычисляется. Она
   устроена как в Minecraft (multi-noise terrain в 1.18+), но настроена на
   земные масштабы:

     • континентальность (continentalness) берётся из материков
       (src/gen/continents.js): −1 открытый океан, 0 берег, 1 внутри материка;
     • по ней таблица высот (сплайн): шельф, прибрежная низменность, плато;
     • эрозия решает, что это будет — плоскость или хребет; в Minecraft ровно
       так же эрозия гасит горы;
     • гребневый шум (peaks and valleys) даёт сами хребты, а «пояс гор»
       привязан к отдельному шуму: горы встают полосами, как на Земле, а не
       точками по всей карте;
     • температура — от широты (экватор тёплый, полюса холодные) и высоты,
       влажность — от близости океана и от сухих субтропиков на ±26° широты.

   Один вызов sample() отдаёт все поля сразу: вид, биом и HUD берут их из
   одного вычисления, поэтому не бывает «на карте лес, а под курсором тайга».

   Гидрология (реки и озёра) подключается позже и узнаётся через setHydro():
   до этого мир уже есть, но рек в нём ещё нет. */

import { pickBiome, WATER_LAKE, WATER_NONE, WATER_OCEAN, WATER_RIVER } from './biomes.js';
import { fbm2, hashSeed, ridged2, spline } from './noise.js';
import { clamp, SEA_LEVEL, WORLD_Y } from './scale.js';

/** Индексы полей в сэмпле: сэмплер пишет в массив, а не в объект. */
export const S = Object.freeze({
  CONTINENTALNESS: 0,
  EROSION: 1,
  PV: 2,
  WEIRDNESS: 3,
  TEMPERATURE: 4,
  HUMIDITY: 5,
  HEIGHT: 6,
  BIOME: 7,
  CONTINENT: 8,
  PRECIPITATION: 9,
  WATER: 10,
  WATER_Y: 11,
  RIVER_WIDTH: 12,
  RIVER_AREA: 13,
  LAKE_DEPTH: 14,
  LATITUDE: 15,
  LAND: 16,
  SNOW: 17,
  MOUNTAIN: 18,
  BASE_HEIGHT: 19,
});
export const SAMPLE_SIZE = 20;

/** Индексы полей гидрологии: тот же приём — массив вместо объекта. */
export const HV = Object.freeze({ KIND: 0, WATER_Y: 1, WIDTH: 2, AREA: 3, DEPTH: 4 });
export const HV_SIZE = 5;

/** Таблица высот по континентальности: от абиссали до внутренности материка. */
const heightByContinentalness = spline([
  [-1, 5],
  [-0.75, 14],
  [-0.5, 28],
  [-0.3, 45],
  [-0.14, 56],
  [-0.02, 61],
  [0, SEA_LEVEL],
  [0.05, 65],
  [0.2, 69],
  [0.45, 74],
  [0.7, 80],
  [1, 88],
]);

/** Крутизна склонов: сколько блоков даёт единица гребневого шума. */
const MOUNTAIN_AMPLITUDE = 236;

/**
 * @param {{seed?: string, width: number, height: number, continents: object, seaLevel?: number}} options
 */
export const createTerrain = (options) => {
  const seed = String(options.seed ?? '');
  const width = options.width;
  const height = options.height;
  const seaLevel = options.seaLevel ?? SEA_LEVEL;
  const continents = options.continents;
  const R = hashSeed(seed);
  const span = Math.min(width, height);

  /* Периоды в блоках: у Земли это десятки и сотни километров. */
  const erosionPeriod = span * 0.055;
  const beltPeriod = span * 0.085;
  const ridgePeriod = span * 0.022;
  const weirdPeriod = span * 0.03;
  const climatePeriod = span * 0.06;
  const hillsPeriod = span * 0.007;
  const microPeriod = span * 0.0009;
  const trenchPeriod = span * 0.14;

  /* Гидрология мира; null — рек и озёр в мире ещё нет (см. setHydro). */
  let hydro = null;
  const hydroOut = new Float64Array(HV_SIZE);
  const hasHydro = () => hydro !== null && hydro.ready === true;

  /**
   * Высота без рек и озёр: по ней строится сама поверхность и по ней же
   * считает сток гидрология. `detail` — сколько мелких октав добавлять:
   * на грубых уровнях пирамиды мелочь не видна, а стоит столько же.
   */
  const baseHeightAt = (x, z, detail = 4, fields = null) => {
    const c = fields ? fields[S.CONTINENTALNESS] : continents.continentalnessAt(x, z, detail);
    const erosion = fields ? fields[S.EROSION] : fbm2(R ^ 0x1b873593, x, z, erosionPeriod, { octaves: detail >= 3 ? 3 : 2 });
    let h = heightByContinentalness(c);

    if (c > 0.015) {
      /* Суша: хребты, пояс гор, плато и всхолмленность. */
      const inland = clamp((c - 0.05) / 0.55, 0, 1);
      const relief = clamp((0.35 - erosion) / 1.35, 0, 1) ** 1.6;
      const belt = 1 - clamp(Math.abs(fbm2(R ^ 0x9e3779b9, x, z, beltPeriod, { octaves: 2 })) * 2.4, 0, 1);
      const ridge = fields ? fields[S.PV] : ridged2(R ^ 0x85ebca6b, x, z, ridgePeriod, { octaves: detail >= 3 ? 3 : 2 });
      const mountains = MOUNTAIN_AMPLITUDE * belt * relief * inland * ridge ** 1.7;
      const plateau = c > 0.55 ? (c - 0.55) * 90 * clamp((0.8 - erosion) / 1.6, 0, 1) : 0;
      const hills = fbm2(R ^ 0x165667b1, x, z, hillsPeriod, { octaves: detail >= 3 ? 2 : 1 })
        * (5 + 22 * (1 - (erosion + 1) / 2)) * (0.35 + 0.65 * inland);
      h += mountains + plateau + hills;
    } else if (c < -0.2) {
      /* Океан: жёлобы и сглаженные абиссальные равнины. */
      const trench = ridged2(R ^ 0x27d4eb2f, x, z, trenchPeriod, { octaves: 2 });
      h -= Math.max(0, -c - 0.2) * 6 * trench;
    }

    if (detail >= 4) {
      /* Мелочь уровня «несколько сотен метров»: без неё берег и русла выглядят
         линейкой, а с ней появляются камни, бугры и заводи. */
      h += fbm2(R ^ 0xc2b2ae35, x, z, microPeriod, { octaves: 2 }) * 2.6;
    }
    /* Поверхность не выходит за мир блоков: иначе крона и вода упирались бы в
       потолок, а срез выше мира был бы пустым. */
    return clamp(h, 1, WORLD_Y - 1);
  };

  /**
   * Полный сэмпл мира в точку. Пишет поля в `out` (Float64Array SAMPLE_SIZE).
   *
   * @param {number} x блоков от западного края
   * @param {number} z блоков от северного края
   * @param {number} detail 1…4 — уровень детализации пирамиды
   * @param {Float64Array} out
   */
  const sample = (x, z, detail, out) => {
    const d = detail;
    const c = continents.continentalnessAt(x, z, d);
    const erosion = fbm2(R ^ 0x1b873593, x, z, erosionPeriod, { octaves: d >= 3 ? 3 : 2 });
    const weirdness = fbm2(R ^ 0x8f1bbcdc, x, z, weirdPeriod, { octaves: d >= 3 ? 2 : 1 });
    const ridge = ridged2(R ^ 0x85ebca6b, x, z, ridgePeriod, { octaves: d >= 3 ? 3 : 2 });

    out[S.CONTINENTALNESS] = c;
    out[S.EROSION] = erosion;
    out[S.PV] = ridge;
    out[S.WEIRDNESS] = weirdness;

    let h = baseHeightAt(x, z, d, out);
    out[S.BASE_HEIGHT] = h;

    /* Гидрология: русло ниже глади, озёрная гладь прижимает дно вниз. */
    let water = WATER_NONE;
    let waterY = seaLevel;
    let riverWidth = 0;
    let riverArea = 0;
    let lakeDepth = 0;
    if (hasHydro()) {
      hydro.sample(x, z, hydroOut);
      const kind = hydroOut[HV.KIND];
      if (kind === 1) {
        /* Река: дно долины ниже глади реки. */
        const surface = hydroOut[HV.WATER_Y];
        const depth = hydroOut[HV.DEPTH];
        const bed = surface - depth;
        /* Русло вырезается вровень с дном: глубина уже сглажена по ширине
           самой гидрологией, поэтому отдельный профиль здесь не нужен. */
        if (h > bed) h = bed;
        riverWidth = hydroOut[HV.WIDTH];
        riverArea = hydroOut[HV.AREA];
        water = WATER_RIVER;
        waterY = surface;
        out[S.RIVER_WIDTH] = riverWidth;
        out[S.RIVER_AREA] = riverArea;
      } else if (kind === 2) {
        /* Озеро: гладь ровная, дно прижато ниже глади. */
        const surface = hydroOut[HV.WATER_Y];
        lakeDepth = Math.max(0, surface - h);
        if (h > surface - 1) h = surface - 1;
        water = WATER_LAKE;
        waterY = surface;
        out[S.LAKE_DEPTH] = lakeDepth;
      }
      if (water === WATER_NONE) out[S.LAKE_DEPTH] = 0;
    } else {
      out[S.RIVER_WIDTH] = 0;
      out[S.RIVER_AREA] = 0;
      out[S.LAKE_DEPTH] = 0;
    }

    if (water === WATER_NONE && h < seaLevel) {
      water = WATER_OCEAN;
      waterY = seaLevel;
    }
    if (water !== WATER_NONE && h >= waterY) {
      /* Точка над гладью: значит, это уже не вода (островок, обрыв берега). */
      water = WATER_NONE;
    }

    /* Климат: широта + шум − охлаждение высотой. */
    const latitude = 90 - (z / height) * 180;
    const latitudeFactor = 1 - 2 * (Math.abs(latitude) / 90) ** 1.35;
    const altitudeCooling = clamp((h - seaLevel) / 280, 0, 0.65);
    const temperature = clamp(latitudeFactor * 0.92 + fbm2(R ^ 0x7feb352d, x, z, climatePeriod, { octaves: 2 }) * 0.3 - altitudeCooling, -1, 1);

    const coastal = 1 - clamp(c / 0.4, 0, 1);
    const dryBelt = Math.exp(-(((Math.abs(latitude) - 26) / 13) ** 2));
    const humidity = clamp(coastal * 0.72 + fbm2(R ^ 0x846ca68b, x, z, climatePeriod * 0.7, { octaves: d >= 3 ? 3 : 2 }) * 0.52 - dryBelt * 0.58, -1, 1);

    const mountainous = erosion < -0.35 || h > seaLevel + 96;
    const biome = pickBiome(temperature, humidity, c, erosion, weirdness, h, seaLevel, water, mountainous);
    const precipitation = Math.round(2400 * clamp((humidity + 1) / 2, 0, 1) ** 1.6 * (0.45 + 0.55 * Math.max(0, temperature)));

    out[S.TEMPERATURE] = temperature;
    out[S.HUMIDITY] = humidity;
    out[S.HEIGHT] = h;
    out[S.BIOME] = biome;
    out[S.PRECIPITATION] = precipitation;
    out[S.WATER] = water;
    out[S.WATER_Y] = waterY;
    out[S.LATITUDE] = latitude;
    out[S.LAND] = h > seaLevel && water === WATER_NONE ? 1 : 0;
    out[S.SNOW] = temperature < -0.35 || h > seaLevel + 130 ? 1 : 0;
    out[S.MOUNTAIN] = mountainous ? 1 : 0;
    if (water === WATER_NONE) {
      out[S.RIVER_WIDTH] = 0;
      out[S.RIVER_AREA] = 0;
    }
    return out;
  };

  const sampleInfo = (x, z, detail = 4) => {
    const out = new Float64Array(SAMPLE_SIZE);
    sample(x, z, detail, out);
    return {
      x,
      z,
      continentalness: out[S.CONTINENTALNESS],
      erosion: out[S.EROSION],
      ridge: out[S.PV],
      weirdness: out[S.WEIRDNESS],
      temperature: out[S.TEMPERATURE],
      humidity: out[S.HUMIDITY],
      height: out[S.HEIGHT],
      baseHeight: out[S.BASE_HEIGHT],
      biome: out[S.BIOME],
      precipitation: out[S.PRECIPITATION],
      water: out[S.WATER],
      waterY: out[S.WATER_Y],
      riverWidth: out[S.RIVER_WIDTH],
      riverArea: out[S.RIVER_AREA],
      lakeDepth: out[S.LAKE_DEPTH],
      latitude: out[S.LATITUDE],
      land: out[S.LAND] === 1,
      snow: out[S.SNOW] === 1,
      mountain: out[S.MOUNTAIN] === 1,
    };
  };

  return {
    seed,
    width,
    height,
    seaLevel,
    worldY: WORLD_Y,
    continents,
    baseHeightAt,
    sample,
    sampleInfo,
    /** Подключить гидрологию: до этого реки в мире не вырезаны. */
    setHydro: (value) => {
      hydro = value;
    },
    get hydro() {
      return hydro;
    },
    get hasRivers() {
      return hasHydro();
    },
  };
};
