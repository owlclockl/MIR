/* Биомы: таблица майнкрафтовых биомов по-русски, их цвета и правила выбора.

   Биом — не украшение карты, а функция климата: выбор идёт по шести числам
   (температура, влажность, континентальность, эрозия, причудливость, высота) —
   так же, как в Minecraft это делает OverworldBiomeBuilder, только таблица
   проще и подогнана под земные широты: у экватора тропики, в тридцатых
   широтах пустыни (как на Земле), ближе к полюсам тундра и ледяные пики.

   Цвета — это то, каким биом видно сверху (карта в Minecraft): трава равнины
   салатная (#91bd59), у болота оливковая, песок пустыни песочный, снег белый.
   Тот же цвет берёт блок дёрна на срезе, поэтому биом видно и в виде блоков.

   Каждый биом знает свои блоки: поверхность, подстилку под ней и дно водоёма.
   Деревья и растения описаны плотностью — по ней растёт слой крон. */

import {
  ACACIA_LEAVES, ACACIA_LOG, BAMBOO, BIRCH_LEAVES, BIRCH_LOG, CACTUS, CLAY, COARSE_DIRT,
  DEAD_BUSH, DIRT, FERN, GRASS_BLOCK, GRAVEL, ICE, JUNGLE_LEAVES, JUNGLE_LOG, LILY_PAD,
  MANGROVE_LEAVES, MANGROVE_LOG, MUD, MUSHROOM_BLOCK, MYCELIUM, OAK_LEAVES,
  OAK_LOG, PODZOL, POWDER_SNOW, RED_SAND, SAND, SANDSTONE, SNOW_BLOCK,
  SNOW_LAYER, SPRUCE_LEAVES, SPRUCE_LOG, STONE, SUGAR_CANE, TALL_GRASS, TERRACOTTA,
} from './blocks.js';

/* Категории нужны слою карты и статистике: суша, вода, берег, горы, редкость. */
export const CATEGORY = Object.freeze({
  OCEAN: 'ocean',
  COAST: 'coast',
  LAND: 'land',
  MOUNTAIN: 'mountain',
  RIVER: 'river',
  LAKE: 'lake',
  RARE: 'rare',
});

const tree = (type, density, minH, maxH) => ({ type, density, minH, maxH });

/**
 * Таблица биомов. `id` — порядковый номер в массиве (он же то, что лежит в
 * колонке), поэтому менять порядок нельзя: иначе поедут старые миры. Новые
 * биомы — только в конец.
 */
