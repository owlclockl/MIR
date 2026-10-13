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
const MOUNTAIN_AMPLITUDE = 250;

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

  /* Периоды в блоках. Крупные слои (эрозия, пояс гор, странность) — сотни
     километров: они решают, где вообще стоят горы и где всхолмлено. Средние
     (гребни, холмы) — единицы и десятки километров: из них состоит пейзаж,
     который видно, идя по земле. Мелкий слой — сотни метров: камни и бугры
     под ногами. Без среднего масштаба мир из самолёта был бы гладким, а из-за
     горизонта — мелким шумом; именно средний масштаб и делает рельеф. */
  const erosionPeriod = span * 0.055;
  const beltPeriod = span * 0.085;
  const ridgePeriod = span * 0.022;
  const ridgeMidPeriod = span * 0.0045;
  const ridgeFinePeriod = span * 0.0009;
  const weirdPeriod = span * 0.03;
  const climatePeriod = span * 0.06;
  const hillsPeriod = span * 0.007;
  const hillsMidPeriod = span * 0.0016;
  const bumpsPeriod = span * 0.0004;
  const patchesPeriod = span * 0.00035;
  const microPeriod = span * 0.00008;
  const trenchPeriod = span * 0.14;

  /* Гидрология мира; null — рек и озёр в мире ещё нет (см. setHydro). */
  let hydro = null;
  const hydroOut = new Float64Array(HV_SIZE);
  const hasHydro = () => hydro !== null && hydro.ready === true;

  /**
   * Высота без рек и озёр: по ней строится сама поверхность и по ней же
   * считает сток гидрология.
   *
   * Число октав у крупных слоёв (эрозия, хребты, всхолмленность, странность)
   * одно и то же на всех уровнях детализации — иначе высота в одной и той же
   * точке зависела бы от того, каким «detail» её спросили, и колонка с
   * решёткой разошлись бы по берегу и руслам. `detail` управляет только
   * мелким слоем (сотни метров), который на грубых уровнях всё равно не виден,
   * зато виден как шум: именно его и убирают грубые уровни пирамиды.
   */
  const baseHeightAt = (x, z, detail = 4, fields = null) => {
    const c = fields ? fields[S.CONTINENTALNESS] : continents.continentalnessAt(x, z, 4);
    const erosion = fields ? fields[S.EROSION] : fbm2(R ^ 0x1b873593, x, z, erosionPeriod, { octaves: 3 });
    let h = heightByContinentalness(c);

    if (c > 0.015) {
      /* Суша: хребты, пояс гор, плато и всхолмленность.
         Рельеф собирается каскадом масштабов — хребет в сотни километров,
         отроги в десятки, промоины в единицы, — и каждый следующий масштаб
         меньше предыдущего по амплитуде. Иначе рельеф вырождается в один
         масштаб: из космоса — ровное поле, из-за горизонта — шишки. */
      const inland = clamp((c - 0.05) / 0.55, 0, 1);
      const relief = clamp((0.35 - erosion) / 1.35, 0, 1) ** 1.6;
      const belt = 1 - clamp(Math.abs(fbm2(R ^ 0x9e3779b9, x, z, beltPeriod, { octaves: 2 })) * 2.4, 0, 1);
      const ridge = fields ? fields[S.PV] : ridged2(R ^ 0x85ebca6b, x, z, ridgePeriod, { octaves: 3 });
      /* Где вообще горы: пояс, податливость пород и внутренность материка. */
      const range = belt * relief * inland;
      const mountains = MOUNTAIN_AMPLITUDE * range * ridge ** 1.6;
      /* Отроги: тот же хребет, но в масштабе десятков километров. Они и
         превращают купол в хребет с распадками. */
      const ridgeMid = ridged2(R ^ 0x2f4f6d21, x, z, ridgeMidPeriod, { octaves: 2 });
      const spurs = 105 * range * (0.3 + 0.7 * ridge) * ridgeMid ** 1.8;
      /* Промоины: единицы километров, только в горах и только вдоль гребней. */
      const ridgeFine = ridged2(R ^ 0x7f4a7c15, x, z, ridgeFinePeriod, { octaves: 2 });
      const gullies = 90 * range * ridge ** 1.1 * ridgeFine ** 1.5;
      const plateau = c > 0.55 ? (c - 0.55) * 90 * clamp((0.8 - erosion) / 1.6, 0, 1) : 0;
      const hills = fbm2(R ^ 0x165667b1, x, z, hillsPeriod, { octaves: 2 })
        * (5 + 22 * (1 - (erosion + 1) / 2)) * (0.35 + 0.65 * inland);
      /* Всхолмленность: десятки километров, мягкая — она есть и на равнине.
         Амплитуда такая, чтобы на глаз с земли рельеф был рельефом, а не
         полем: у равнины перепад в единицы блоков на километр. */
      const rolling = fbm2(R ^ 0x6a09e667, x, z, hillsMidPeriod, { octaves: 2 })
        * (8 + 34 * (1 - (erosion + 1) / 2)) * (0.5 + 0.5 * inland);
      h += mountains + spurs + gullies + plateau + hills + rolling;
    } else if (c < -0.2) {
      /* Океан: жёлобы и сглаженные абиссальные равнины. */
      const trench = ridged2(R ^ 0x27d4eb2f, x, z, trenchPeriod, { octaves: 2 });
      h -= Math.max(0, -c - 0.2) * 6 * trench;
    }

    if (detail >= 4) {
      /* Два самых мелких слоя: бугры в сотни метров и мелочь под ногами. Без
         них берег и русла выглядят линейкой, а с ними появляются камни и
         заводи. На грубых уровнях они не рисуют рельеф, а сыплют шумом по
         пикселю — там они и выключены. */
      const mask = c > 0.015 ? 0.5 + 0.5 * clamp((c - 0.05) / 0.3, 0, 1) : 0.4;
      h += fbm2(R ^ 0x1f83d9ab, x, z, bumpsPeriod, { octaves: 1 }) * 14 * mask;
      h += fbm2(R ^ 0xc2b2ae35, x, z, microPeriod, { octaves: 1 }) * 5;
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
    const c = continents.continentalnessAt(x, z, d >= 4 ? 4 : 3);
    const erosion = fbm2(R ^ 0x1b873593, x, z, erosionPeriod, { octaves: 3 });
    const weirdness = fbm2(R ^ 0x8f1bbcdc, x, z, weirdPeriod, { octaves: 2 });
    const ridge = ridged2(R ^ 0x85ebca6b, x, z, ridgePeriod, { octaves: 3 });

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

    /* Океан — там, где дно ниже уровня моря. Сравниваем с округлённой
       высотой: колонка округляет ту же высоту, и иначе на дне ровно под
       гладью получалась бы вода нулевой глубины — «берег» без берега. */
    if (water === WATER_NONE && Math.round(h) < seaLevel) {
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
    /* Пятна в несколько километров: климат задаёт пояс, а эти пятна — какая
       именно земля под ногами. Без них биом один на сотни километров, и идти
       по нему некуда. */
    const patch = fbm2(R ^ 0xe5b1a7c3, x, z, patchesPeriod, { octaves: 1 });
    const temperature = clamp(latitudeFactor * 0.92 + fbm2(R ^ 0x7feb352d, x, z, climatePeriod, { octaves: 2 }) * 0.3 + patch * 0.1 - altitudeCooling, -1, 1);

    const coastal = 1 - clamp(c / 0.4, 0, 1);
    const dryBelt = Math.exp(-(((Math.abs(latitude) - 26) / 13) ** 2));
    const humidity = clamp(coastal * 0.72 + fbm2(R ^ 0x846ca68b, x, z, climatePeriod * 0.7, { octaves: d >= 3 ? 3 : 2 }) * 0.52 - dryBelt * 0.58 - patch * 0.14, -1, 1);

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
