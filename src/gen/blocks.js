/* Реестр блоков: идентификаторы, русские имена и цвета для карты сверху.

   Блоки — майнкрафтовские по смыслу и названию, но идентификаторы и палитра
   свои: id влезает в Uint8Array (на этом держится ленивая колонка), а цвет —
   это цвет блока на карте сверху, как карта в Minecraft: камень серый, песок
   песочный, вода синяя, изумрудная руда зелёная. Цвета не текстуры: вид
   рисует блок пикселем, поэтому вместо картинок достаточно таблицы.

   Биомная зелень (трава, листва) в таблице — усреднённая; точный тон берётся
   из биома (src/gen/biomes.js), как это делает Minecraft: у болота трава
   оливковая, у равнины — салатная. */

export const AIR = 0;
/* Камень и его породы. */
export const STONE = 1;
export const DEEPSLATE = 2;
export const GRANITE = 3;
export const DIORITE = 4;
export const ANDESITE = 5;
export const TUFF = 6;
export const CALCITE = 7;
export const BASALT = 8;
export const OBSIDIAN = 9;
export const MAGMA = 10;
/* Рыхлое и осадочное. */
export const DIRT = 11;
export const COARSE_DIRT = 12;
export const GRASS_BLOCK = 13;
export const PODZOL = 14;
export const MYCELIUM = 15;
export const MUD = 16;
export const MOSS_BLOCK = 17;
export const SAND = 18;
export const RED_SAND = 19;
export const SANDSTONE = 20;
export const RED_SANDSTONE = 21;
export const GRAVEL = 22;
export const CLAY = 23;
export const TERRACOTTA = 24;
export const SNOW_BLOCK = 25;
export const POWDER_SNOW = 26;
export const ICE = 27;
export const PACKED_ICE = 28;
export const BLUE_ICE = 29;
/* Вода и лава. */
export const WATER = 30;
export const LAVA = 31;
/* Дерево. */
export const OAK_LOG = 32;
export const BIRCH_LOG = 33;
export const SPRUCE_LOG = 34;
export const JUNGLE_LOG = 35;
export const ACACIA_LOG = 36;
export const MANGROVE_LOG = 37;
export const OAK_LEAVES = 38;
export const BIRCH_LEAVES = 39;
export const SPRUCE_LEAVES = 40;
export const JUNGLE_LEAVES = 41;
export const ACACIA_LEAVES = 42;
export const MANGROVE_LEAVES = 43;
export const PLANKS = 44;
export const COBBLESTONE = 45;
export const GLASS = 46;
export const DIRT_PATH = 47;
export const HAY_BLOCK = 48;
export const BAMBOO = 49;
/* Растения и мелочь поверхности. */
export const TALL_GRASS = 50;
export const FERN = 51;
export const CACTUS = 52;
export const DEAD_BUSH = 53;
export const SUGAR_CANE = 54;
export const MUSHROOM_BLOCK = 55;
export const LILY_PAD = 56;
export const SEA_GRASS = 57;
export const KELP = 58;
export const SNOW_LAYER = 59;
/* Основание. */
export const BEDROCK = 60;
/* Руды. */
export const COAL_ORE = 61;
export const IRON_ORE = 62;
export const COPPER_ORE = 63;
export const GOLD_ORE = 64;
export const REDSTONE_ORE = 65;
export const LAPIS_ORE = 66;
export const DIAMOND_ORE = 67;
export const EMERALD_ORE = 68;

const hex = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255];

/* Флаги: solid — по блоку можно ходить, liquid — течёт, plant — растёт поверх,
   ore — руда, cut — режется (его видно на срезе), air — пустота. */
const FLAG = { solid: 1, liquid: 2, plant: 4, ore: 8, air: 16 };

/**
 * Таблица блоков. Порядок тут ни на что не влияет (id задан явно), но
 * группировка держит таблицу читаемой: камень, рыхлое, вода, дерево, растения,
 * основание, руды.
 */
