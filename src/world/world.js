/* Хранилище чанков и кадровый бюджет.

   Мир неограниченный и зацикленный (зеркальное замощение поля, §7 docs), поэтому
   чанки живут только в памяти и только в радиусе обзора: колонка — чистая
   функция от поля и координат, пересчёт дешевле кэша и его версионирования.

   Генерация идёт кусками в пределах бюджета кадра (`step(budgetMs)`): воркеры
   недоступны — в SharedArrayBuffer отказано (у хаба нет COOP/COEP), а в
   однофайловой версии по file:// модульный воркер не грузится. Очередь
   упорядочена по дистанции от камеры, так что первые кадры показывают ближние
   чанки, а не случайные. */

import { CHUNK_SX, CHUNK_SZ, generateChunk } from './chunk.js';
import { buildChunkMesh, meshIsEmpty } from './mesher.js';
import { fold } from './field.js';
import { clamp } from './math.js';

/** Ключ чанка. Координаты не нормализуем периодом: чанк на шве зеркального
 *  тайла не совпадает ни с одним «внутренним» — переиспользование дало бы щели. */
const key = (cx, cz) => `${cx},${cz}`;

/**
 * @param {object} field результат buildField
 * @param {{ radius?: number, skirt?: boolean, caves?: boolean, ores?: boolean,
 *            decor?: boolean, mesh?: object, upload?: (chunk, mesh) => object,
 *            release?: (handle) => void }} options
 *   upload/release — мост к GPU: мир не знает про WebGL, он лишь передаёт mesh
 *   и хранит то, что вернул upload.
 */
export const createVoxelWorld = (field, options = {}) => {
  const radius = clamp(Math.round(options.radius ?? 6), 2, 24);
  const chunks = new Map();
  const state = { cx: null, cz: null, focusX: 0, focusZ: 0, queue: [], dirty: [], generated: 0, dropped: 0, meshMs: 0, genMs: 0 };
  let meshOptions = options.mesh ?? {};

  const inRange = (cx, cz) => Math.abs(cx - state.cx) <= radius && Math.abs(cz - state.cz) <= radius;

  const create = (cx, cz) => {
    const record = { cx, cz, key: key(cx, cz), chunk: null, mesh: null, handle: null, ready: false, empty: false, quads: 0, bytes: 0 };
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
    const meshStart = performance.now();
    const mesh = buildChunkMesh(chunk, field, meshOptions);
    state.meshMs = performance.now() - meshStart;
    record.mesh = mesh;
    record.empty = meshIsEmpty(mesh);
    record.quads = mesh.quads;
    record.bytes = mesh.bytes;
    if (options.upload && !record.empty) record.handle = options.upload(chunk, mesh) ?? null;
    record.ready = true;
    return record;
  };

  const remeshRecord = (record) => {
    if (!record.chunk) return;
    if (record.handle && options.release) options.release(record.handle);
    record.handle = null;
    const meshStart = performance.now();
    const mesh = buildChunkMesh(record.chunk, field, meshOptions);
    state.meshMs = performance.now() - meshStart;
    record.mesh = mesh;
    record.empty = meshIsEmpty(mesh);
    record.quads = mesh.quads;
    record.bytes = mesh.bytes;
    if (options.upload && !record.empty) record.handle = options.upload(record.chunk, mesh) ?? null;
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

  /** Выгружаем то, что далеко: память и GPU должны быть ограничены радиусом. */
  const dropFar = () => {
    for (const [k, record] of chunks) {
      if (inRange(record.cx, record.cz)) continue;
      if (record.handle && options.release) options.release(record.handle);
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

  /** Готовые и видимые чанки — то, что отдаётся рендереру. */
  const visible = () => {
    const list = [];
    for (const record of chunks.values()) {
      if (!record.ready || record.empty || !inRange(record.cx, record.cz)) continue;
      list.push(record);
    }
    return list;
  };

  /** Все готовые чанки (и за радиусом тоже) — для скриншота-превью. */
  const all = () => Array.from(chunks.values()).filter((record) => record.ready);

  const get = (cx, cz) => chunks.get(key(cx, cz)) ?? null;

  /** Сменить правила мешинга (например, режим разреза) — перемешиваем всё. */
  const setMeshOptions = (next) => {
    meshOptions = { ...meshOptions, ...next };
    for (const record of chunks.values()) if (record.chunk) state.dirty.push(record.key);
  };

  const remeshStep = (budgetMs = 6) => {
    if (!state.dirty.length) return { done: true, remeshed: 0 };
    const start = performance.now();
    let remeshed = 0;
    while (state.dirty.length && performance.now() - start < budgetMs) {
      const k = state.dirty.shift();
      const record = chunks.get(k);
      if (!record || !record.chunk) continue;
      remeshRecord(record);
      remeshed += 1;
    }
    return { done: state.dirty.length === 0, remeshed };
  };

  /** Мировые координаты → «зеркальные» координаты тайла: для подписей в UI. */
  const tileCoords = (x, z) => {
    const { u, v, mx, my } = fold(field, x, z);
    return { u, v, mx, my };
  };

  const stats = () => {
    let quads = 0;
    let bytes = 0;
    let ready = 0;
    let empty = 0;
    for (const record of chunks.values()) {
      if (!record.ready) continue;
      if (record.empty) {
        empty += 1;
        continue;
      }
      ready += 1;
      quads += record.quads;
      bytes += record.bytes;
    }
    const total = (radius * 2 + 1) ** 2;
    return {
      chunks: chunks.size,
      ready,
      empty,
      queued: state.queue.length,
      pending: total - ready - empty - state.queue.length,
      radius,
      focus: { cx: state.cx, cz: state.cz },
      quads,
      triangles: quads * 2,
      bytes,
      generated: state.generated,
      dropped: state.dropped,
      lastGenMs: state.genMs,
      lastMeshMs: state.meshMs,
    };
  };

  const dispose = () => {
    for (const record of chunks.values()) if (record.handle && options.release) options.release(record.handle);
    chunks.clear();
    state.queue = [];
    state.dirty = [];
  };

  return {
    field,
    radius,
    focus,
    step,
    visible,
    all,
    get,
    setMeshOptions,
    remeshStep,
    tileCoords,
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

/** Период замощения в чанках — нужен, чтобы прикинуть, когда мир «повторится». */
export const tilePeriodChunks = (field) => ({
  x: Math.ceil((field.width * 2) / CHUNK_SX),
  z: Math.ceil((field.height * 2) / CHUNK_SZ),
});