export const BIOMES = Object.freeze([
  {
    key: 'ocean', name: 'Океан', category: CATEGORY.OCEAN, color: 0x3f76e4, grass: 0x8eb971, foliage: 0x71a74d,
    surface: GRAVEL, filler: SAND, underwater: GRAVEL, depth: 3, snow: false, ice: false, tree: null,
  },
  {
    key: 'deep_ocean', name: 'Глубокий океан', category: CATEGORY.OCEAN, color: 0x2a55a8, grass: 0x8eb971, foliage: 0x71a74d,
    surface: GRAVEL, filler: CLAY, underwater: GRAVEL, depth: 4, snow: false, ice: false, tree: null,
  },
  {
    key: 'warm_ocean', name: 'Тёплый океан', category: CATEGORY.OCEAN, color: 0x3fb7e4, grass: 0x8eb971, foliage: 0x71a74d,
    surface: SAND, filler: SAND, underwater: SAND, depth: 3, snow: false, ice: false, tree: null,
  },
  {
    key: 'cold_ocean', name: 'Холодный океан', category: CATEGORY.OCEAN, color: 0x3355b5, grass: 0x8eb971, foliage: 0x71a74d,
    surface: GRAVEL, filler: GRAVEL, underwater: GRAVEL, depth: 3, snow: false, ice: false, tree: null,
  },
  {
    key: 'frozen_ocean', name: 'Ледяной океан', category: CATEGORY.OCEAN, color: 0xa5c9ea, grass: 0x80b497, foliage: 0x60a17b,
    surface: GRAVEL, filler: GRAVEL, underwater: GRAVEL, depth: 3, snow: false, ice: true, tree: null,
  },
  {
    key: 'beach', name: 'Пляж', category: CATEGORY.COAST, color: 0xdbd3a0, grass: 0x8eb971, foliage: 0x71a74d,
    surface: SAND, filler: SAND, underwater: SAND, depth: 3, snow: false, ice: false,
    tree: tree('oak', 0.004, 5, 7), plant: { block: SUGAR_CANE, density: 0.02 },
  },
  {
    key: 'snowy_beach', name: 'Снежный пляж', category: CATEGORY.COAST, color: 0xeef6f8, grass: 0x80b497, foliage: 0x60a17b,
    surface: SAND, filler: SAND, underwater: SAND, depth: 3, snow: true, ice: false, tree: null,
  },
  {
    key: 'stony_shore', name: 'Каменистый берег', category: CATEGORY.COAST, color: 0x8c8c8c, grass: 0x8ab689, foliage: 0x6da36b,
    surface: STONE, filler: STONE, underwater: GRAVEL, depth: 3, snow: false, ice: false, tree: null,
  },
  {
    key: 'river', name: 'Река', category: CATEGORY.RIVER, color: 0x3f76e4, grass: 0x8eb971, foliage: 0x71a74d,
    surface: SAND, filler: SAND, underwater: SAND, depth: 3, snow: false, ice: false, tree: null,
  },
  {
    key: 'frozen_river', name: 'Замёрзшая река', category: CATEGORY.RIVER, color: 0xa5c9ea, grass: 0x80b497, foliage: 0x60a17b,
    surface: SAND, filler: SAND, underwater: SAND, depth: 3, snow: true, ice: true, tree: null,
  },
  {
    key: 'lake', name: 'Озеро', category: CATEGORY.LAKE, color: 0x3f76e4, grass: 0x8eb971, foliage: 0x71a74d,
    surface: SAND, filler: CLAY, underwater: SAND, depth: 3, snow: false, ice: false, tree: null,
  },
  {
    key: 'salt_flat', name: 'Солончак', category: CATEGORY.LAKE, color: 0xe6e2d3, grass: 0xbfb755, foliage: 0xaea42a,
    surface: SAND, filler: CLAY, underwater: CLAY, depth: 3, snow: false, ice: false, tree: null,
    plant: { block: DEAD_BUSH, density: 0.004 },
  },
  {
    key: 'plains', name: 'Равнина', category: CATEGORY.LAND, color: 0x91bd59, grass: 0x91bd59, foliage: 0x77ab2f,
    surface: GRASS_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 4, snow: false, ice: false,
    tree: tree('oak', 0.02, 5, 8), plant: { block: TALL_GRASS, density: 0.22 },
  },
  {
    key: 'forest', name: 'Лес', category: CATEGORY.LAND, color: 0x79c05a, grass: 0x79c05a, foliage: 0x59ae30,
    surface: GRASS_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 4, snow: false, ice: false,
    tree: tree('oak', 0.22, 6, 12), plant: { block: TALL_GRASS, density: 0.18 },
  },
  {
    key: 'birch_forest', name: 'Берёзовый лес', category: CATEGORY.LAND, color: 0x88bb67, grass: 0x88bb67, foliage: 0x6ba941,
    surface: GRASS_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 4, snow: false, ice: false,
    tree: tree('birch', 0.18, 6, 11), plant: { block: TALL_GRASS, density: 0.14 },
  },
  {
    key: 'flower_forest', name: 'Цветущий лес', category: CATEGORY.LAND, color: 0x9bc464, grass: 0x9bc464, foliage: 0x63a948,
    surface: GRASS_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 4, snow: false, ice: false,
    tree: tree('oak', 0.12, 6, 10), plant: { block: TALL_GRASS, density: 0.34 },
  },
  {
    key: 'dark_forest', name: 'Тёмный лес', category: CATEGORY.LAND, color: 0x507a32, grass: 0x507a32, foliage: 0x3f6119,
    surface: GRASS_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 4, snow: false, ice: false,
    tree: tree('dark_oak', 0.28, 7, 13), plant: { block: FERN, density: 0.2 },
  },
  {
    key: 'taiga', name: 'Тайга', category: CATEGORY.LAND, color: 0x86b783, grass: 0x86b783, foliage: 0x68a464,
    surface: GRASS_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 4, snow: false, ice: false,
    tree: tree('spruce', 0.2, 9, 17), plant: { block: FERN, density: 0.16 },
  },
  {
    key: 'old_growth_taiga', name: 'Древняя тайга', category: CATEGORY.LAND, color: 0x6c9b62, grass: 0x6c9b62, foliage: 0x4f8a4a,
    surface: PODZOL, filler: DIRT, underwater: GRAVEL, depth: 4, snow: false, ice: false,
    tree: tree('spruce', 0.3, 12, 22), plant: { block: FERN, density: 0.24 },
  },
  {
    key: 'snowy_taiga', name: 'Снежная тайга', category: CATEGORY.LAND, color: 0x68a464, grass: 0x80b497, foliage: 0x60a17b,
    surface: GRASS_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 4, snow: true, ice: false,
    tree: tree('spruce', 0.16, 8, 16),
  },
  {
    key: 'snowy_plains', name: 'Снежная равнина', category: CATEGORY.LAND, color: 0xf0f9fa, grass: 0x80b497, foliage: 0x60a17b,
    surface: SNOW_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 4, snow: true, ice: false,
    tree: tree('spruce', 0.006, 6, 12),
  },
  {
    key: 'tundra', name: 'Тундра', category: CATEGORY.LAND, color: 0xd7e6ea, grass: 0x8ab99a, foliage: 0x6fa382,
    surface: SNOW_BLOCK, filler: COARSE_DIRT, underwater: GRAVEL, depth: 3, snow: true, ice: false,
    tree: null, plant: { block: SNOW_LAYER, density: 0.1 },
  },
  {
    key: 'ice_spikes', name: 'Ледяные шипы', category: CATEGORY.RARE, color: 0xe8f6fb, grass: 0x80b497, foliage: 0x60a17b,
    surface: SNOW_BLOCK, filler: POWDER_SNOW, underwater: GRAVEL, depth: 4, snow: true, ice: true, tree: null,
  },
  {
    key: 'grove', name: 'Снежная роща', category: CATEGORY.MOUNTAIN, color: 0x9fc7a0, grass: 0x80b497, foliage: 0x60a17b,
    surface: SNOW_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 3, snow: true, ice: false,
    tree: tree('spruce', 0.08, 7, 14),
  },
  {
    key: 'snowy_slopes', name: 'Снежные склоны', category: CATEGORY.MOUNTAIN, color: 0xeaf4f7, grass: 0x80b497, foliage: 0x60a17b,
    surface: SNOW_BLOCK, filler: STONE, underwater: GRAVEL, depth: 3, snow: true, ice: false, tree: null,
  },
  {
    key: 'frozen_peaks', name: 'Ледяные пики', category: CATEGORY.MOUNTAIN, color: 0xf6fbfd, grass: 0x80b497, foliage: 0x60a17b,
    surface: SNOW_BLOCK, filler: ICE, underwater: GRAVEL, depth: 2, snow: true, ice: true, tree: null,
  },
  {
    key: 'jagged_peaks', name: 'Зубчатые пики', category: CATEGORY.MOUNTAIN, color: 0x9aa0a6, grass: 0x8ab689, foliage: 0x6da36b,
    surface: STONE, filler: STONE, underwater: GRAVEL, depth: 2, snow: true, ice: false, tree: null,
  },
  {
    key: 'stony_peaks', name: 'Каменистые пики', category: CATEGORY.MOUNTAIN, color: 0xa8a29a, grass: 0x9ab06e, foliage: 0x7ba05a,
    surface: STONE, filler: STONE, underwater: GRAVEL, depth: 2, snow: false, ice: false, tree: null,
  },
  {
    key: 'windswept_hills', name: 'Обдуваемые холмы', category: CATEGORY.MOUNTAIN, color: 0x8ab689, grass: 0x8ab689, foliage: 0x6da36b,
    surface: GRASS_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 3, snow: false, ice: false,
    tree: tree('spruce', 0.03, 6, 12),
  },
  {
    key: 'meadow', name: 'Горный луг', category: CATEGORY.MOUNTAIN, color: 0x83bb6d, grass: 0x83bb6d, foliage: 0x63a948,
    surface: GRASS_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 3, snow: false, ice: false,
    tree: tree('oak', 0.006, 5, 8), plant: { block: TALL_GRASS, density: 0.3 },
  },
  {
    key: 'mushroom_fields', name: 'Грибные поля', category: CATEGORY.RARE, color: 0x6f6265, grass: 0x6f6265, foliage: 0x4b3a3f,
    surface: MYCELIUM, filler: DIRT, underwater: GRAVEL, depth: 3, snow: false, ice: false,
    tree: tree('mushroom', 0.06, 4, 9),
  },
  {
    key: 'mangrove_swamp', name: 'Мангровое болото', category: CATEGORY.LAND, color: 0x5f7a3a, grass: 0x6a7039, foliage: 0x4f6a2a,
    surface: MUD, filler: CLAY, underwater: MUD, depth: 3, snow: false, ice: false,
    tree: tree('mangrove', 0.14, 6, 12), plant: { block: LILY_PAD, density: 0.05 },
  },
  {
    key: 'swamp', name: 'Болото', category: CATEGORY.LAND, color: 0x6a7039, grass: 0x6a7039, foliage: 0x4f6a2a,
    surface: GRASS_BLOCK, filler: MUD, underwater: CLAY, depth: 3, snow: false, ice: false,
    tree: tree('oak', 0.03, 5, 8), plant: { block: LILY_PAD, density: 0.03 },
  },
  {
    key: 'savanna', name: 'Саванна', category: CATEGORY.LAND, color: 0xbfb755, grass: 0xbfb755, foliage: 0xaea42a,
    surface: GRASS_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 4, snow: false, ice: false,
    tree: tree('acacia', 0.03, 6, 9), plant: { block: TALL_GRASS, density: 0.3 },
  },
  {
    key: 'desert', name: 'Пустыня', category: CATEGORY.LAND, color: 0xdbd3a0, grass: 0xbfb755, foliage: 0xaea42a,
    surface: SAND, filler: SANDSTONE, underwater: SAND, depth: 5, snow: false, ice: false,
    tree: null, plant: { block: CACTUS, density: 0.004 },
  },
  {
    key: 'badlands', name: 'Пустоши', category: CATEGORY.LAND, color: 0xca8e46, grass: 0x90814d, foliage: 0x9e814d,
    surface: RED_SAND, filler: TERRACOTTA, underwater: RED_SAND, depth: 4, snow: false, ice: false,
    tree: null, plant: { block: DEAD_BUSH, density: 0.01 },
  },
  {
    key: 'jungle', name: 'Тропический лес', category: CATEGORY.LAND, color: 0x59c93c, grass: 0x59c93c, foliage: 0x30bb0b,
    surface: GRASS_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 4, snow: false, ice: false,
    tree: tree('jungle', 0.3, 10, 24), plant: { block: FERN, density: 0.3 },
  },
  {
    key: 'bamboo_jungle', name: 'Бамбуковые джунгли', category: CATEGORY.LAND, color: 0x6db24a, grass: 0x59c93c, foliage: 0x30bb0b,
    surface: GRASS_BLOCK, filler: DIRT, underwater: GRAVEL, depth: 4, snow: false, ice: false,
    tree: tree('jungle', 0.14, 8, 18), plant: { block: BAMBOO, density: 0.34 },
  },
]);

