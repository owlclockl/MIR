/* Слои 2D-карты блоков.

   Мир по высоте делится на LAYER_COUNT = 20 ярусов одинаковой толщины. Ползунок
   выбирает ярус; на карте видны только блоки этого яруса, сверху вниз, первый
   непустой блок в каждой колонке. Всё остальное — выше и ниже — не рисуется.

   Пресеты — это фильтры по типу блока внутри яруса:
     all      — всё, что есть в ярусе;
     crowns   — кроны: брёвна и листва;
     surface  — поверхность: клетка, где наивысший блок колонки лежит в ярусе;
     water    — вода;
     bottom   — дно: блок под водой;
     caves    — полы пещер: твёрдый блок с воздухом сверху, глубже поверхности;
     ores     — руды;
     base     — основание: камень, базальт, бедрок и подобные.

   Модуль чистый: без DOM и без генератора. На вход — колонки чанка, на
   выход — пиксели RGBA. Так же его проверяет npm run test:voxel. */

import { AIR, BEDROCK, BASALT, COBBLE, MAGMA, OBSIDIAN, STONE, WATER, WATER_SOURCE } from './blocks.js';
import { CHUNK_SX, CHUNK_SZ } from './chunk.js';

export const LAYER_COUNT = 20;

export const PRESETS = Object.freeze([
  { id: 'all', label: 'Все слои' },
  { id: 'crowns', label: 'Кроны' },
  { id: 'surface', label: 'Поверхность' },
  { id: 'water', label: 'Вода' },
  { id: 'bottom', label: 'Дно' },
  { id: 'caves', label: 'Пещеры' },
  { id: 'ores', label: 'Руды' },
  { id: 'base', label: 'Основание' },
]);

const CROWN_MIN = 30;
const CROWN_MAX = 45;
const ORE_MIN = 60;
const ORE_MAX = 63;
const BASE_IDS = new Set([STONE, COBBLE, BASALT, OBSIDIAN, BEDROCK, MAGMA]);

const isWater = (id) => id === WATER || id === WATER_SOURCE;
const isCrown = (id) => id >= CROWN_MIN && id <= CROWN_MAX;
const isOre = (id) => id >= ORE_MIN && id <= ORE_MAX;

/** Толщина яруса в блоках: верхний ярус может быть короче. */
export const layerSize = (worldHeight) => Math.ceil(worldHeight / LAYER_COUNT);

/** Ярус → диапазон высот [lo, hi] включительно. */
export const layerBand = (worldHeight, layer) => {
  const size = layerSize(worldHeight);
  const index = Math.min(LAYER_COUNT - 1, Math.max(0, Math.round(layer)));
  const lo = index * size;
  const hi = Math.min(worldHeight - 1, lo + size - 1);
  return { index, lo, hi };
};

/** Номер яруса, в который попадает высота y. */
export const layerOf = (worldHeight, y) => Math.min(LAYER_COUNT - 1, Math.floor(Math.max(0, y) / layerSize(worldHeight)));

export const presetById = (id) => PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];

/**
 * Высота самого верхнего непустого блока колонки (или -1, если колонка пуста).
 * Колонка — это непрерывный срез массива чанка: base — смещение её первого y.
 */
const columnTop = (blocks, base, height) => {
  for (let y = height - 1; y >= 0; y -= 1) if (blocks[base + y] !== AIR) return y;
  return -1;
};

/**
 * Что показывает пресет в одной колонке внутри яруса [lo, hi].
 * Возвращает id блока или AIR, если в ярусе нечего показать.
 */
export const pickInColumn = (blocks, base, height, lo, hi, preset) => {
  const top = columnTop(blocks, base, height);
  if (top < 0) return AIR;
  if (preset === 'surface') return top >= lo && top <= hi ? blocks[base + top] : AIR;

  /* Дно: всё, что лежит ниже уровня воды колонки. Вода может быть в другом
     ярусе — это нормально, дно видно на своём ярусе. */
  let waterTop = -1;
  if (preset === 'bottom') {
    for (let y = height - 1; y >= 0; y -= 1) {
      if (isWater(blocks[base + y])) {
        waterTop = y;
        break;
      }
    }
  }

  for (let y = Math.min(hi, height - 1); y >= lo; y -= 1) {
    const id = blocks[base + y];
    if (id === AIR) continue;
    switch (preset) {
      case 'all':
        return id;
      case 'crowns':
        if (isCrown(id)) return id;
        break;
      case 'water':
        if (isWater(id)) return id;
        break;
      case 'bottom':
        if (!isWater(id) && y < waterTop) return id;
        break;
      case 'caves':
        if (y < top - 3 && y + 1 < height && blocks[base + y + 1] === AIR) return id;
        break;
      case 'ores':
        if (isOre(id)) return id;
        break;
      case 'base':
        if (BASE_IDS.has(id)) return id;
        break;
      default:
        return id;
    }
  }
  return AIR;
};

/**
 * Срез одного чанка на ярус: RGBA-буфер CHUNK_SX × CHUNK_SZ. Колонка без
 * блока в ярусе остаётся прозрачной (alpha 0).
 *
 * @param {object} chunk — результат generateChunk (с юбкой)
 * @param {{lo:number, hi:number}} band
 * @param {string} preset
 * @param {Map<number, number[]>} colors — цвет блока по id (см. blockColors)
 */
export const sliceChunk = (chunk, band, preset, colors) => {
  const out = new Uint8ClampedArray(CHUNK_SX * CHUNK_SZ * 4);
  const { blocks, sx, height, ox, oz } = chunk;
  for (let lz = 0; lz < CHUNK_SZ; lz += 1) {
    for (let lx = 0; lx < CHUNK_SX; lx += 1) {
      const base = ((oz + lz) * sx + (ox + lx)) * height;
      const id = pickInColumn(blocks, base, height, band.lo, band.hi, preset);
      if (id === AIR) continue;
      const color = colors.get(id);
      if (!color) continue;
      const at = (lz * CHUNK_SX + lx) * 4;
      out[at] = color[0];
      out[at + 1] = color[1];
      out[at + 2] = color[2];
      out[at + 3] = 255;
    }
  }
  return out;
};

/** Блок колонки (x, z) в ярусе — для подсказки под курсором. */
export const pickAt = (chunk, lx, lz, band, preset) => {
  const { blocks, sx, height, ox, oz } = chunk;
  const base = ((oz + lz) * sx + (ox + lx)) * height;
  return pickInColumn(blocks, base, height, band.lo, band.hi, preset);
};

