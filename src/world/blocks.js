/* Реестр блоков, палитры биомов и формы растений.
   Идентификаторы блоков должны влезать в Uint8Array (< 256) — на этом держится
   хранение чанка. Текстуры — не файлы, а индексы в процедурный атлас
   (src/world/atlas.js), поэтому репозиторий и однофайловая сборка не тяжелеют.
   Номера биомов совпадают с Azgaar (pack.biomes): 0 — вода, 1…12 — суша.
   Чужие id (мастер дорисовывает свои биомы, их до 255) получают
   биомFromClimate() — тот же температурно-влажностный расчёт, что и у
   генератора. */

export const AIR = 0;
export const STONE = 1;
export const COBBLE = 2;
export const DIRT = 3;
export const GRASS = 4;
export const SAND = 5;
export const SANDSTONE = 6;
export const GRAVEL = 7;
export const CLAY = 8;
export const SNOW = 9;
export const ICE = 10;
export const PACKED_ICE = 11;
export const PODZOL = 12;
export const MOSS = 13;
export const PEAT = 14;
export const SALT = 15;
export const BASALT = 16;
export const OBSIDIAN = 17;
export const MAGMA = 18;
export const BEDROCK = 19;
export const WATER = 20;
export const WATER_SOURCE = 21;
export const LAVA = 22;
export const OAK_LOG = 30;
export const BIRCH_LOG = 31;
export const SPRUCE_LOG = 32;
export const JUNGLE_LOG = 33;
export const ACACIA_LOG = 34;
export const MANGROVE_LOG = 35;
export const OAK_LEAVES = 40;
export const BIRCH_LEAVES = 41;
export const SPRUCE_LEAVES = 42;
export const JUNGLE_LEAVES = 43;
export const ACACIA_LEAVES = 44;
export const SWAMP_LEAVES = 45;
export const TALL_GRASS = 50;
export const FERN = 51;
export const CACTUS = 52;
export const DEAD_BUSH = 53;
export const LILY = 54;
export const KELP = 55;
export const REEDS = 56;
export const SAPLING = 57;
export const COAL_ORE = 60;
export const IRON_ORE = 61;
export const GOLD_ORE = 62;
export const GEM_ORE = 63;

/** Индексы граней меша: 0 +X, 1 −X, 2 +Y (верх), 3 −Y, 4 +Z, 5 −Z. */
export const FACE_COUNT = 6;

/* Название тайла атласа. Порядок задаёт сетку атласа: менять можно только в
   конце, иначе съедутся все UV. */
export const TILES = [
  'stone',
  'cobble',
  'dirt',
  'grass',
  'grass_side',
  'sand',
  'sandstone',
  'gravel',
  'clay',
  'snow',
  'ice',
  'packed_ice',
  'podzol',
  'moss',
  'peat',
  'salt',
  'basalt',
  'obsidian',
  'magma',
  'bedrock',
  'water',
  'lava',
  'oak_log',
  'birch_log',
  'spruce_log',
  'jungle_log',
  'acacia_log',
  'mangrove_log',
  'oak_leaves',
  'birch_leaves',
  'spruce_leaves',
  'jungle_leaves',
  'acacia_leaves',
  'swamp_leaves',
  'tall_grass',
  'fern',
  'cactus',
  'dead_bush',
  'lily',
  'kelp',
  'reeds',
  'sapling',
  'coal_ore',
  'iron_ore',
  'gold_ore',
  'gem_ore',
];

/* Раскладка атласа: тайлы идут строками по ATLAS_COLUMNS; размер кратен
   степени двойки — тогда работают mipmap-уровни. */
export const ATLAS_COLUMNS = 8;
export const TILE_PX = 32;
export const ATLAS_SIZE = ATLAS_COLUMNS * TILE_PX;

const tile = (name) => TILES.indexOf(name);

/**
 * face = [верх, низ, бок]; жидкость и «растение» не перекрывают соседей снизу.
 * `cull` — грань не рисуется, если сосед непрозрачен; `solid` — по нему
 * режутся грани и по нему ходит игрок; `replaceable` — куда ставится декор.
 */