/** Быстрый поиск по ключу: нужен интерфейсу и проверкам, в горячем пути не используется. */
export const biomeByKey = (key) => BIOMES.find((biome) => biome.key === key) ?? null;

/** Идентификатор биома по ключу: порядковый номер в таблице. */
export const biomeId = (key) => {
  const index = BIOMES.findIndex((biome) => biome.key === key);
  return index < 0 ? 0 : index;
};

export const BIOME_IDS = Object.freeze({
  ocean: biomeId('ocean'),
  deep_ocean: biomeId('deep_ocean'),
  warm_ocean: biomeId('warm_ocean'),
  cold_ocean: biomeId('cold_ocean'),
  frozen_ocean: biomeId('frozen_ocean'),
  beach: biomeId('beach'),
  snowy_beach: biomeId('snowy_beach'),
  stony_shore: biomeId('stony_shore'),
  river: biomeId('river'),
  frozen_river: biomeId('frozen_river'),
  lake: biomeId('lake'),
  salt_flat: biomeId('salt_flat'),
  plains: biomeId('plains'),
  forest: biomeId('forest'),
  birch_forest: biomeId('birch_forest'),
  flower_forest: biomeId('flower_forest'),
  dark_forest: biomeId('dark_forest'),
  taiga: biomeId('taiga'),
  old_growth_taiga: biomeId('old_growth_taiga'),
  snowy_taiga: biomeId('snowy_taiga'),
  snowy_plains: biomeId('snowy_plains'),
  tundra: biomeId('tundra'),
  ice_spikes: biomeId('ice_spikes'),
  grove: biomeId('grove'),
  snowy_slopes: biomeId('snowy_slopes'),
  frozen_peaks: biomeId('frozen_peaks'),
  jagged_peaks: biomeId('jagged_peaks'),
  stony_peaks: biomeId('stony_peaks'),
  windswept_hills: biomeId('windswept_hills'),
  meadow: biomeId('meadow'),
  mushroom_fields: biomeId('mushroom_fields'),
  mangrove_swamp: biomeId('mangrove_swamp'),
  swamp: biomeId('swamp'),
  savanna: biomeId('savanna'),
  desert: biomeId('desert'),
  badlands: biomeId('badlands'),
  jungle: biomeId('jungle'),
  bamboo_jungle: biomeId('bamboo_jungle'),
});

