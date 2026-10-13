/* Колонки и чанки: чем заполняется одна вертикаль и как из колонок собирается чанк.

   Чанк — 16 × 16 колонок на всю высоту мира, как в Minecraft. Хранение —
   Uint8Array с id блоков (их меньше 256, см. blocks.js). Сами блоки в памяти не
   живут: колонка — чистая функция от поля и координат, поэтому дороже стоит
   кэш и его версионирование, чем пересчёт (решение зафиксировано в
   docs/voxel-world-generation.md §8). Палитра нужна экспорту мира и сети лобби.

   Всё, что повторяется блок за блоком, считается на решётке: пещеры — на узлах
   2 × 4 × 2, руда — одна жила на колонку. Поблокирный шум стоил 85 % времени
   генерации чанка (15,8 → 1,9 мс на 256 блоков высоты). */

import {
  AIR,
  BEDROCK,
  BLOCKS,
  CACTUS,
  CLAY,
  COAL_ORE,
  DIRT,
  GOLD_ORE,
  GRASS,
  GEM_ORE,
  ICE,
  IRON_ORE,
  KELP,
  LAVA,
  LILY,
  MOSS,
  OCEAN_FLOOR,
  PODZOL,
  REEDS,
  SALT,
  SAND,
  SANDSTONE,
  SNOW,
  STONE,
  WATER,
  WATER_SOURCE,
  cactusBlocks,
  paletteFor,
  DECOR_RADIUS,
  treeBlocks,
  treeShape,
} from './blocks.js';
import {
  F_BEACH,
  F_ICE,
  F_LAKE,
  F_RIVER,
  F_SEA,
  F_SNOW,
  F_WATER,
  LAKE_LAVA,
  LAKE_SALT,
  biomeAt,
  latticeCell,
  sampleColumn,
  surfaceY as surfaceOf,
} from './field.js';
import { clamp, noise3, rand01 } from './math.js';

export const CHUNK_SX = 16;
export const CHUNK_SZ = 16;

/**
 * Шаги решётки пещер: шум считается на узлах, а не на блоке. Шаг по X/Z = 3
 * а не 2 — пещеры получаются чуть «сырнее», но решётка выходит в 2.5 раза
 * дешевле, а генерация чанка идёт в кадровом бюджете.
 */
export const CAVE_STEP_X = 3;
export const CAVE_STEP_Y = 4;
export const CAVE_STEP_Z = 3;

/**
 * Руды: полосы по высоте. Жила выбирается один раз на колонку и лежит в ней
 * вертикальным скоплением — Minecraft сыпет руду так же, а поблокирный хеш
 * съедал половину времени генерации.
 */
const ORE_VEINS = [
  { id: COAL_ORE, p: 0.05, min: 6, max: 96, size: 5 },
  { id: IRON_ORE, p: 0.03, min: 4, max: 70, size: 4 },
  { id: GOLD_ORE, p: 0.011, min: 2, max: 34, size: 3 },
  { id: GEM_ORE, p: 0.005, min: 1, max: 18, size: 2 },
];

const oreVein = (seed, x, z, height) => {
  let roll = rand01(seed ^ 0x51ed2701, x, z, 77);
  for (const vein of ORE_VEINS) {
    if (roll < vein.p) {
      const span = Math.max(2, Math.min(vein.max, height - 4) - vein.min);
      const from = vein.min + Math.floor(rand01(seed + 1301, x, z, 91) * span);
      const len = 1 + Math.floor(rand01(seed + 211, x, z, 45) * vein.size);
      return { id: vein.id, from, to: Math.min(height - 2, from + len) };
    }
    roll -= vein.p;
  }
  return null;
};

/**
 * Пещерное поле в узле решётки: «сыр» либо пересечение двух червей.
 * Открываться на поверхность не должно — иначе река проваливается в пустоту.
 */
