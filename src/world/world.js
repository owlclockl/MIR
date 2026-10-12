/* Кэш чанков для 2D-карты.

   Чанк — это блоки колонок 16 × 16 (с юбкой в 1 блок по краю): генерируется
   один раз и хранится, пока не вытеснен. Меш и GL здесь не нужны: 2D-вид
   читает блоки напрямую (см. layers.js).

   Память ограничена LRU: при limit = 256 это около 22 МБ. Чанк, которого
   нет в кэше, генерируется заново — медленнее, но без утечек при панорамировании
   по карте любого размера. */

import { CHUNK_SX, CHUNK_SZ, generateChunk } from './chunk.js';
import { clamp } from './math.js';

const key = (cx, cz) => `${cx},${cz}`;

/**
 * @param {object} field — результат buildField
 * @param {{limit?: number}} options
 */
export const createChunkCache = (field, options = {}) => {
  const limit = clamp(Math.round(options.limit ?? 256), 16, 1024);
  /* Map сохраняет порядок вставки: первый ключ — самый давний, его и вытесняем. */
  const chunks = new Map();
  const stats = { generated: 0, evicted: 0, genMs: 0 };

  const get = (cx, cz) => {
    const id = key(cx, cz);
    const hit = chunks.get(id);
    if (hit) {
      /* Попадание переносим в конец — это «недавно использованный». */
      chunks.delete(id);
      chunks.set(id, hit);
      return hit;
    }
    const start = performance.now();
    const chunk = generateChunk(field, cx, cz);
    stats.genMs = performance.now() - start;
    stats.generated += 1;
    chunks.set(id, chunk);
    while (chunks.size > limit) {
      chunks.delete(chunks.keys().next().value);
      stats.evicted += 1;
    }
    return chunk;
  };

  /* Есть ли чанк в кэше — без генерации, для подсказки «считаю…». */
  const has = (cx, cz) => chunks.has(key(cx, cz));

  return {
    get,
    has,
    get size() {
      return chunks.size;
    },
    stats,
    clear() {
      chunks.clear();
    },
  };
};

/** Границы карты в блоках и число чанков по каждой оси. */
export const worldExtent = (field) => ({
  width: Math.max(1, Math.round(field.width)),
  height: Math.max(1, Math.round(field.height)),
  chunksX: Math.ceil(Math.max(1, Math.round(field.width)) / CHUNK_SX),
  chunksZ: Math.ceil(Math.max(1, Math.round(field.height)) / CHUNK_SZ),
});