const define = (list) => {
  const seen = new Set();
  for (const b of list) {
    if (seen.has(b.id)) throw new Error(`Двойной id блока: ${b.id} (${b.name})`);
    seen.add(b.id);
  }

  /* Таблица плотная: индекс = id. Id группы стоят с зазорами (30…35 — стволы,
     40…45 — листва), а BLOCKS[id] должен работать для любого числа из чанка,
     иначе зазор читается как undefined и меш падает на первом дереве. */
  const max = Math.max(...list.map((b) => b.id));
  const table = [];
  for (let id = 0; id <= max; id += 1) {
    const b = list.find((entry) => entry.id === id);
    table.push(
      b
        ? {
            id: b.id,
            name: b.name,
            top: tile(b.top ?? b.tile),
            bottom: tile(b.bottom ?? b.tile),
            side: tile(b.side ?? b.tile),
            cull: b.cull !== false,
            solid: b.solid !== false,
            liquid: Boolean(b.liquid),
            replaceable: Boolean(b.replaceable),
            hole: false,
          }
        : {
            id,
            name: `блок ${id}`,
            top: 0,
            bottom: 0,
            side: 0,
            cull: false,
            solid: false,
            liquid: false,
            replaceable: true,
            hole: true,
          },
    );
  }
  return table;
};

export const BLOCKS = define([
  { id: AIR, name: 'воздух', tile: 'stone', cull: false, solid: false, replaceable: true },
  { id: STONE, name: 'камень', tile: 'stone' },
  { id: COBBLE, name: 'булыжник', tile: 'cobble' },
  { id: DIRT, name: 'земля', tile: 'dirt' },
  { id: GRASS, name: 'дёрн', top: 'grass', bottom: 'dirt', side: 'grass_side' },
  { id: SAND, name: 'песок', tile: 'sand' },
  { id: SANDSTONE, name: 'песчаник', tile: 'sandstone' },
  { id: GRAVEL, name: 'гравий', tile: 'gravel' },
  { id: CLAY, name: 'глина', tile: 'clay' },
  { id: SNOW, name: 'снег', tile: 'snow' },
  { id: ICE, name: 'лёд', tile: 'ice', cull: false },
  { id: PACKED_ICE, name: 'плотный лёд', tile: 'packed_ice' },
  { id: PODZOL, name: 'подзол', top: 'podzol', bottom: 'dirt', side: 'podzol' },
  { id: MOSS, name: 'мох', top: 'moss', bottom: 'dirt', side: 'moss' },
  { id: PEAT, name: 'торф', tile: 'peat' },
  { id: SALT, name: 'солончак', tile: 'salt' },
  { id: BASALT, name: 'базальт', tile: 'basalt' },
  { id: OBSIDIAN, name: 'обсидиан', tile: 'obsidian' },
  { id: MAGMA, name: 'магма', tile: 'magma' },
  { id: BEDROCK, name: 'бедрок', tile: 'bedrock' },
  { id: WATER, name: 'вода', tile: 'water', cull: false, solid: false, liquid: true },
  { id: WATER_SOURCE, name: 'источник', tile: 'water', cull: false, solid: false, liquid: true },
  { id: LAVA, name: 'лава', tile: 'lava', cull: false, solid: false, liquid: true },
  { id: OAK_LOG, name: 'дуб', tile: 'oak_log' },
  { id: BIRCH_LOG, name: 'берёза', tile: 'birch_log' },
  { id: SPRUCE_LOG, name: 'ель', tile: 'spruce_log' },
  { id: JUNGLE_LOG, name: 'джунгли', tile: 'jungle_log' },
  { id: ACACIA_LOG, name: 'акации', tile: 'acacia_log' },
  { id: MANGROVE_LOG, name: 'мангр', tile: 'mangrove_log' },
  { id: OAK_LEAVES, name: 'листва', tile: 'oak_leaves', cull: false, solid: false },
  { id: BIRCH_LEAVES, name: 'листва берёзы', tile: 'birch_leaves', cull: false, solid: false },
  { id: SPRUCE_LEAVES, name: 'хвоя', tile: 'spruce_leaves', cull: false, solid: false },
  { id: JUNGLE_LEAVES, name: 'листья джунглей', tile: 'jungle_leaves', cull: false, solid: false },
  { id: ACACIA_LEAVES, name: 'листья акации', tile: 'acacia_leaves', cull: false, solid: false },
  { id: SWAMP_LEAVES, name: 'листья болота', tile: 'swamp_leaves', cull: false, solid: false },
  { id: TALL_GRASS, name: 'трава', tile: 'tall_grass', cull: false, solid: false, replaceable: true },
  { id: FERN, name: 'папоротник', tile: 'fern', cull: false, solid: false, replaceable: true },
  { id: CACTUS, name: 'кактус', tile: 'cactus', cull: false },
  { id: DEAD_BUSH, name: 'сушняк', tile: 'dead_bush', cull: false, solid: false, replaceable: true },
  { id: LILY, name: 'кувшинка', tile: 'lily', cull: false, solid: false, replaceable: true },
  { id: KELP, name: 'ламинария', tile: 'kelp', cull: false, solid: false, replaceable: true },
  { id: REEDS, name: 'камыш', tile: 'reeds', cull: false, solid: false, replaceable: true },
  { id: SAPLING, name: 'саженец', tile: 'sapling', cull: false, solid: false, replaceable: true },
  { id: COAL_ORE, name: 'уголь', tile: 'coal_ore' },
  { id: IRON_ORE, name: 'железо', tile: 'iron_ore' },
  { id: GOLD_ORE, name: 'золото', tile: 'gold_ore' },
  { id: GEM_ORE, name: 'самоцветы', tile: 'gem_ore' },
]);