const caveNode = (seed, x, y, z, floorY, water) => {
  const ceiling = floorY - (water ? 4 : 3);
  if (y <= 1 || y >= ceiling) return false;
  if (noise3(seed, x, y, z, 26) > 0.62) return true;
  const depth = clamp(1 - (floorY - y) / Math.max(8, floorY), 0, 1);
  const room = 0.05 + depth * 0.05;
  if (Math.abs(noise3(seed + 977, x, y * 0.6, z, 34)) >= room) return false;
  return Math.abs(noise3(seed + 3121, x, y * 0.6, z, 34)) < room;
};

/**
 * Решётка пещер на чанк. Узлы привязаны к мировым координатам (кратные шагу),
 * а не к началу чанка: иначе два соседних чанка по-разному решают, пустой ли
 * блок на границе, и пещеры расходятся швом.
 */
const buildCaveGrid = (field, x0, z0, sx, sz) => {
  /* Узлы привязаны к мировым кратным шага (floor, а не round: у отрицательных
     координат round округляет к нулю и соседи разошлись бы швом). Размер
     решётки считается от покрываемого диапазона, а не от размеров чанка, —
     иначе чанк с юбкой и чанк без юбки по-разному видят дальний край. */
  const xBase = Math.floor(x0 / CAVE_STEP_X);
  const zBase = Math.floor(z0 / CAVE_STEP_Z);
  const gx = Math.floor((x0 + sx - 1) / CAVE_STEP_X) - xBase + 1;
  const gz = Math.floor((z0 + sz - 1) / CAVE_STEP_Z) - zBase + 1;
  const gy = Math.floor((field.worldHeight - 1) / CAVE_STEP_Y) + 1;
  const grid = new Uint8Array(gx * gz * gy);
  for (let ny = 0; ny < gy; ny += 1) {
    const y = ny * CAVE_STEP_Y;
    for (let nz = 0; nz < gz; nz += 1) {
      const z = (zBase + nz) * CAVE_STEP_Z;
      for (let nx = 0; nx < gx; nx += 1) {
        const x = (xBase + nx) * CAVE_STEP_X;
        const column = sampleColumn(field, x, z);
        grid[(ny * gz + nz) * gx + nx] = caveNode(field.seed, x, y, z, column.y, (column.flags & F_WATER) !== 0) ? 1 : 0;
      }
    }
  }
  return { grid, gx, gz, gy, xBase, zBase };
};

/** Узел решётки над колонкой (x, y, z): 1 — здесь пещера. */
const caveAtNode = (lattice, x, y, z) => {
  const nx = Math.floor(x / CAVE_STEP_X) - lattice.xBase;
  const nz = Math.floor(z / CAVE_STEP_Z) - lattice.zBase;
  const ny = Math.floor(y / CAVE_STEP_Y);
  if (nx < 0 || nz < 0 || ny < 0 || nx >= lattice.gx || nz >= lattice.gz || ny >= lattice.gy) return 0;
  return lattice.grid[(ny * lattice.gz + nz) * lattice.gx + nx];
};

const isReplaceable = (id) => id === AIR || BLOCKS[id]?.replaceable === true;
/** Опции прохода по области влияния: только деревья и кактусы. */
const RING_OPTIONS = { treesOnly: true };

/** Сколько слоёв воды сковывает лёд при такой температуре. */
const iceThickness = (temp) => (temp <= -12 ? 3 : 1);

/* Дно океана выбирается по высоте рельефа, а высота — Float32 с точностью до
   сотых: линейный поиск по полосам на каждом пикселе кадра стоит дороже самой
   отрисовки. Диапазон высот один на все поля (0…255 блоков), поэтому таблица
   строится один раз и на весь мир: 256 записей вместо поиска. */
const OCEAN_BANDS = new Array(256);
const oceanBand = (h) => {
  const key = clamp(Math.round(h), 0, 255);
  const known = OCEAN_BANDS[key];
  if (known) return known;
  const band = OCEAN_FLOOR.find((b) => key >= Math.floor(b.from) && key <= Math.ceil(b.to)) ?? OCEAN_FLOOR[2];
  OCEAN_BANDS[key] = band;
  return band;
};

/** Кэш палитр по клеткам решётки: один на кадр, палитра клетки не меняется. */
export const paletteCache = (field) => new Array(field.cellsX * field.cellsY);