export const BLOCKS = Object.freeze([
  { id: AIR, key: 'air', name: 'Воздух', color: 0x000000, alpha: 0, flags: FLAG.air },
  { id: STONE, key: 'stone', name: 'Камень', color: 0x7f7f7f, flags: FLAG.solid },
  { id: DEEPSLATE, key: 'deepslate', name: 'Глубинный сланец', color: 0x4c4c4c, flags: FLAG.solid },
  { id: GRANITE, key: 'granite', name: 'Гранит', color: 0x966a60, flags: FLAG.solid },
  { id: DIORITE, key: 'diorite', name: 'Диорит', color: 0xcfcfcf, flags: FLAG.solid },
  { id: ANDESITE, key: 'andesite', name: 'Андезит', color: 0x8c8c8c, flags: FLAG.solid },
  { id: TUFF, key: 'tuff', name: 'Туф', color: 0x6c6d64, flags: FLAG.solid },
  { id: CALCITE, key: 'calcite', name: 'Кальцит', color: 0xdfe0dc, flags: FLAG.solid },
  { id: BASALT, key: 'basalt', name: 'Базальт', color: 0x52514f, flags: FLAG.solid },
  { id: OBSIDIAN, key: 'obsidian', name: 'Обсидиан', color: 0x14121d, flags: FLAG.solid },
  { id: MAGMA, key: 'magma', name: 'Магма', color: 0x8e3b0e, flags: FLAG.solid },
  { id: DIRT, key: 'dirt', name: 'Земля', color: 0x976d4d, flags: FLAG.solid },
  { id: COARSE_DIRT, key: 'coarse_dirt', name: 'Каменистая земля', color: 0x7a5836, flags: FLAG.solid },
  { id: GRASS_BLOCK, key: 'grass_block', name: 'Дёрн', color: 0x91bd59, flags: FLAG.solid },
  { id: PODZOL, key: 'podzol', name: 'Подзол', color: 0x6d5226, flags: FLAG.solid },
  { id: MYCELIUM, key: 'mycelium', name: 'Мицелий', color: 0x6f6265, flags: FLAG.solid },
  { id: MUD, key: 'mud', name: 'Грязь', color: 0x3c2e30, flags: FLAG.solid },
  { id: MOSS_BLOCK, key: 'moss_block', name: 'Мох', color: 0x5c7f3b, flags: FLAG.solid },
  { id: SAND, key: 'sand', name: 'Песок', color: 0xdbd3a0, flags: FLAG.solid },
  { id: RED_SAND, key: 'red_sand', name: 'Красный песок', color: 0xbe6a2a, flags: FLAG.solid },
  { id: SANDSTONE, key: 'sandstone', name: 'Песчаник', color: 0xd2c283, flags: FLAG.solid },
  { id: RED_SANDSTONE, key: 'red_sandstone', name: 'Красный песчаник', color: 0xb04a22, flags: FLAG.solid },
  { id: GRAVEL, key: 'gravel', name: 'Гравий', color: 0x85756a, flags: FLAG.solid },
  { id: CLAY, key: 'clay', name: 'Глина', color: 0xa4a8b8, flags: FLAG.solid },
  { id: TERRACOTTA, key: 'terracotta', name: 'Терракота', color: 0x985e43, flags: FLAG.solid },
  { id: SNOW_BLOCK, key: 'snow_block', name: 'Снег', color: 0xf0f9fa, flags: FLAG.solid },
  { id: POWDER_SNOW, key: 'powder_snow', name: 'Рыхлый снег', color: 0xf7fbfd, flags: FLAG.solid },
  { id: ICE, key: 'ice', name: 'Лёд', color: 0xa5c9ea, flags: FLAG.solid },
  { id: PACKED_ICE, key: 'packed_ice', name: 'Плотный лёд', color: 0x9cb8e8, flags: FLAG.solid },
  { id: BLUE_ICE, key: 'blue_ice', name: 'Синий лёд', color: 0x74a3e0, flags: FLAG.solid },
  { id: WATER, key: 'water', name: 'Вода', color: 0x3f76e4, alpha: 220, flags: FLAG.liquid },
  { id: LAVA, key: 'lava', name: 'Лава', color: 0xea5500, flags: FLAG.liquid },
  { id: OAK_LOG, key: 'oak_log', name: 'Дубовое брёвно', color: 0x6a5234, flags: FLAG.solid },
  { id: BIRCH_LOG, key: 'birch_log', name: 'Берёзовое брёвно', color: 0xd7cbb4, flags: FLAG.solid },
  { id: SPRUCE_LOG, key: 'spruce_log', name: 'Еловое брёвно', color: 0x4b3a29, flags: FLAG.solid },
  { id: JUNGLE_LOG, key: 'jungle_log', name: 'Тропическое брёвно', color: 0x58452f, flags: FLAG.solid },
  { id: ACACIA_LOG, key: 'acacia_log', name: 'Акациевое брёвно', color: 0x67624b, flags: FLAG.solid },
  { id: MANGROVE_LOG, key: 'mangrove_log', name: 'Мангровое брёвно', color: 0x6b4634, flags: FLAG.solid },
  { id: OAK_LEAVES, key: 'oak_leaves', name: 'Дубовая листва', color: 0x4f7a32, flags: FLAG.solid },
  { id: BIRCH_LEAVES, key: 'birch_leaves', name: 'Берёзовая листва', color: 0x6fa03e, flags: FLAG.solid },
  { id: SPRUCE_LEAVES, key: 'spruce_leaves', name: 'Еловая листва', color: 0x2f5a3c, flags: FLAG.solid },
  { id: JUNGLE_LEAVES, key: 'jungle_leaves', name: 'Листва тропиков', color: 0x3f8a2e, flags: FLAG.solid },
  { id: ACACIA_LEAVES, key: 'acacia_leaves', name: 'Листва акации', color: 0x6e9c33, flags: FLAG.solid },
  { id: MANGROVE_LEAVES, key: 'mangrove_leaves', name: 'Мангровая листва', color: 0x4e7c3b, flags: FLAG.solid },
  { id: PLANKS, key: 'planks', name: 'Доски', color: 0xb08c4f, flags: FLAG.solid },
  { id: COBBLESTONE, key: 'cobblestone', name: 'Булыжник', color: 0x8a8a8a, flags: FLAG.solid },
  { id: GLASS, key: 'glass', name: 'Стекло', color: 0xc9e6ef, alpha: 150, flags: FLAG.solid },
  { id: DIRT_PATH, key: 'dirt_path', name: 'Тропа', color: 0x9e7e4e, flags: FLAG.solid },
  { id: HAY_BLOCK, key: 'hay_block', name: 'Стог сена', color: 0xc5a11b, flags: FLAG.solid },
  { id: BAMBOO, key: 'bamboo', name: 'Бамбук', color: 0x6f9a3a, flags: FLAG.plant },
  { id: TALL_GRASS, key: 'tall_grass', name: 'Высокая трава', color: 0x74a83f, flags: FLAG.plant },
  { id: FERN, key: 'fern', name: 'Папоротник', color: 0x5f8f45, flags: FLAG.plant },
  { id: CACTUS, key: 'cactus', name: 'Кактус', color: 0x5a8a3a, flags: FLAG.plant },
  { id: DEAD_BUSH, key: 'dead_bush', name: 'Сухой куст', color: 0x94613b, flags: FLAG.plant },
  { id: SUGAR_CANE, key: 'sugar_cane', name: 'Тростник', color: 0x7cb85a, flags: FLAG.plant },
  { id: MUSHROOM_BLOCK, key: 'mushroom_block', name: 'Грибной блок', color: 0xb84b4b, flags: FLAG.solid },
  { id: LILY_PAD, key: 'lily_pad', name: 'Лилия', color: 0x2f7a2a, flags: FLAG.plant },
  { id: SEA_GRASS, key: 'sea_grass', name: 'Морская трава', color: 0x2c7a4a, flags: FLAG.plant },
  { id: KELP, key: 'kelp', name: 'Ламинария', color: 0x39603a, flags: FLAG.plant },
  { id: SNOW_LAYER, key: 'snow_layer', name: 'Снежный слой', color: 0xf4fbfd, flags: FLAG.plant },
  { id: BEDROCK, key: 'bedrock', name: 'Основание', color: 0x333333, flags: FLAG.solid },
  { id: COAL_ORE, key: 'coal_ore', name: 'Угольная руда', color: 0x4f4f4f, flags: FLAG.solid | FLAG.ore },
  { id: IRON_ORE, key: 'iron_ore', name: 'Железная руда', color: 0xbca08c, flags: FLAG.solid | FLAG.ore },
  { id: COPPER_ORE, key: 'copper_ore', name: 'Медная руда', color: 0xc58a62, flags: FLAG.solid | FLAG.ore },
  { id: GOLD_ORE, key: 'gold_ore', name: 'Золотая руда', color: 0xe0bf4e, flags: FLAG.solid | FLAG.ore },
  { id: REDSTONE_ORE, key: 'redstone_ore', name: 'Редстоуновая руда', color: 0xc13e3e, flags: FLAG.solid | FLAG.ore },
  { id: LAPIS_ORE, key: 'lapis_ore', name: 'Лазуритовая руда', color: 0x3a5cb8, flags: FLAG.solid | FLAG.ore },
  { id: DIAMOND_ORE, key: 'diamond_ore', name: 'Алмазная руда', color: 0x58d3d8, flags: FLAG.solid | FLAG.ore },
  { id: EMERALD_ORE, key: 'emerald_ore', name: 'Изумрудная руда', color: 0x2fbf5c, flags: FLAG.solid | FLAG.ore },
]);