/* Цвета биомов, разложенные по id: вид сверху читает их без объектов. */
export const BIOME_COLORS = new Uint8Array(BIOMES.length * 3);
export const BIOME_GRASS = new Uint8Array(BIOMES.length * 3);
export const BIOME_NAMES = new Array(BIOMES.length);
for (const [index, biome] of BIOMES.entries()) {
  BIOME_COLORS[index * 3] = (biome.color >> 16) & 255;
  BIOME_COLORS[index * 3 + 1] = (biome.color >> 8) & 255;
  BIOME_COLORS[index * 3 + 2] = biome.color & 255;
  BIOME_GRASS[index * 3] = (biome.grass >> 16) & 255;
  BIOME_GRASS[index * 3 + 1] = (biome.grass >> 8) & 255;
  BIOME_GRASS[index * 3 + 2] = biome.grass & 255;
  BIOME_NAMES[index] = biome.name;
}

export const biomeName = (id) => BIOME_NAMES[id] ?? 'Неизвестно';
export const biomeColor = (id) => [BIOME_COLORS[id * 3], BIOME_COLORS[id * 3 + 1], BIOME_COLORS[id * 3 + 2]];
export const biomeIsWater = (id) => {
  const category = BIOMES[id]?.category;
  return category === CATEGORY.OCEAN || category === CATEGORY.RIVER || category === CATEGORY.LAKE;
};
export const biomeIsMountain = (id) => BIOMES[id]?.category === CATEGORY.MOUNTAIN;

