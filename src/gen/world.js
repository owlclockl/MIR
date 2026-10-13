/* Мир блоков: собственный генератор в одном месте.

   Здесь собирается всё вместе — материки, рельеф, колонки, постройки, крупная
   решётка и гидрология, — и наружу отдаётся одна ручка: `createBlockWorld`.
   Вид (src/game/mc-world-view.js), подсказки и проверки говорят только с ней.

   Мир конечен. Край карты — край мира: обойти его нельзя, за краем ничего нет
   (никакого зацикливания и никакого дубля). Это и есть требование «континенты,
   а не бесконечный мир»: у мира есть границы, внутри — перечислимые материки,
   измеряемые в километрах и квадратных километрах.

   Готовность мира идёт ступенями, потому что земная карта считается заметно
   дольше кадра:

     1. `continents` — сиды материков и порог суши (десятки миллисекунд);
     2. `terrain`    — формула рельефа и климата (мгновенно, она ленивая);
     3. `grid`       — сводка мира: где суша, где океан, какие материки (≈ 0,5 с);
     4. `hydro`      — реки и озёра по стоку (≈ 0,15 с);
     5. `ready`.

   Вид продвигает ступени порциями по бюджету кадра (`step`), проверки зовут
   `buildAll`. До ступени `grid` мир уже можно смотреть: рельеф и биомы есть,
   рек и списка материков ещё нет. */

import { createColumns, C, COLUMN_SIZE } from './column.js';
import { BIOMES, biomeIsLand, biomeName } from './biomes.js';
import { continentCountFor, createContinents } from './continents.js';
import { createHydro } from './hydro.js';
import { createWorldGrid } from './grid.js';
import {
  areaLabel, createBlockPlanet, digits, EARTH_EQUATOR_M, EARTH_POLE_M, elevationMeters, geoAt,
} from './scale.js';
import { createStructures } from './structures.js';
import { createTerrain, S, SAMPLE_SIZE } from './terrain.js';

export { C, COLUMN_SIZE } from './column.js';
export { S, SAMPLE_SIZE } from './terrain.js';

/** Ступени готовности мира: по ним вид показывает, что именно считается. */
export const STAGE = Object.freeze({
  CONTINENTS: 'continents',
  TERRAIN: 'terrain',
  GRID: 'grid',
  HYDRO: 'hydro',
  READY: 'ready',
});

export const STAGE_LABEL = Object.freeze({
  continents: 'Размечаю материки',
  terrain: 'Считаю рельеф',
  grid: 'Нахожу материки и измеряю сушу',
  hydro: 'Прокладываю реки и озёра',
  ready: 'Мир готов',
});

/**
 * @param {{seed?: string, width?: number, height?: number, continentCount?: number,
 *          landFraction?: number, cols?: number, rivers?: boolean}} [options]
 */