/** Цвета блоков, разложенные по id: 3 байта на блок, чтение без объектов. */
export const BLOCK_COLORS = new Uint8Array(256 * 3);
export const BLOCK_NAMES = new Array(256);
export const BLOCK_KEYS = new Array(256);
export const BLOCK_FLAGS = new Uint8Array(256);
export const BLOCK_ALPHA = new Uint8Array(256);
for (const block of BLOCKS) {
  const [r, g, b] = hex(block.color);
  BLOCK_COLORS[block.id * 3] = r;
  BLOCK_COLORS[block.id * 3 + 1] = g;
  BLOCK_COLORS[block.id * 3 + 2] = b;
  BLOCK_NAMES[block.id] = block.name;
  BLOCK_KEYS[block.id] = block.key;
  BLOCK_FLAGS[block.id] = block.flags ?? FLAG.solid;
  BLOCK_ALPHA[block.id] = block.alpha ?? 255;
}

export const blockById = (id) => BLOCKS.find((block) => block.id === id) ?? null;
export const blockName = (id) => BLOCK_NAMES[id] || 'Блок';
export const blockKey = (id) => BLOCK_KEYS[id] || 'block';
export const blockRgb = (id) => [BLOCK_COLORS[id * 3], BLOCK_COLORS[id * 3 + 1], BLOCK_COLORS[id * 3 + 2]];
export const isOre = (id) => (BLOCK_FLAGS[id] & FLAG.ore) !== 0;
export const isLiquid = (id) => (BLOCK_FLAGS[id] & FLAG.liquid) !== 0;
export const isPlant = (id) => (BLOCK_FLAGS[id] & FLAG.plant) !== 0;
export const isAir = (id) => id === AIR;