/** Виды воды в колонке: по ним выбирается биом моря, реки или озера. */
export const WATER_NONE = 0;
export const WATER_OCEAN = 1;
export const WATER_RIVER = 2;
export const WATER_LAKE = 3;
export const WATER_SALT = 4;

/**
 * Выбор биома. Аргументы позиционные и числовые: функция зовётся на каждую
 * колонку мира, и объект-параметр здесь был бы лишним миллионом объектов.
 *
 * @param {number} temperature −1 (полюс) … 1 (экватор)
 * @param {number} humidity −1 (сухо) … 1 (сыро)
 * @param {number} continentalness −1 (открытый океан) … 1 (внутри материка)
 * @param {number} erosion −1 (скалы) … 1 (плоскость)
 * @param {number} weirdness −1 … 1, «причудливость»: редкие варианты биомов
 * @param {number} height ярус поверхности в блоках
 * @param {number} seaLevel уровень моря в блоках
 * @param {number} water вид воды (WATER_*)
 * @param {boolean} mountainous горная ли это местность (для изумрудов)
 */
export const pickBiome = (temperature, humidity, continentalness, erosion, weirdness, height, seaLevel, water, mountainous = false) => {
  const t = temperature;
  const h = humidity;
  const e = erosion;
  const w = weirdness;
  const cold = t < -0.55;
  const cool = t < -0.2;
  const warm = t > 0.45;
  const hot = t > 0.65;
  const wet = h > 0.35;
  const dry = h < -0.35;

  if (water === WATER_RIVER) return cold ? BIOME_IDS.frozen_river : BIOME_IDS.river;
  if (water === WATER_LAKE) {
    if (dry && temperature > 0.2) return BIOME_IDS.salt_flat;
    return cold ? BIOME_IDS.frozen_river : BIOME_IDS.lake;
  }
  if (water === WATER_SALT) return BIOME_IDS.salt_flat;

  if (water === WATER_OCEAN) {
    if (cold) return BIOME_IDS.frozen_ocean;
    if (height < seaLevel - 28) return BIOME_IDS.deep_ocean;
    if (warm) return BIOME_IDS.warm_ocean;
    if (cool) return BIOME_IDS.cold_ocean;
    return BIOME_IDS.ocean;
  }

  /* Берег: полоса у самой воды — пляж, песок или камень. */
  if (height <= seaLevel + 1) {
    if (cold) return BIOME_IDS.snowy_beach;
    if (erosion < -0.35) return BIOME_IDS.stony_shore;
    return BIOME_IDS.beach;
  }

  /* Горы: крутая эрозия и большая высота. Снег здесь зависит и от высоты, а не
     только от широты — как на настоящих хребтах. */
  const peak = height > seaLevel + 96;
  if (erosion < -0.35 || peak) {
    if (height > seaLevel + 150 || (peak && cold)) return BIOME_IDS.frozen_peaks;
    if (cold || height > seaLevel + 120) return BIOME_IDS.snowy_slopes;
    if (temperature > 0.45) return BIOME_IDS.stony_peaks;
    if (erosion < -0.6) return BIOME_IDS.jagged_peaks;
    if (height > seaLevel + 60) return BIOME_IDS.meadow;
    return BIOME_IDS.windswept_hills;
  }

  /* Редкие: грибные поля и ледяные шипы — «причудливость» в крайней точке. */
  if (w > 0.82 && h > 0.4 && continentalness < 0.45) return BIOME_IDS.mushroom_fields;
  if (cold && w > 0.55) return BIOME_IDS.ice_spikes;
  if (cool && height > seaLevel + 40 && h > 0.1) return BIOME_IDS.grove;
  if (erosion < -0.2 && height > seaLevel + 30) {
    if (cold) return BIOME_IDS.snowy_taiga;
    if (temperature > 0.3) return BIOME_IDS.savanna;
    return BIOME_IDS.windswept_hills;
  }

  if (cold) return BIOME_IDS.tundra;
  if (cool) {
    if (wet) return w > 0.4 ? BIOME_IDS.old_growth_taiga : BIOME_IDS.taiga;
    if (h > -0.1) return BIOME_IDS.snowy_taiga;
    return BIOME_IDS.snowy_plains;
  }
  if (t < 0.1) {
    if (wet) return w > 0.5 ? BIOME_IDS.dark_forest : BIOME_IDS.forest;
    if (h > 0.1) return w > 0.3 ? BIOME_IDS.birch_forest : BIOME_IDS.forest;
    if (h < -0.3) return BIOME_IDS.plains;
    return w > 0.45 ? BIOME_IDS.flower_forest : BIOME_IDS.plains;
  }
  if (t < 0.45) {
    if (wet && erosion > 0.1) return BIOME_IDS.swamp;
    if (wet) return BIOME_IDS.forest;
    if (dry) return BIOME_IDS.plains;
    return w > 0.35 ? BIOME_IDS.birch_forest : BIOME_IDS.plains;
  }
  /* Тёплые широты: тропики у океана, саванны и пустыни внутри материка. */
  if (h > 0.55 && continentalness < 0.5) return BIOME_IDS.mangrove_swamp;
  if (wet) return w > 0.4 ? BIOME_IDS.bamboo_jungle : BIOME_IDS.jungle;
  if (dry) return hot ? BIOME_IDS.desert : BIOME_IDS.badlands;
  if (h < -0.1) return BIOME_IDS.savanna;
  return warm ? BIOME_IDS.jungle : BIOME_IDS.savanna;
};