/**
 * Чем покрыта поверхность колонки и чем она подпирается. Одно правило на всех:
 * генератор чанка и кадр обязаны видеть один и тот же блок, иначе граница
 * построенных чанков читается в кадре прямоугольником.
 *
 * Значения передаются по одному, а не объектом: кадр зовёт это на каждом
 * пикселе, и литерал на пиксель стоит дороже всей остальной отрисовки.
 */
const surfaceLayers = (field, out, water, flags, surfaceY, h, lakeType, palette) => {
  const riverOrLake = (flags & (F_RIVER | F_LAKE)) !== 0;
  let top = palette.top;
  let filler = palette.filler;
  let soil = water ? 2 : 3;
  if (water && !riverOrLake) {
    const band = oceanBand(h);
    top = band.top;
    filler = band.filler;
  } else if ((flags & F_BEACH) !== 0 && surfaceY <= field.seaY + 2) {
    top = SAND;
    filler = [SAND, SAND, SANDSTONE];
    soil = 3;
  } else if (lakeType === LAKE_SALT) {
    top = SALT;
    filler = [SALT, CLAY, CLAY];
  }
  if ((flags & F_SNOW) !== 0 && !water && (top === GRASS || top === SAND || top === DIRT || top === PODZOL || top === MOSS)) {
    top = SNOW;
  }
  out.top = top;
  out.filler = filler;
  out.soil = soil;
  out.stone = palette.subsoil ?? STONE;
  return out;
};

/**
 * Верх колонки: где он, чем покрыт и чем подпирается. `column` — что угодно с
 * полями `sampleColumn` (y, waterY, flags, biome, prec, temp, h, lakeType, dir).
 */
export const columnProfile = (field, column, out = {}) => {
  const water = (column.flags & F_WATER) !== 0;
  const surfaceY = clamp(column.y, 0, field.worldHeight - 1);
  const palette = paletteFor(column.biome, column.prec, column.temp, Math.round(column.h));
  out.water = water;
  out.surfaceY = surfaceY;
  out.waterY = water ? clamp(column.waterY, 0, field.worldHeight - 1) : 0;
  out.lava = column.lakeType === LAKE_LAVA;
  out.ice = (column.flags & F_ICE) !== 0;
  out.thickness = iceThickness(column.temp);
  out.flowing = (column.dir ?? 0) !== 0;
  return surfaceLayers(field, out, water, column.flags, surfaceY, column.h, column.lakeType, palette);
};

/**
 * Тот же профиль, но собранный прямо из полей кадра по пикселю (u, v, i):
 * `sampleColumn` создаёт объект, а кадру нужен блок на каждом пикселе. `cells` —
 * кэш палитр из `paletteCache(field)`, `out` — переиспользуемый объект профиля.
 */
export const fieldProfile = (field, u, v, i, out, cells) => {
  const flags = field.flags[i];
  const c = latticeCell(field, u, v);
  const own = field.cellBiome[c];
  const biome = biomeAt(field, u, v, c, own);
  const water = (flags & F_WATER) !== 0;
  const surfaceY = clamp(field.ground[i], 0, field.worldHeight - 1);
  const h = field.base[i];
  /* Палитру кэшируем по клетке: у клетки биом один на сотни пикселей. На
     размытой границе биом соседний — там палитра считается как есть, таких
     пикселей единицы процентов. */
  let palette = null;
  if (biome === own) {
    palette = cells ? cells[c] : null;
    if (!palette) {
      palette = paletteFor(own, field.cellPrec[c], field.cellTemp[c], Math.round(h));
      if (cells) cells[c] = palette;
    }
  } else {
    palette = paletteFor(biome, field.cellPrec[c], field.cellTemp[c], Math.round(h));
  }
  out.water = water;
  out.surfaceY = surfaceY;
  out.waterY = water ? clamp(field.waterY[i], 0, field.worldHeight - 1) : 0;
  out.lava = field.lakeType[i] === LAKE_LAVA;
  out.ice = (flags & F_ICE) !== 0;
  out.thickness = iceThickness(field.cellTemp[c]);
  out.flowing = (field.flow[i] & 15) !== 0;
  return surfaceLayers(field, out, water, flags, surfaceY, h, field.lakeType[i], palette);
};

