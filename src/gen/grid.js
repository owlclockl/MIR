/* Крупная решётка мира: где суша, где океан и какие материки получились.

   Зачем она нужна, если есть формула рельефа. Формула отвечает на вопрос «что
   в точке», но не отвечает на вопросы «сколько материков» и «какая доля суши» —
   а это и есть требование к миру. Поэтому мир один раз считается на крупной
   решётке (у Земли шаг около 39 км), и уже по ней:

     • находятся связные куски суши — это и есть материки и острова;
     • считается доля суши в процентах (у Земли 29 %);
     • выбирается точка появления;
     • по этой же решётке работает гидрология (src/gen/hydro.js).

   Решётка не подменяет формулу: колонка блока по-прежнему считается по запросу.
   Решётка — это сводка мира, дешёвая и достаточная, чтобы назвать материки по
   именам и измерить их площадь. */

import { BIOME_IDS, biomeIsLand, pickBiome, WATER_LAKE, WATER_NONE, WATER_OCEAN } from './biomes.js';
import { S } from './terrain.js';
import { hashSeed, rand01 } from './noise.js';
import { CONTINENT_NAMES, CONTINENT_MIN_KM2 } from './continents.js';
import { EARTH_EQUATOR_M, EARTH_POLE_M } from './scale.js';
import { clamp, KM } from './scale.js';

/** Целевой шаг решётки: у Земли ≈ 39 км, как у грубой климатической модели. */
const TARGET_CELL_KM = 39;
const MAX_COLS = 2048;
const MIN_COLS = 48;

/**
 * @param {{planet: object, terrain: object, cols?: number}} options
 */