/* Максимальный разброс кроны по XZ (blob у джунгли radiu 4 + 1 на шум) — на
   столько же надо расширить проход декора у чанка, чтобы кроны не срезались
   границей. */
export const DECOR_RADIUS = 5;
export const BLOCK_COUNT = BLOCKS.filter((b) => !b.hole).length;

/** id, под которым в таблице нет блока: ведёт себя как воздух. */
export const isKnownBlock = (id) => BLOCKS[id] !== undefined && BLOCKS[id].hole === false;
export const isOpaque = (id) => id !== AIR && BLOCKS[id]?.cull !== false;
export const isSolid = (id) => BLOCKS[id]?.solid !== false;
export const isReplaceable = (id) => id === AIR || BLOCKS[id]?.replaceable === true;
export const blockName = (id) => BLOCKS[id]?.name ?? `блок ${id}`;

/* ---------- палитры биомов ---------- */

/**
 * top — поверхность, filler — 3 блока под ней, subsoil — глубже, trees/
 * plants — взвешенный список (id, вес), density — шанс растения на колонку,
 * snow/ice — шапки по холоду.
 */
export const BIOME_PALETTE = [
  /* 0 Marine — дно по глубине, поверхность не нужна */
  {
    top: SAND,
    filler: [SAND, SAND, SANDSTONE],
    subsoil: STONE,
    trees: [],
    plants: [
      [KELP, 9],
      [REEDS, 1],
    ],
    density: 0.05,
  },

  /* 1 Hot desert */
  {
    top: SAND,
    filler: [SAND, SAND, SANDSTONE],
    subsoil: SANDSTONE,
    trees: [],
    plants: [
      [CACTUS, 2],
      [DEAD_BUSH, 3],
    ],
    density: 0.06,
  },

  /* 2 Cold desert */
  {
    top: SAND,
    filler: [SAND, GRAVEL, SANDSTONE],
    subsoil: STONE,
    trees: [],
    plants: [
      [DEAD_BUSH, 4],
      [TALL_GRASS, 1],
    ],
    density: 0.05,
    snow: -12,
  },

  /* 3 Savanna */
  {
    top: GRASS,
    filler: [DIRT, DIRT, DIRT],
    subsoil: STONE,
    trees: [
      [ACACIA_LOG, 3, ACACIA_LEAVES],
      [OAK_LOG, 1, OAK_LEAVES],
    ],
    plants: [
      [TALL_GRASS, 6],
      [DEAD_BUSH, 1],
    ],
    density: 0.24,
  },

  /* 4 Grassland */
  {
    top: GRASS,
    filler: [DIRT, DIRT, DIRT],
    subsoil: STONE,
    trees: [],
    plants: [
      [TALL_GRASS, 7],
      [FERN, 1],
      [SAPLING, 1],
    ],
    density: 0.4,
  },

  /* 5 Tropical seasonal forest */
  {
    top: GRASS,
    filler: [DIRT, DIRT, DIRT],
    subsoil: STONE,
    trees: [
      [ACACIA_LOG, 4, ACACIA_LEAVES],
      [OAK_LOG, 3, OAK_LEAVES],
    ],
    plants: [[TALL_GRASS, 3]],
    density: 0.5,
  },

  /* 6 Temperate deciduous forest */
  {
    top: GRASS,
    filler: [DIRT, DIRT, DIRT],
    subsoil: STONE,
    trees: [
      [OAK_LOG, 6, OAK_LEAVES],
      [BIRCH_LOG, 3, BIRCH_LEAVES],
    ],
    plants: [
      [TALL_GRASS, 3],
      [FERN, 2],
    ],
    density: 0.62,
  },

  /* 7 Tropical rainforest */
  {
    top: GRASS,
    filler: [DIRT, DIRT, DIRT],
    subsoil: STONE,
    trees: [
      [JUNGLE_LOG, 7, JUNGLE_LEAVES],
      [OAK_LOG, 2, OAK_LEAVES],
    ],
    plants: [
      [FERN, 5],
      [TALL_GRASS, 2],
    ],
    density: 0.8,
  },

  /* 8 Temperate rainforest */
  {
    top: MOSS,
    filler: [DIRT, DIRT, DIRT],
    subsoil: STONE,
    trees: [
      [SPRUCE_LOG, 4, SPRUCE_LEAVES],
      [OAK_LOG, 4, OAK_LEAVES],
    ],
    plants: [
      [FERN, 6],
      [MOSS, 1],
    ],
    density: 0.7,
  },

  /* 9 Taiga */
  {
    top: PODZOL,
    filler: [DIRT, DIRT, DIRT],
    subsoil: STONE,
    trees: [
      [SPRUCE_LOG, 8, SPRUCE_LEAVES],
      [BIRCH_LOG, 2, BIRCH_LEAVES],
    ],
    plants: [
      [FERN, 2],
      [TALL_GRASS, 1],
    ],
    density: 0.6,
    snow: -1,
  },

  /* 10 Tundra */
  {
    top: GRASS,
    filler: [DIRT, DIRT, DIRT],
    subsoil: STONE,
    trees: [[SPRUCE_LOG, 1, SPRUCE_LEAVES]],
    plants: [
      [TALL_GRASS, 2],
      [DEAD_BUSH, 2],
    ],
    density: 0.1,
    snow: -1,
  },

  /* 11 Glacier */
  { top: PACKED_ICE, filler: [ICE, ICE, PACKED_ICE], subsoil: STONE, trees: [], plants: [], density: 0, snow: -100 },

  /* 12 Wetland */
  {
    top: PEAT,
    filler: [CLAY, CLAY, DIRT],
    subsoil: STONE,
    trees: [[MANGROVE_LOG, 3, SWAMP_LEAVES]],
    plants: [
      [REEDS, 8],
      [LILY, 4],
      [TALL_GRASS, 2],
    ],
    density: 0.55,
  },
];