/**
 * Блок колонки на высоте `y` по её профилю — без руды, пещер и декора: они
 * живут только в построенных чанках.
 */
export const columnBlock = (y, profile) => {
  if (y < 0) return AIR;
  if (y > profile.surfaceY) {
    if (!profile.water || profile.waterY <= profile.surfaceY || y > profile.waterY) return AIR;
    if (profile.lava) return LAVA;
    if (profile.ice && y > profile.waterY - profile.thickness) return ICE;
    return profile.flowing ? WATER : WATER_SOURCE;
  }
  if (y === 0) return BEDROCK;
  if (y === profile.surfaceY) return profile.top;
  if (y > profile.surfaceY - profile.soil) return profile.filler[Math.min(profile.filler.length - 1, profile.surfaceY - y - 1)] ?? DIRT;
  return profile.stone;
};

/**
 * Одна колонка: от y = 0 до вершины мира. `out` пишется на месте по offset —
 * временный буфер и копирование в чанке не нужны, там массив уже обнулён.
 *
 * @returns {{y: number, waterY: number, biome: number, flags: number, column: object}}
 */
export const generateColumn = (field, x, z, out, options = {}) => {
  const offset = options.offset ?? 0;
  const height = field.worldHeight;
  const column = sampleColumn(field, x, z);
  const profile = columnProfile(field, column);
  const { surfaceY, waterY, stone } = profile;
  if (options.clear !== false) out.fill(AIR, offset, offset + height);


  const vein = options.ores === false ? null : oreVein(field.seed, x, z, height);
  const caves = options.caves === false ? null : options.caveGrid ?? null;

  for (let y = 0; y <= surfaceY; y += 1) {
    let id = columnBlock(y, profile);
    if (id === stone && y > 1 && vein && y >= vein.from && y <= vein.to) id = vein.id;
    if (y > 1 && y < surfaceY && caves && caveAtNode(caves, x, y, z)) continue;
    out[offset + y] = id;
  }

  /* Вода, лёд, лава — тем же правилом, что увидит кадр: ярус среза обязан
     попадать в тот же блок, что стоит в чанке. */
  if (profile.water && waterY > surfaceY) {
    for (let y = surfaceY + 1; y <= waterY; y += 1) out[offset + y] = columnBlock(y, profile);
  }
  return { y: surfaceY, waterY, biome: column.biome, flags: column.flags, column };
};

const weighted = (list, value) => {
  if (!list || !list.length) return null;
  let total = 0;
  for (const entry of list) total += entry[1];
  let target = value * total;
  for (const entry of list) {
    target -= entry[1];
    if (target <= 0) return entry;
  }
  return list[0];
};

/**
 * Декор колонки: дерево, кактус, тростник, кувшинка. Решение зависит только от
 * самой колонки, поэтому соседний чанк, дорисовывающий часть кроны, получит
 * ровно те же блоки — швов не будет.
 *
 * @returns {{blocks: number[][], surface: number}|null} смещения [dx, dy, dz, id]
 */
