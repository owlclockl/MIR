/* Колонка мира: что стоит в точке сверху вниз.

   Формула рельефа (src/gen/terrain.js) отвечает, где поверхность. Колонка
   отвечает, из чего мир сложен: дёрн и подстилка по биому, камень с породами,
   глубинный сланец у основания, пещеры, руды, лёд на воде и снег сверху.
   Ровно это и видно в игре, когда смотришь на мир сверху или режешь его
   плоскостью на ярусе.

   Порядок слоёв — как в Minecraft:

     • поверхность   — блок биома (дёрн, песок, снег, мицелий);
     • подстилка     — земля, песок или терракота на 3–5 блоков;
     • камень        — с вкраплениями гранита, диорита и андезита, ниже 20-го
                       яруса — глубинный сланец;
     • основание     — неразрушимые блоки у самого низа;
     • пещеры        — объёмный шум: «сырные» каверны и ходы-спагетти;
     • руды          — жилы в камне по ярусам залегания (уголь выше, алмаз ниже).

   Пещеры и руды считаются только там, где их спрашивают: колонка знает
   поверхность всегда, а что у неё внутри — по запросу. Иначе вид на весь мир
   платил бы за подземелья, которых в кадре нет. */

import { biomeDepth, biomeFiller, biomeIcy, biomePlant, biomeSnowy, biomeSurface, biomeTree, biomeUnderwater, TREE_BLOCKS } from './biomes.js';
import {
  AIR, ANDESITE, BEDROCK, CLAY, DIORITE, DEEPSLATE, GRAVEL, GRANITE, ICE, LAVA, MUD,
  ORES, SAND, SANDSTONE, SNOW_LAYER, STONE, TUFF, WATER,
} from './blocks.js';
import { hashSeed, perlin3, rand01 } from './noise.js';
import { BEDROCK_TOP, clamp, SEA_LEVEL, WORLD_Y } from './scale.js';
import { S, SAMPLE_SIZE } from './terrain.js';

/** Ниже этого яруса камень сменяется глубинным сланцем — как в Minecraft. */
const DEEPSLATE_TOP = 20;
/** Лавовые озёра: ниже этого яруса вода в пещерах становится лавой. */
const LAVA_TOP = 10;

/** Радиус кроны по виду дерева: с него листва накрывает соседние колонки. */
const TREE_RADIUS = Object.freeze({
  oak: 2,
  birch: 2,
  spruce: 1,
  dark_oak: 2,
  jungle: 3,
  acacia: 2,
  mangrove: 3,
  mushroom: 2,
});

/** Индексы полей колонки: колонка — массив, а не объект (её читают на каждый пиксель). */
export const C = Object.freeze({
  HEIGHT: 0,
  BIOME: 1,
  WATER: 2,
  WATER_Y: 3,
  CANOPY_TOP: 4,
  CANOPY_BLOCK: 5,
  SURFACE: 6,
  FILLER: 7,
  DEPTH: 8,
  SNOW: 9,
  SNOWY: 10,
  ICY: 11,
  TEMPERATURE: 12,
  HUMIDITY: 13,
  MOUNTAIN: 14,
  PRECIPITATION: 15,
  STRUCTURE: 16,
  STRUCTURE_NAME: 17,
  RIVER_WIDTH: 18,
  RIVER_AREA: 19,
  LAKE_DEPTH: 20,
  CONTINENTALNESS: 21,
});
export const COLUMN_SIZE = 24;

/**
 * @param {{planet: object, terrain: object, seed?: string, structures: object}} options
 */