export const OCEAN_FLOOR = [
  { from: 17, to: 20, top: SAND, filler: [SAND, SAND, SAND] },
  { from: 12, to: 16, top: SAND, filler: [SAND, GRAVEL, SANDSTONE] },
  { from: 0, to: 11, top: GRAVEL, filler: [CLAY, GRAVEL, STONE] },
];

/**
 * Биом для id, которого нет среди 13 базовых: тот же признак, по которому
 * Azgaar считает биом (влажность, температура, высота), — чтобы ручная
 * правка мастера не роняла генерацию, а попадала в понятный блок.
 * Возвращает индекс BIOME_PALETTE.
 */
export const biomeFromClimate = (moisture, temperature, height) => {
  if (height < 20) return 0;
  if (temperature < -5) return 11;
  if (temperature >= 25 && moisture < 8) return 1;
  if (moisture > 24 && height < 60) return moisture > 40 && height < 25 ? 12 : 8;
  if (temperature > 19) return moisture > 18 ? 7 : 3;
  if (temperature > 8) return moisture > 22 ? 8 : moisture > 12 ? 6 : 4;
  if (temperature > -1) return moisture > 16 ? 6 : moisture > 8 ? 4 : 2;
  return moisture > 10 ? 9 : 10;
};

/** Палитра колонок: id биома → палитра, с откатом на климат. */
export const paletteFor = (biomeId, moisture = 20, temperature = 12, height = 25) => {
  const known = BIOME_PALETTE[biomeId];
  if (known) return known;
  return BIOME_PALETTE[biomeFromClimate(moisture, temperature, height)] ?? BIOME_PALETTE[4];
};

/* ---------- формы растений ---------- */

/**
 * Крона-«блоб» заданного радиуса с пропуском углов: детерминированный пропуск
 * по хешу координат, а не по случайности, чтобы два прогона дали одно и то же.
 */