export const createBlockWorld = (options = {}) => {
  const seed = String(options.seed ?? '');
  const width = Math.round(options.width ?? EARTH_EQUATOR_M);
  const height = Math.round(options.height ?? EARTH_POLE_M);
  const rivers = options.rivers !== false;

  const planet = createBlockPlanet({ seed, width, height });
  const continents = createContinents({
    seed,
    width,
    height,
    count: options.continentCount ?? continentCountFor(width, height, seed),
    landFraction: options.landFraction,
  });
  const terrain = createTerrain({ seed, width, height, continents, seaLevel: planet.seaLevel });
  const biomeScratch = new Float64Array(SAMPLE_SIZE);

  /** Биом в точке: нужен постройкам и подсказкам, колонке он уже не нужен. */
  const biomeAt = (x, z) => {
    terrain.sample(x, z, 2, biomeScratch);
    return biomeScratch[S.BIOME];
  };
  const groundAt = (x, z) => {
    terrain.sample(x, z, 2, biomeScratch);
    return Math.round(biomeScratch[S.HEIGHT]);
  };
  /* Постройкам нужен биом и высота участка. Пока решётки нет — спрашиваем
     формулу рельефа, а когда решётка готова — берём готовую клетку: деревенский
     участок спрашивают в каждой колонке, и лишний сэмпл рельефа там ни к чему. */
  const biomeKeyAt = (x, z) => {
    if (grid) return BIOMES[grid.biomes[grid.cellAt(x, z).index]]?.key ?? 'ocean';
    return BIOMES[biomeAt(x, z)]?.key ?? 'ocean';
  };
  const groundAtFast = (x, z) => (grid ? Math.round(grid.heightAt(x, z)) : groundAt(x, z));
  const structures = createStructures({
    planet,
    seed,
    biomeAt: biomeKeyAt,
    groundAt: groundAtFast,
  });
  const columns = createColumns({ planet, terrain, seed, structures });

  let grid = null;
  let hydro = null;
  let stage = STAGE.CONTINENTS;
  let revision = 0;

  const buildGrid = () => {
    grid = createWorldGrid({ planet, terrain, cols: options.cols });
    stage = STAGE.GRID;
    revision += 1;
  };
  const buildHydro = () => {
    hydro = rivers ? createHydro({ planet, grid }) : null;
    terrain.setHydro(hydro);
    stage = STAGE.HYDRO;
    revision += 1;
  };

  /** Продвинуть готовность мира на бюджет кадра. Возвращает состояние. */
  const step = (budgetMs = 6) => {
    const started = performance.now();
    if (stage === STAGE.CONTINENTS) {
      stage = STAGE.TERRAIN;
      revision += 1;
      return { stage, done: false, ms: performance.now() - started, progress: 0.1 };
    }
    if (stage === STAGE.TERRAIN) {
      /* Решётка одна: за один шаг её не разбить на части, но это самое долгое
         место — о нём и сообщаем прогрессом. */
      buildGrid();
      return { stage, done: false, ms: performance.now() - started, progress: 0.5 };
    }
    if (stage === STAGE.GRID) {
      buildHydro();
      return { stage, done: true, ms: performance.now() - started, progress: 1 };
    }
    return { stage, done: true, ms: 0, progress: 1 };
  };

  const buildAll = () => {
    if (stage === STAGE.CONTINENTS || stage === STAGE.TERRAIN) buildGrid();
    if (stage === STAGE.GRID) buildHydro();
    stage = STAGE.READY;
    return api;
  };

  /* Край мира — жёсткая граница: за ним ничего нет, а не «продолжение шума».
     Поэтому координата прижимается к краю: камера не уходит за границу, а
     выборка соседа у самого края даёт ту же колонку, что и край. */
  const clampX = (x) => (x < 0 ? 0 : x > width - 1 ? width - 1 : x);
  const clampZ = (z) => (z < 0 ? 0 : z > height - 1 ? height - 1 : z);
  const sampleInto = (x, z, detail, out) => terrain.sample(clampX(x), clampZ(z), detail, out);

  /** Точка появления: она же «место игрока», как world spawn в Minecraft. */
  let spawnCache = null;
  const spawn = () => {
    if (spawnCache) return spawnCache;
    const fallback = { x: width / 2, z: height / 2, continent: null, coast: false, river: false, surface: Math.round(planet.seaLevel) };
    if (!grid) {
      /* До решётки точку взять неоткуда: говорим об этом честно. */
      spawnCache = fallback;
      return spawnCache;
    }
    const point = grid.spawnPoint();
    const surface = columns.columnInfo(point.x, point.z).height;
    spawnCache = { ...point, surface };
    return spawnCache;
  };

  /** Сводка мира: по ней интерфейс рассказывает, что за мир получился. */
  const stats = () => {
    const base = {
      stage,
      seed,
      width,
      height,
      widthKm: planet.widthKm,
      heightKm: planet.heightKm,
      areaKm2: planet.areaKm2,
      areaLabel: areaLabel(planet.areaKm2),
      continentSeeds: continents.count,
      landFraction: grid ? grid.landFraction : null,
      landKm2: grid ? grid.landKm2 : null,
      oceanKm2: grid ? grid.oceanKm2 : null,
      continents: grid ? grid.continents.map((continent) => ({
        name: continent.name,
        areaKm2: continent.areaKm2,
        areaLabel: areaLabel(continent.areaKm2),
        cells: continent.cells,
        centerX: continent.centerX,
        centerZ: continent.centerZ,
        widthKm: continent.widthKm,
        heightKm: continent.heightKm,
      })) : [],
      islands: grid ? grid.islands.length : null,
      biggestIslandKm2: grid && grid.islands[0] ? grid.islands[0].areaKm2 : null,
      rivers: hydro ? hydro.stats.rivers : null,
      lakes: hydro ? hydro.stats.lakes : null,
      biggestLakeKm2: hydro ? hydro.stats.biggestLakeKm2 : null,
      longestRiverKm: hydro ? hydro.stats.longestRiverKm : null,
      maxDischargeKm2: hydro ? hydro.stats.maxDischargeKm2 : null,
      gridCols: grid ? grid.cols : null,
      gridRows: grid ? grid.rows : null,
      cellKm: grid ? Math.round(grid.cellW / 1000) : null,
    };
    return base;
  };

  /** Одной строкой: «материки: 6 · суша 28,5 % · рек 5 811 · озёр 2 370». */
  const summary = () => {
    const parts = [];
    if (grid) {
      parts.push(`материки: ${grid.continents.length}`);
      parts.push(`суша ${(grid.landFraction * 100).toFixed(1).replace('.', ',')} %`);
      parts.push(`острова: ${grid.islands.length}`);
    }
    if (hydro) {
      parts.push(`рек: ${digits(hydro.stats.rivers)}`);
      parts.push(`озёр: ${digits(hydro.stats.lakes)}`);
      if (hydro.stats.longestRiverKm > 100) parts.push(`длиннейшая река ≈ ${digits(hydro.stats.longestRiverKm)} км`);
    }
    return parts.join(' · ');
  };

  const api = {
    planet,
    seed,
    width,
    height,
    continents,
    terrain,
    columns,
    structures,

    get grid() {
      return grid;
    },
    get hydro() {
      return hydro;
    },
    get stage() {
      return stage;
    },
    get ready() {
      return stage === STAGE.READY || stage === STAGE.HYDRO;
    },
    get revision() {
      return revision;
    },

    step,
    buildAll,
    sampleInto,
    sample: (x, z, detail = 4) => terrain.sampleInfo(clampX(x), clampZ(z), detail),
    biomeAt: (x, z) => biomeAt(clampX(x), clampZ(z)),
    biomeName: (x, z) => biomeName(biomeAt(clampX(x), clampZ(z))),
    groundAt: (x, z) => groundAt(clampX(x), clampZ(z)),
    columnAt: (x, z, out) => columns.columnAt(clampX(x), clampZ(z), out),
    columnInfo: (x, z) => columns.columnInfo(clampX(x), clampZ(z)),
    blockAt: (x, y, z) => columns.blockAt(clampX(x), Math.round(y), clampZ(z)),
    blockInColumn: columns.blockInColumn,
    isCave: columns.isCave,
    oreAt: columns.oreAt,
    spawn,
    stats,
    summary,
    geoAt: (x, z) => geoAt(planet, x, z),
    elevationMeters,
    /** Материк в точке: имя и площадь — то, что показывает подсказка. */
    continentAt: (x, z) => (grid ? grid.componentAt(x, z) : null),
    landAt: (x, z) => {
      const id = biomeAt(x, z);
      return biomeIsLand(id);
    },
    villageAt: (x, z) => structures.at(clampX(x), clampZ(z)),
    villagesIn: (x0, z0, x1, z1) => structures.villagesIn(clampX(x0), clampZ(z0), clampX(x1), clampZ(z1)),
    /** Край мира: за него не пускает ни камера, ни выборка координат. */
    border: { width, height, minX: 0, minZ: 0, maxX: width - 1, maxZ: height - 1 },
    dispose: () => {
      structures.clear();
      spawnCache = null;
    },
  };
  return api;
};
