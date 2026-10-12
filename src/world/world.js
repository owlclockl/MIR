/* Хранилище чанков и кадровый бюджет.

Мир неограниченный и зацикленный (зеркальное замощение поля, §7 docs), поэтому

чанки живут только в памяти и только в радиусе обзора: колонка — чистая

функция от поля и координат, пересчёт дешевле кэша и его версионирования.

Потребитель у хранилища один — плоская карта (`layers.js`), которая по одному

блоку на пиксель читает `get(cx, cz).chunk` и `blockAt`. Отсюда и форма API:

никаких мешей, текстурных загрузчиков и «видимых» множеств — только построка

по бюджету кадра и статистика для HUD.

Генерация идёт кусками в пределах бюджета кадра (`step(budgetMs)`): воркеры

недоступны — в SharedArrayBuffer отказано (у хаба нет COOP/COEP), а в

однофайловой версии по file:// модульный воркер не грузится. Очередь

упорядочена по дистанции от камеры, так что первые кадры показывают ближние

чанки, а не случайные. */

import { CHUNK_SX, CHUNK_SZ, generateChunk } from './chunk.js';

import { clamp } from './math.js';

/** Ключ чанка. Координаты не нормализуем периодом: чанк на шве зеркального

* тайла не совпадает ни с одним «внутренним» — переиспользование дало бы щели. */

const key = (cx, cz) => `${cx},${cz}`;

/**

* @param {object} field результат buildField

* @param {{ radius?: number, skirt?: boolean, caves?: boolean, ores?: boolean,

* decor?: boolean }} options

*/

export const createVoxelWorld = (field, options = {}) => {
  const radius = clamp(Math.round(options.radius ?? 6), 2, 24);

  const chunks = new Map();

  const state = { cx: null, cz: null, focusX: 0, focusZ: 0, queue: [], generated: 0, dropped: 0, genMs: 0 };

  const inRange = (cx, cz) => Math.abs(cx - state.cx) <= radius && Math.abs(cz - state.cz) <= radius;

  const create = (cx, cz) => {
    const record = { cx, cz, key: key(cx, cz), chunk: null, ready: false, bytes: 0 };

    chunks.set(record.key, record);

    return record;
  };

  const buildRecord = (record) => {
    const genStart = performance.now();

    const chunk = generateChunk(field, record.cx, record.cz, {
      skirt: options.skirt !== false,

      caves: options.caves !== false,

      ores: options.ores !== false,

      decor: options.decor !== false,
    });

    state.genMs = performance.now() - genStart;

    record.chunk = chunk;

    /* Битый блок на блок: сколько чанк весит в памяти — это и есть цена

радиуса обзора, её и показываем в статистике. */

    record.bytes = chunk.blocks.byteLength;

    record.ready = true;

    return record;
  };

  /** Камера смотрит в мировую точку (x, z) по пикселям карты. */

  const focus = (x, z) => {
    state.focusX = x;

    state.focusZ = z;

    const cx = Math.floor(x / CHUNK_SX);

    const cz = Math.floor(z / CHUNK_SZ);

    if (cx === state.cx && cz === state.cz) return false;

    state.cx = cx;

    state.cz = cz;

    reschedule();

    return true;
  };

  /** Все чанки в радиусе — в очередь; готовые остаются готовыми. */

  const reschedule = () => {
    const list = [];

    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const cx = state.cx + dx;

        const cz = state.cz + dz;

        const record = chunks.get(key(cx, cz));

        if (record?.ready) continue;

        list.push({ k: cx * 1e6 + cz, cx, cz, d: dx * dx + dz * dz });
      }
    }

    list.sort((a, b) => a.d - b.d || a.k - b.k);

    state.queue = list.map((item) => key(item.cx, item.cz));

    dropFar();
  };

  /** Выгружаем то, что далеко: память должна быть ограничена радиусом. */

  const dropFar = () => {
    for (const [k, record] of chunks) {
      if (inRange(record.cx, record.cz)) continue;

      chunks.delete(k);

      state.dropped += 1;
    }
  };

  /**

* Генерирует чанки, пока не кончится бюджет кадра. Один чанк на вызов —

* минимальная порция: даже он стоит единицы миллисекунд, а два подряд уже

* могут съесть кадр на слабом телефоне.

*

* @param {number} budgetMs

* @returns {{done: boolean, generated: number, ms: number, queued: number}}

*/

  const step = (budgetMs = 6) => {
    if (!state.queue.length) return { done: true, generated: 0, ms: 0, queued: 0 };

    const start = performance.now();

    let generated = 0;

    do {
      const next = state.queue.shift();

      if (!next) break;

      const [cx, cz] = next.split(',').map(Number);

      const record = chunks.get(next) ?? create(cx, cz);

      if (!record.ready) buildRecord(record);

      generated += 1;
    } while (state.queue.length && performance.now() - start < budgetMs);

    state.generated += generated;

    return { done: state.queue.length === 0, generated, ms: performance.now() - start, queued: state.queue.length };
  };

  const get = (cx, cz) => chunks.get(key(cx, cz)) ?? null;

  const stats = () => {
    let ready = 0;

    let bytes = 0;

    for (const record of chunks.values()) {
      if (!record.ready) continue;

      ready += 1;

      bytes += record.bytes;
    }

    const total = (radius * 2 + 1) ** 2;

    return {
      chunks: chunks.size,

      ready,

      queued: state.queue.length,

      pending: total - ready - state.queue.length,

      radius,

      focus: { cx: state.cx, cz: state.cz },

      bytes,

      generated: state.generated,

      dropped: state.dropped,

      lastGenMs: state.genMs,
    };
  };

  const dispose = () => {
    chunks.clear();

    state.queue = [];
  };

  return {
    field,

    radius,

    focus,

    step,

    get,

    stats,

    dispose,

    /** Сколько чанков уже построено — по этому признаку экран ждёт первого кадра. */

    get readyCount() {
      let count = 0;

      for (const record of chunks.values()) if (record.ready) count += 1;

      return count;
    },
  };
};