export const columnDecor = (field, x, z, summary, options = {}) => {
  if (!summary || options.decor === false) return null;
  const treesOnly = options.treesOnly === true;
  const { y, waterY, flags, column } = summary;
  const water = (flags & F_WATER) !== 0;
  const palette = paletteFor(column.biome, column.prec, column.temp, Math.round(column.h));
  const density = palette.density ?? 0;

  if (water && y < waterY) {
    if (treesOnly) return null;
    if ((flags & (F_SEA | F_LAKE)) === 0 || waterY - y > 7) return null;
    const roll = rand01(field.seed + 77, column.u, column.v, (column.mx << 1) | column.my);
    if (roll >= Math.max(0.04, density * 0.3)) return null;
    const lake = (flags & F_LAKE) !== 0;
    const id = lake ? LILY : KELP;
    const at = lake ? waterY : Math.min(waterY - 1, y + 1);
    return { blocks: [[0, at - y, 0, id]], surface: y };
  }

  const slope = Math.max(
    Math.abs(surfaceOf(field, x - 1, z) - y),
    Math.abs(surfaceOf(field, x + 1, z) - y),
    Math.abs(surfaceOf(field, x, z - 1) - y),
    Math.abs(surfaceOf(field, x, z + 1) - y),
  );
  if (slope > 2) return null;

  const roll = rand01(field.seed, column.u, column.v, (column.mx << 1) | column.my);
  const trees = palette.trees ?? [];
  if (trees.length && roll < density && y + 16 < field.worldHeight) {
    const pick = weighted(trees, rand01(field.seed + 4111, column.u, column.v, 9));
    if (pick) {
      const logId = pick[0];
      const leafId = pick[2] ?? logId + 10;
      const shape = treeShape(field.seed, column.u, column.v, logId);
      if (logId === CACTUS) return { blocks: cactusBlocks(shape.h), surface: y };
      if (y + shape.h + shape.r + 2 >= field.worldHeight) return null;
      return { blocks: treeBlocks(logId, leafId, shape.h, shape.r), surface: y };
    }
  }
  if (treesOnly) return null;
  const plants = palette.plants ?? [];
  if (plants.length && roll > 0.5 && density > 0) {
    const pick = weighted(plants, rand01(field.seed + 811, column.u, column.v, 11));
    if (pick && rand01(field.seed + 33, column.u, column.v, 17) < 0.35 + density * 0.5) {
      return { blocks: [[0, 1, 0, pick[0]]], surface: y };
    }
  }
  if ((flags & F_RIVER) !== 0 && y === waterY && rand01(field.seed + 909, column.u, column.v, 13) < 0.1) {
    return { blocks: [[0, 1, 0, REEDS]], surface: y };
  }
  return null;
};

/**
 * Только то, что нужно декору колонки: верх рельефа, уровень воды, флаги.
 * Нужен для области влияния — колонки соседей, для которых своего чанка у нас
 * нет и пересчитывать весь столбец смысла нет.
 */
export const columnSummary = (field, x, z) => {
  const column = sampleColumn(field, x, z);
  const water = (column.flags & F_WATER) !== 0;
  return {
    y: clamp(column.y, 0, field.worldHeight - 1),
    waterY: water ? clamp(column.waterY, 0, field.worldHeight - 1) : 0,
    flags: column.flags,
    biome: column.biome,
    column,
  };
};

/**
 * Чанк с «юбкой» в 1 блок по x и z: мешингу нужны соседи краевых колонок, а
 * ждать, пока соседний чанк сгенерируется, — значит получить швы на каждом
 * втором чанке.
 */