export const createWorldGrid = ({ planet, terrain, cols }) => {
  const wanted = cols ?? clamp(Math.round(planet.widthKm / TARGET_CELL_KM), MIN_COLS, MAX_COLS);
  const colsX = clamp(Math.round(wanted), MIN_COLS, MAX_COLS);
  const rowsY = clamp(Math.round((colsX * planet.height) / planet.width), MIN_COLS, MAX_COLS);
  const count = colsX * rowsY;
  const cellW = planet.width / colsX;
  const cellH = planet.height / rowsY;
  const cellKm2 = (cellW / KM) * (cellH / KM);
  /* Порог «материк, а не остров» масштабируется размером мира: на Земле это
     3 млн км² (как Австралия), в маленьком мире — его доля от земной. Иначе в
     проверочном мире на 8 млн км² материков не нашлось бы вовсе. */
  const continentMinKm2 = clamp(
    CONTINENT_MIN_KM2 * ((planet.areaKm2 / ((EARTH_EQUATOR_M / KM) * (EARTH_POLE_M / KM)))),
    CONTINENT_MIN_KM2 * 0.0005,
    CONTINENT_MIN_KM2,
  );

  /* Точка решётки — её центр в координатах мира. */
  const cellX = (cx) => (cx + 0.5) * cellW;
  const cellZ = (cy) => (cy + 0.5) * cellH;

  const heights = new Float32Array(count);
  const biomes = new Uint8Array(count);
  const temperature = new Int8Array(count);
  const humidity = new Int8Array(count);
  const precipitation = new Uint16Array(count);
  const land = new Uint8Array(count);
  const out = new Float64Array(24);

  for (let cy = 0; cy < rowsY; cy += 1) {
    for (let cx = 0; cx < colsX; cx += 1) {
      const index = cy * colsX + cx;
      /* detail 2: на шаге в десятки километров мелкий шум не виден, а октавы
         стоят времени. Реки и озёра сюда не входят — они получатся из стока. */
      terrain.sample(cellX(cx), cellZ(cy), 2, out);
      heights[index] = out[S.HEIGHT];
      biomes[index] = out[S.BIOME];
      temperature[index] = Math.round(out[S.TEMPERATURE] * 127);
      humidity[index] = Math.round(out[S.HUMIDITY] * 127);
      precipitation[index] = clamp(out[S.PRECIPITATION], 0, 65535);
      land[index] = out[S.HEIGHT] > planet.seaLevel ? 1 : 0;
    }
  }

  /* Связные куски суши: обход в ширину по четырём соседям. Материк — это
     компонент крупнее CONTINENT_MIN_KM2; всё остальное — острова. */
  const comp = new Int32Array(count).fill(-1);
  const queue = new Int32Array(count);
  const components = [];
  for (let start = 0; start < count; start += 1) {
    if (!land[start] || comp[start] >= 0) continue;
    const id = components.length;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    comp[start] = id;
    let cells = 0;
    let minCx = colsX;
    let maxCx = -1;
    let minCy = rowsY;
    let maxCy = -1;
    let sumX = 0;
    let sumZ = 0;
    while (head < tail) {
      const index = queue[head];
      head += 1;
      const cx = index % colsX;
      const cy = (index - cx) / colsX;
      cells += 1;
      sumX += cellX(cx);
      sumZ += cellZ(cy);
      if (cx < minCx) minCx = cx;
      if (cx > maxCx) maxCx = cx;
      if (cy < minCy) minCy = cy;
      if (cy > maxCy) maxCy = cy;
      /* Соседи: запад, восток, север, юг — порядок обхода фиксирован, чтобы
         результат не зависел от порядка вставки. */
      if (cx > 0) {
        const n = index - 1;
        if (land[n] && comp[n] < 0) { comp[n] = id; queue[tail] = n; tail += 1; }
      }
      if (cx < colsX - 1) {
        const n = index + 1;
        if (land[n] && comp[n] < 0) { comp[n] = id; queue[tail] = n; tail += 1; }
      }
      if (cy > 0) {
        const n = index - colsX;
        if (land[n] && comp[n] < 0) { comp[n] = id; queue[tail] = n; tail += 1; }
      }
      if (cy < rowsY - 1) {
        const n = index + colsX;
        if (land[n] && comp[n] < 0) { comp[n] = id; queue[tail] = n; tail += 1; }
      }
    }
    const areaKm2 = cells * cellKm2;
    components.push({
      id,
      cells,
      areaKm2,
      centerX: sumX / cells,
      centerZ: sumZ / cells,
      minX: minCx * cellW,
      maxX: (maxCx + 1) * cellW,
      minZ: minCy * cellH,
      maxZ: (maxCy + 1) * cellH,
      widthKm: ((maxCx - minCx + 1) * cellW) / KM,
      heightKm: ((maxCy - minCy + 1) * cellH) / KM,
      continent: areaKm2 >= continentMinKm2,
      name: null,
    });
  }

  /* Имена — по площади: самый большой кусок суши получает первое имя. */
  const byArea = [...components].sort((a, b) => b.areaKm2 - a.areaKm2);
  let named = 0;
  for (const component of byArea) {
    if (!component.continent) continue;
    component.name = CONTINENT_NAMES[named % CONTINENT_NAMES.length];
    named += 1;
  }

  let landCells = 0;
  for (let index = 0; index < count; index += 1) if (land[index]) landCells += 1;
  const landKm2 = landCells * cellKm2;
  const continents = byArea.filter((component) => component.continent);
  const islands = byArea.filter((component) => !component.continent);

  const componentByIndex = (index) => (index >= 0 && index < count ? components[comp[index]] ?? null : null);

  const cellAt = (x, z) => {
    const cx = clamp(Math.floor(x / cellW), 0, colsX - 1);
    const cy = clamp(Math.floor(z / cellH), 0, rowsY - 1);
    return { cx, cy, index: cy * colsX + cx };
  };

  /** Высота по решётке: билинейно — рельеф на грубом уровне не «ступенится». */
  const heightAt = (x, z) => {
    const gx = clamp(x / cellW - 0.5, 0, colsX - 1);
    const gz = clamp(z / cellH - 0.5, 0, rowsY - 1);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(colsX - 1, x0 + 1);
    const z1 = Math.min(rowsY - 1, z0 + 1);
    const tx = gx - x0;
    const tz = gz - z0;
    const h00 = heights[z0 * colsX + x0];
    const h10 = heights[z0 * colsX + x1];
    const h01 = heights[z1 * colsX + x0];
    const h11 = heights[z1 * colsX + x1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };

  const componentAt = (x, z) => componentByIndex(cellAt(x, z).index);

  /**
   * Точка появления: как в Minecraft — на суше, у воды, но не в воде. Берём
   * самый большой материк, ищем на нём клетку, у которой есть и суша, и река,
   * иначе — просто сушу у побережья.
   */
  const spawnPoint = () => {
    const main = continents[0] ?? components[0] ?? null;
    const R = hashSeed(`${planet.seed}:spawn`);
    if (!main) {
      return { x: planet.width / 2, z: planet.height / 2, continent: null, coast: false, river: false };
    }
    /* Проходим по всем клеткам материка и выбираем лучшую: у реки и у берега,
       недалеко от середины. Полный проход по решётке дешевле, чем кольца
       вокруг центра, и не зависит от формы материка. */
    let best = null;
    const centerCx = main.centerX / cellW;
    const centerCy = main.centerZ / cellH;
    for (let cy = 0; cy < rowsY; cy += 1) {
      for (let cx = 0; cx < colsX; cx += 1) {
        const index = cy * colsX + cx;
        if (comp[index] !== main.id || !biomeIsLand(biomes[index])) continue;
        let coast = false;
        let river = false;
        for (let ny = -2; ny <= 2; ny += 1) {
          const sy = cy + ny;
          if (sy < 0 || sy >= rowsY) continue;
          for (let nx = -2; nx <= 2; nx += 1) {
            const sx = cx + nx;
            if (sx < 0 || sx >= colsX) continue;
            const neighbour = sy * colsX + sx;
            if (!land[neighbour]) coast = true;
            const biome = biomes[neighbour];
            if (biome === BIOME_IDS.river || biome === BIOME_IDS.frozen_river) river = true;
          }
        }
        /* Приоритет: река у берега, затем берег, затем река, затем просто суша.
           Из равных берём ту, что ближе к середине материка: так точка
           появления не липнет к случайному краю. */
        const priority = (river && coast ? 3 : coast ? 2 : river ? 1 : 0);
        const dx = cx - centerCx;
        const dy = cy - centerCy;
        const ring = Math.sqrt(dx * dx + dy * dy);
        const jitter = rand01(R, cx, cy, 5);
        const score = priority * 1000 - ring * 0.01 + jitter;
        if (!best || score > best.score) best = { score, cx, cy, coast, river, priority };
      }
    }
    const spot = best ?? { cx: clamp(Math.floor(centerCx), 0, colsX - 1), cy: clamp(Math.floor(centerCy), 0, rowsY - 1), coast: false, river: false, priority: 0 };
    /* Смещение внутри клетки: точка появления не обязана быть в её центре. */
    const jitterX = (rand01(R, spot.cx, spot.cy, 11) - 0.5) * cellW * 0.5;
    const jitterZ = (rand01(R, spot.cx, spot.cy, 13) - 0.5) * cellH * 0.5;
    return {
      x: clamp(cellX(spot.cx) + jitterX, 0, planet.width - 1),
      z: clamp(cellZ(spot.cy) + jitterZ, 0, planet.height - 1),
      continent: main,
      coast: spot.coast,
      river: spot.river,
      priority: spot.priority,
    };
  };

  return {
    cols: colsX,
    rows: rowsY,
    count,
    cellW,
    cellH,
    cellKm2,
    heights,
    biomes,
    temperature,
    humidity,
    precipitation,
    land,
    comp,
    components,
    continents,
    islands,
    landKm2,
    continentMinKm2,
    landFraction: landKm2 / planet.areaKm2,
    oceanKm2: planet.areaKm2 - landKm2,
    cellX,
    cellZ,
    cellAt,
    heightAt,
    componentAt,
    spawnPoint,
    /** Пересчёт биома клетки по уже посчитанным полям — для слоёв карты. */
    biomeAt: (cx, cy) => {
      const index = clamp(cy, 0, rowsY - 1) * colsX + clamp(cx, 0, colsX - 1);
      return biomes[index];
    },
    /** Биом с учётом воды: океан и озёра считаются по маске, а не по высоте. */
    waterBiomeAt: (cx, cy) => {
      const index = clamp(cy, 0, rowsY - 1) * colsX + clamp(cx, 0, colsX - 1);
      if (!land[index]) return pickBiome(temperature[index] / 127, humidity[index] / 127, 0, 0, 0, heights[index], planet.seaLevel, WATER_OCEAN, false);
      return biomes[index];
    },
    waterKindAt: (cx, cy) => {
      const index = clamp(cy, 0, rowsY - 1) * colsX + clamp(cx, 0, colsX - 1);
      if (land[index]) return WATER_NONE;
      return heights[index] > planet.seaLevel - 1 ? WATER_LAKE : WATER_OCEAN;
    },
  };
};