/** Суша ли это по биому: нужно статистике и выбору точки появления. */
export const biomeIsLand = (id) => {
  const category = BIOMES[id]?.category;
  return category === CATEGORY.LAND || category === CATEGORY.MOUNTAIN || category === CATEGORY.COAST || category === CATEGORY.RARE;
};

export const biomeTree = (id) => BIOMES[id]?.tree ?? null;
export const biomePlant = (id) => BIOMES[id]?.plant ?? null;
export const biomeSurface = (id) => BIOMES[id]?.surface ?? GRASS_BLOCK;
/** Блок дна водоёма: у океанов это гравий, у тёплых морей — песок. */
export const biomeUnderwater = (id) => BIOMES[id]?.underwater ?? biomeFiller(id);
export const biomeFiller = (id) => BIOMES[id]?.filler ?? DIRT;
export const biomeDepth = (id) => BIOMES[id]?.depth ?? 4;
export const biomeSnowy = (id) => BIOMES[id]?.snow === true;
export const biomeIcy = (id) => BIOMES[id]?.ice === true;

/** Ключи деревьев → блоки брёвен и листвы (для слоя крон и вида блоков). */
export const TREE_BLOCKS = Object.freeze({
  oak: { log: OAK_LOG, leaves: OAK_LEAVES },
  birch: { log: BIRCH_LOG, leaves: BIRCH_LEAVES },
  spruce: { log: SPRUCE_LOG, leaves: SPRUCE_LEAVES },
  dark_oak: { log: OAK_LOG, leaves: OAK_LEAVES },
  jungle: { log: JUNGLE_LOG, leaves: JUNGLE_LEAVES },
  acacia: { log: ACACIA_LOG, leaves: ACACIA_LEAVES },
  mangrove: { log: MANGROVE_LOG, leaves: MANGROVE_LEAVES },
  mushroom: { log: MUSHROOM_BLOCK, leaves: MUSHROOM_BLOCK },
});