export const generateChunk = (field, cx, cz, options = {}) => {
  const skirt = options.skirt === false ? 0 : 1;
  const sx = CHUNK_SX + skirt * 2;
  const sz = CHUNK_SZ + skirt * 2;
  const height = field.worldHeight;
  const blocks = new Uint8Array(sx * sz * height);
  const x0 = cx * CHUNK_SX - skirt;
  const z0 = cz * CHUNK_SZ - skirt;
  const caveGrid = options.caves === false ? null : buildCaveGrid(field, x0, z0, sx, sz);

  const summaries = new Array(sx * sz);
  for (let lz = 0; lz < sz; lz += 1) {
    for (let lx = 0; lx < sx; lx += 1) {
      const base = (lz * sx + lx) * height;
      const summary = generateColumn(field, x0 + lx, z0 + lz, blocks, {
        offset: base,
        clear: false,
        ores: options.ores,
        caves: options.caves,
        caveGrid,
      });
      summaries[lz * sx + lx] = summary;
    }
  }

  /* Декор — вторым проходом: крона лезет в соседние колонки, значит писать её
     надо, когда все колонки чанка уже известны. Проход идёт по области
     влияния (внутренняя часть + DECOR_RADIUS по периметру): крона дерева в
     соседнем чанке пересекает границу, и если писать её только от своих
     колонок, на шве получается срезанная половина кроны. */
  if (options.decor !== false) {
    const from = skirt - DECOR_RADIUS;
    const toX = sx - skirt + DECOR_RADIUS;
    const toZ = sz - skirt + DECOR_RADIUS;
    for (let lz = from; lz < toZ; lz += 1) {
      for (let lx = from; lx < toX; lx += 1) {
        const inside = lx >= 0 && lz >= 0 && lx < sx && lz < sz;
        const summary = inside ? summaries[lz * sx + lx] : columnSummary(field, x0 + lx, z0 + lz);
        if (!inside && !summary) continue;
        /* За пределами чанка ищем только то, что лезет через границу: трава и
           кувшинки — блок 1 × 1 × 1, их writes сам хозяин колонки. */
        const decor = columnDecor(field, x0 + lx, z0 + lz, summary, inside ? options : RING_OPTIONS);
        if (!decor) continue;
        for (const [dx, dy, dz, id] of decor.blocks) {
          const tx = lx + dx;
          const tz = lz + dz;
          if (tx < 0 || tz < 0 || tx >= sx || tz >= sz) continue; // за юбкой — забота соседа
          const y = summary.y + dy;
          if (y < 1 || y >= height) continue;
          const target = (tz * sx + tx) * height + y;
          if (blocks[target] !== AIR && !(isReplaceable(blocks[target]) && isReplaceable(id))) continue;
          blocks[target] = id;
        }
      }
    }
  }

  return { blocks, sx, sz, height, x0, z0, ox: skirt, oz: skirt, cx, cz, summaries };
};

export const blockAt = (chunk, lx, y, lz) => {
  if (!chunk || y < 0 || y >= chunk.height || lx < 0 || lz < 0 || lx >= chunk.sx || lz >= chunk.sz) return AIR;
  return chunk.blocks[(lz * chunk.sx + lx) * chunk.height + y];
};

export const setBlock = (chunk, lx, y, lz, id) => {
  if (y < 0 || y >= chunk.height || lx < 0 || lz < 0 || lx >= chunk.sx || lz >= chunk.sz) return false;
  chunk.blocks[(lz * chunk.sx + lx) * chunk.height + y] = id;
  return true;
};

/** Чанк пуст — ни мешать, ни грузить в GPU нечего. */
export const isChunkEmpty = (chunk) => {
  const { blocks } = chunk;
  for (let i = 0; i < blocks.length; i += 1) if (blocks[i] !== AIR) return false;
  return true;
};

/* ---------- палитра: те же данные в 2-4 раза компактнее ---------- */

/**
 * Сериализация: список id + индексы по 1/2/4/6/8 бит. Нужна экспорту мира и
 * каналу лобби; формат версионируется полем `v` (см. src/game/map-frame.js).
 */
export const encodePalette = (blocks) => {
  const palette = [];
  const index = new Map();
  for (let i = 0; i < blocks.length; i += 1) {
    const id = blocks[i];
    if (!index.has(id)) {
      if (palette.length >= 256) return { v: 1, bits: 8, palette: null, indices: Uint8Array.from(blocks) };
      index.set(id, palette.length);
      palette.push(id);
    }
  }
  const bits = palette.length <= 2 ? 1 : palette.length <= 4 ? 2 : palette.length <= 16 ? 4 : palette.length <= 64 ? 6 : 8;
  const indices = new Uint8Array(blocks.length);
  for (let i = 0; i < blocks.length; i += 1) indices[i] = index.get(blocks[i]);
  return { v: 1, bits, palette, indices };
};

export const decodePalette = ({ v, bits, palette, indices }) => {
  if (v !== 1) throw new Error(`Неизвестная версия палитры чанка: ${v}`);
  if (bits === 8 && !palette) return Uint8Array.from(indices);
  const out = new Uint8Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) out[i] = palette[indices[i]] ?? AIR;
  return out;
};

/** Сводка о чанке: для проверок и отладочной панели. */
export const chunkStats = (chunk) => {
  const counts = new Map();
  let total = 0;
  for (const id of chunk.blocks) {
    if (id === AIR) continue;
    total += 1;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return { total, kinds: counts.size, byId: counts };
};