export const createColumns = ({ planet, terrain, seed = '', structures }) => {
  const R = hashSeed(seed);
  const caveSeeds = [R ^ 0x3c6ef372, R ^ 0xa54ff53a, R ^ 0x1f83d9ab, R ^ 0x5be0cd19];
  const rockSeed = R ^ 0x27d4eb2f;
  const treeSeed = R ^ 0x165667b1;
  const oreSeeds = ORES.map((ore) => hashSeed(`${seed}:ore:${ore.id}`));
  const sampleOut = new Float64Array(SAMPLE_SIZE);

  /**
   * Колонка в точке. Пишет в `out` (Float64Array COLUMN_SIZE).
   * Стоимость — один сэмпл рельефа и немного хешей: этого достаточно, чтобы
   * звать колонку на каждый пиксель кадра.
   */
  const columnAt = (x, z, out) => {
    terrain.sample(x, z, 4, sampleOut);
    let height = Math.round(sampleOut[S.HEIGHT]);
    const water = sampleOut[S.WATER];
    const waterY = sampleOut[S.WATER_Y];

    /* Деревня выравнивает площадку: дома не должны стоять на склоне. */
    let structureBlock = 0;
    let structureName = '';
    let structure = null;
    if (water === 0) {
      structure = structures.at(x, z);
      if (structure) {
        const blended = height * (1 - structure.blend) + structure.ground * structure.blend;
        height = Math.round(blended);
        structureBlock = structures.blockAt(x, z);
        structureName = structure.name;
      }
    }

    height = clamp(height, BEDROCK_TOP + 1, WORLD_Y - 4);
    const biome = sampleOut[S.BIOME];
    const depth = biomeDepth(biome);
    let surface = biomeSurface(biome);
    let filler = biomeFiller(biome);
    if (water !== 0) {
      /* Под водой поверхность — дно: песок или гравий, а не дёрн. */
      surface = biomeUnderwater(biome);
      filler = biomeFiller(biome);
    }
    if (structureBlock) surface = structureBlock;

    /* Крона: листва соседних деревьев накрывает и эту колонку. Считаем только
       хеши соседей (дёшево), а высоту берём свою: рельеф под лесом меняется
       медленно, для кроны этого достаточно. */
    let canopyTop = 0;
    let canopyBlock = 0;
    const tree = biomeTree(biome);
    if (tree) {
      const radius = TREE_RADIUS[tree.type] ?? 2;
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const tx = x + dx;
          const tz = z + dz;
          if (rand01(treeSeed, tx, tz, 0) >= tree.density) continue;
          const trunk = tree.minH + Math.floor(rand01(treeSeed, tx, tz, 1) * (tree.maxH - tree.minH + 1));
          const top = height + trunk;
          if (top <= canopyTop) continue;
          /* Углы квадрата срезаны: крона округляется, как у настоящего дерева. */
          const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
          if (corner && radius > 1) continue;
          canopyTop = top;
          canopyBlock = TREE_BLOCKS[tree.type]?.leaves ?? TREE_BLOCKS.oak.leaves;
        }
      }
    }

    const snowy = biomeSnowy(biome) || sampleOut[S.SNOW] === 1;
    out[C.HEIGHT] = height;
    out[C.BIOME] = biome;
    out[C.WATER] = water;
    out[C.WATER_Y] = Math.round(waterY);
    out[C.CANOPY_TOP] = canopyTop;
    out[C.CANOPY_BLOCK] = canopyBlock;
    out[C.SURFACE] = surface;
    out[C.FILLER] = filler;
    out[C.DEPTH] = depth;
    out[C.SNOW] = snowy ? 1 : 0;
    out[C.SNOWY] = biomeSnowy(biome) ? 1 : 0;
    out[C.ICY] = biomeIcy(biome) ? 1 : 0;
    out[C.TEMPERATURE] = sampleOut[S.TEMPERATURE];
    out[C.HUMIDITY] = sampleOut[S.HUMIDITY];
    out[C.MOUNTAIN] = sampleOut[S.MOUNTAIN];
    out[C.PRECIPITATION] = sampleOut[S.PRECIPITATION];
    out[C.STRUCTURE] = structure ? 1 : 0;
    out[C.STRUCTURE_NAME] = structureName;
    out[C.RIVER_WIDTH] = sampleOut[S.RIVER_WIDTH];
    out[C.RIVER_AREA] = sampleOut[S.RIVER_AREA];
    out[C.LAKE_DEPTH] = sampleOut[S.LAKE_DEPTH];
    out[C.CONTINENTALNESS] = sampleOut[S.CONTINENTALNESS];
    return out;
  };

  /** Колонка как объект — для HUD, подсказок и проверок. */
  const columnInfo = (x, z) => {
    const out = new Float64Array(COLUMN_SIZE);
    columnAt(x, z, out);
    return {
      x,
      z,
      height: out[C.HEIGHT],
      biome: out[C.BIOME],
      water: out[C.WATER],
      waterY: out[C.WATER_Y],
      canopyTop: out[C.CANOPY_TOP],
      canopyBlock: out[C.CANOPY_BLOCK],
      surface: out[C.SURFACE],
      filler: out[C.FILLER],
      depth: out[C.DEPTH],
      snow: out[C.SNOW] === 1,
      snowy: out[C.SNOWY] === 1,
      icy: out[C.ICY] === 1,
      temperature: out[C.TEMPERATURE],
      humidity: out[C.HUMIDITY],
      precipitation: out[C.PRECIPITATION],
      mountain: out[C.MOUNTAIN] === 1,
      structure: out[C.STRUCTURE] === 1 ? out[C.STRUCTURE_NAME] : null,
      riverWidth: out[C.RIVER_WIDTH],
      riverArea: out[C.RIVER_AREA],
      lakeDepth: out[C.LAKE_DEPTH],
      continentalness: out[C.CONTINENTALNESS],
    };
  };

  /**
   * Пещера ли это: «сырные» каверны плюс два хода-спагетти. Вертикальный
   * масштаб шума сжат — пещеры в Minecraft вытянуты вдоль поверхности, и
   * плоский срез это показывает.
   */
  const isCave = (x, y, z) => {
    if (y <= BEDROCK_TOP) return false;
    const cheese = perlin3(caveSeeds[0], x / 120, y / 56, z / 120) + perlin3(caveSeeds[1], x / 46, y / 22, z / 46) * 0.5;
    if (cheese > 0.72) return true;
    const tunnelA = Math.abs(perlin3(caveSeeds[2], x / 155, y / 72, z / 155));
    if (tunnelA > 0.058) return false;
    const tunnelB = Math.abs(perlin3(caveSeeds[3], x / 130, y / 60, z / 130));
    return tunnelB < 0.075;
  };

  /** Вкрапления пород в камне: гранит, диорит, андезит и туф. */
  const rockAt = (x, y, z) => {
    if (y < DEEPSLATE_TOP) {
      const patch = perlin3(rockSeed, x / 70, y / 34, z / 70);
      if (patch > 0.62) return TUFF;
      return DEEPSLATE;
    }
    const patch = perlin3(rockSeed, x / 84, y / 40, z / 84);
    if (patch > 0.55) return GRANITE;
    if (patch < -0.55) return DIORITE;
    if (patch > 0.44 && patch < 0.5) return ANDESITE;
    return STONE;
  };

  /** Плотность руды по ярусу: пик в середине полосы, спадание к краям. */
  const bandFactor = (y, ore) => {
    if (y < ore.minY || y > ore.maxY) return 0;
    const spread = Math.max(1, ore.spread);
    const t = (y - ore.peak) / spread;
    return Math.exp(-t * t);
  };

  /**
   * Есть ли эта руда в точке. Жила — сгусток объёмного шума, внутри него блоки
   * руды стоят с промежутками: так руда выглядит вкраплениями, а не пластом.
   * Отдельной функцией — чтобы проверки могли измерить каждую руду поимённо.
   */
  const oreHits = (x, y, z, index, mountainous) => {
    const ore = ORES[index];
    if (ore.mountainsOnly && !mountainous) return false;
    const band = bandFactor(y, ore);
    if (band < 0.08) return false;
    const oreSeed = oreSeeds[index];
    const vein = perlin3(oreSeed, x / 17, y / 9, z / 17);
    if (vein < 0.74 - 0.12 * band) return false;
    return rand01(oreSeed ^ 0x9e3779b9, x, y, z) <= ore.chance * 26 * band;
  };

  /* Порядок проверки: редкие и глубокие руды важнее частых — если в одной точке
     сошлись жилы, сверху видно алмаз, а не уголь (так же поступает Minecraft). */
  const ORE_ORDER = [7, 6, 5, 3, 4, 2, 1, 0];

  /** Руда в этой точке или 0. */
  const oreAt = (x, y, z, mountainous) => {
    for (let k = 0; k < ORE_ORDER.length; k += 1) {
      const index = ORE_ORDER[k];
      if (oreHits(x, y, z, index, mountainous)) return ORES[index].id;
    }
    return 0;
  };

  /** Сколько руды в слое — по этим числам проверяется, что таблица живая. */
  const oreDensity = (x, y, z, mountainous = false) => {
    let count = 0;
    for (let dy = 0; dy < 8; dy += 1) {
      for (let dz = 0; dz < 8; dz += 1) {
        for (let dx = 0; dx < 8; dx += 1) {
          if (oreAt(x + dx, y + dy, z + dz, mountainous)) count += 1;
        }
      }
    }
    return count / 512;
  };

  /**
   * Блок в точке колонки. `col` — результат columnAt: колонка уже посчитана,
   * поэтому срез не пересчитывает рельеф на каждый ярус.
   */
  const blockInColumn = (x, y, z, col) => {
    const height = col[C.HEIGHT];
    const water = col[C.WATER];
    const waterY = col[C.WATER_Y];
    if (y > height) {
      if (water !== 0 && y <= waterY) {
        if (y === waterY && col[C.ICY] === 1) return ICE;
        return WATER;
      }
      const canopyTop = col[C.CANOPY_TOP];
      if (canopyTop > 0 && y <= canopyTop && y >= height + 2) return col[C.CANOPY_BLOCK];
      if (y === height + 1 && col[C.SNOW] === 1 && water === 0) return SNOW_LAYER;
      return AIR;
    }
    if (y <= BEDROCK_TOP) return BEDROCK;
    if (y === height) return col[C.SURFACE];
    const depth = col[C.DEPTH];
    if (y > height - depth) {
      /* Подстилка: под песком — песчаник, под грязью — глина, иначе земля. */
      const filler = col[C.FILLER];
      if (filler === SAND && y < height - 2) return SANDSTONE;
      if (filler === MUD && y < height - 2) return CLAY;
      return filler;
    }
    if (isCave(x, y, z)) {
      if (y <= LAVA_TOP) return LAVA;
      return AIR;
    }
    const ore = oreAt(x, y, z, col[C.MOUNTAIN] === 1);
    if (ore) return ore;
    if (water !== 0 && y > height - depth - 3 && y < height) return GRAVEL;
    return rockAt(x, y, z);
  };

  /** Блок в точке без готовой колонки: считает её сам. */
  const blockAt = (x, y, z) => {
    const col = new Float64Array(COLUMN_SIZE);
    columnAt(x, z, col);
    return blockInColumn(x, y, z, col);
  };

  return {
    c: C,
    columnAt,
    columnInfo,
    blockInColumn,
    blockAt,
    isCave,
    oreAt,
    oreHits,
    oreDensity,
    rockAt,
    /** Уровень моря и границы, нужные виду: одна точка правды о вертикали. */
    seaLevel: SEA_LEVEL,
    worldY: WORLD_Y,
    bedrockTop: BEDROCK_TOP,
    /** Растение биома в точке — мелкая зелень на срезе поверхности. */
    plantAt: (biome, x, z) => {
      const plant = biomePlant(biome);
      if (!plant) return 0;
      return rand01(R ^ 0x7feb352d, x, z, 0) < plant.density ? plant.block : 0;
    },
    stats: () => ({ ores: ORES.length, trees: Object.keys(TREE_RADIUS).length }),
  };
};