const blob = (out, cx, cy, cz, r, leaf, seed, flat = 1) => {
  const ry = Math.max(1, Math.round(r * flat));
  for (let dx = -r; dx <= r; dx += 1) {
    for (let dz = -r; dz <= r; dz += 1) {
      for (let dy = 0; dy <= ry; dy += 1) {
        const d = dx * dx + dz * dz + (dy - ry / 2) * (dy - ry / 2) * 2;
        if (d > r * r + 1) continue;
        if (d > r * r - 2 && (dx + dz + dy) % 3 === 0) continue;
        if (dx === 0 && dz === 0 && dy === 0) continue;
        out.push([cx + dx, cy + dy, cz + dz, leaf]);
      }
    }
  }
};

const cone = (out, cx, base, cz, height, leaf) => {
  for (let i = 0; i < height; i += 1) {
    const r = Math.max(0, Math.ceil((height - i) / 2.2));
    if (r === 0) {
      out.push([cx, base + i, cz, leaf]);
      continue;
    }
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dz = -r; dz <= r; dz += 1) {
        if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
        if (dx === 0 && dz === 0 && i < height - 1) continue;
        out.push([cx, base + i, cz + dz, leaf]);
      }
    }
  }
};

/**
 * Деревья по породе: список [dx, dy, z, block] относительно колонки, где
 * dy = 1 — блок над поверхностью. Высота зависит от x/z-хеша колонки, поэтому
 * дерево в чанке и то же дерево, попавшее в соседний чанк, — одно и то же.
 */
export const treeBlocks = (logId, leafId, h, r) => {
  const out = [];
  const trunk = Math.max(3, h);
  for (let y = 1; y <= trunk; y += 1) out.push([0, y, 0, logId]);
  switch (logId) {
    case SPRUCE_LOG:
      cone(out, 0, Math.floor(trunk * 0.45), 0, trunk - Math.floor(trunk * 0.45) + 1, leafId);
      for (let y = 1; y <= 2; y += 1) out.push([0, y, 0, logId]);
      out.push([0, trunk + 1, 0, leafId]);
      break;
    case ACACIA_LOG:
      for (let dx = -1; dx <= 1; dx += 1) out.push([dx, trunk, 0, logId]);
      blob(out, 0, trunk + 1, 0, Math.max(3, r), leafId, h, 0.4);
      break;
    case JUNGLE_LOG:
      blob(out, 0, trunk, 0, Math.max(3, r), leafId, h, 1.6);
      blob(out, 0, trunk + 3, 0, Math.max(2, r - 1), leafId, h + 1, 1);
      break;
    case MANGROVE_LOG:
      out.push([1, 1, 0, logId], [-1, 1, 0, logId], [0, 1, 1, logId], [0, 1, -1, logId]);
      blob(out, 0, trunk, 0, Math.max(2, r), leafId, h, 0.8);
      break;
    default:
      blob(out, 0, trunk, 0, Math.max(2, r), leafId, h, 1);
  }
  return out;
};

/* Кактус — не дерево: колонка блоков, отдельно, чтобы не раздувать switch выше. */
export const cactusBlocks = (h) => {
  const out = [];
  for (let y = 1; y <= h; y += 1) out.push([0, y, 0, CACTUS]);
  if (h >= 3 && (h & 1) === 0) out.push([1, 2, 0, CACTUS]);
  return out;
};

/** Высота и радиус дерева из хеша колонки: детерминированно и без таблиц. */
export const treeShape = (seed, x, z, kind) => {
  const r = (value) => (value % 1000) / 1000;
  const base = r(Math.abs(seed ^ (x * 73856093) ^ (z * 19349663)));
  switch (kind) {
    case SPRUCE_LOG:
      return { h: 6 + Math.floor(base * 5), r: 2 };
    case JUNGLE_LOG:
      return { h: 9 + Math.floor(base * 6), r: 4 };
    case ACACIA_LOG:
      return { h: 4 + Math.floor(base * 2), r: 4 };
    case MANGROVE_LOG:
      return { h: 3 + Math.floor(base * 2), r: 3 };
    case BIRCH_LOG:
      return { h: 5 + Math.floor(base * 3), r: 2 };
    case CACTUS:
      return { h: 1 + Math.floor(base * 3), r: 0 };
    default:
      return { h: 4 + Math.floor(base * 3), r: 2 + (base > 0.6 ? 1 : 0) };
  }
};