/**
 * Руды: ярусы залегания и редкость — по мотивам майнкрафтовых распределений
 * (уголь и медь ближе к поверхности, алмаз и редстоун — у основания). `peak` —
 * ярус наибольшей плотности, `spread` — насколько плотность падает к границам
 * яруса; `chance` — доля руды в подходящем камне.
 */
export const ORES = Object.freeze([
  /* chance — доля руды в камне на пике полосы: угля много, алмаза мало, как в игре. */
  { id: COAL_ORE, name: 'Угольная руда', minY: 24, maxY: 220, peak: 96, spread: 120, chance: 0.021 },
  { id: COPPER_ORE, name: 'Медная руда', minY: 20, maxY: 176, peak: 88, spread: 90, chance: 0.0086 },
  { id: IRON_ORE, name: 'Железная руда', minY: 4, maxY: 128, peak: 32, spread: 70, chance: 0.0114 },
  { id: LAPIS_ORE, name: 'Лазуритовая руда', minY: 2, maxY: 64, peak: 24, spread: 40, chance: 0.0021 },
  { id: GOLD_ORE, name: 'Золотая руда', minY: 2, maxY: 56, peak: 20, spread: 34, chance: 0.0036 },
  { id: REDSTONE_ORE, name: 'Редстоуновая руда', minY: 1, maxY: 32, peak: 12, spread: 22, chance: 0.0043 },
  { id: DIAMOND_ORE, name: 'Алмазная руда', minY: 1, maxY: 24, peak: 8, spread: 16, chance: 0.0011 },
  { id: EMERALD_ORE, name: 'Изумрудная руда', minY: 2, maxY: 96, peak: 40, spread: 70, chance: 0.0007, mountainsOnly: true },
]);
