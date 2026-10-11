/* Мешина чанка: из блоков — геометрия для WebGL.

   Четыре приёма, которые держат кадр:
     1. отсечение скрытых граней: у блока, чей сосед непрозрачен, грань не нужна;
     2. «юбка» в 1 блок колонок соседей — без неё на стыках чанков оставались бы
        незакрытые стены и дыры в рельефе;
     3. закрытые полости не мешим: грань в воздушную клетку рисуется, только
        если клетка смотрит в небо. Стены пещер внутри породы — это до 80 %
        геометрии подземки, и игрок их не видит; в режиме разреза
        (openOnly: false) они возвращаются;
     4. затенение окружения (AO) по трём соседям на вершину: рельеф читается без
        теневых карт и без постобработки.

   Позиции вершин — локальные, в координатах чанка: у WebGL float32 на мировых
   координатах порядка 1e5 шаг сетки больше сотой доли блока, начинается
   дрожание. Начало чанка передаётся в шейдер одним vec3.

   Greedy meshing не делаем сознательно: полку можно склеить только при
   одинаковом свете всех её вершин, а AO как раз разный. Замеры — в
   scripts/test-voxel.mjs. */

import { AIR, ATLAS_COLUMNS, ATLAS_SIZE, BLOCKS, isOpaque } from './blocks.js';
import { clamp } from './math.js';
import { fold, flowVector } from './field.js';

/**
 * Грани куба. Угол = (координата по нормали, две координаты в плоскости).
 * Обход против часовой стрелки снаружи, поэтому отсечение задних граней
 * безопасно — см. проверку «обход граней» в тесте.
 */
const buildFace = (axis, sign) => {
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  const n = [0, 0, 0];
  n[axis] = sign;
  const grid = sign > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]];
  const sAxis = axis === 2 ? 0 : 2;
  const tAxis = axis === 1 ? (sAxis === 0 ? 2 : 0) : 1;
  const corners = grid.map(([cu, cv]) => {
    const p = [0, 0, 0];
    p[axis] = sign > 0 ? 1 : 0;
    p[u] = cu;
    p[v] = cv;
    const d1 = [0, 0, 0];
    d1[u] = cu ? -1 : 1; // шаг от угла внутрь грани — три соседа для AO
    const d2 = [0, 0, 0];
    d2[v] = cv ? -1 : 1;
    return {
      px: p[0],
      py: p[1],
      pz: p[2],
      s: p[sAxis],
      t: axis === 1 ? p[tAxis] : 1 - p[1],
      d1,
      d2,
      dc: [d1[0] + d2[0], d1[1] + d2[1], d1[2] + d2[2]],
    };
  });
  const shade = axis === 1 ? (sign > 0 ? 1 : 0.5) : sign > 0 ? 0.82 : 0.72;
  return { axis, sign, nx: n[0], ny: n[1], nz: n[2], shade, corners };
};

/** Индексы граней: 0 +X, 1 −X, 2 верх, 3 низ, 4 +Z, 5 −Z. */
export const FACES = [0, 1, 2].flatMap((axis) => [buildFace(axis, 1), buildFace(axis, -1)]);
export const FACE_TOP = 2;
export const FACE_BOTTOM = 3;

const ATLAS = ATLAS_COLUMNS; // сетка атласа — см. blocks.js
const TILE_UV = 1 / ATLAS;
const PAD = 0.5 / ATLAS_SIZE; // полпикселя: отбор по mip не тянет соседний тайл
const UV_SPAN = TILE_UV - PAD * 2;
const WATER_DROP = 0.14; // верхний слой воды чуть ниже полного куба
const SLOPE_DROP = 0.05; // и ещё чуть — вниз по течению

/** «Растение»: не режет грани соседей, не твёрдое, не жидкость → рисуем крестом. */
const isPlant = (id) => {
  if (id === AIR) return false;
  const b = BLOCKS[id];
  return b.cull === false && b.solid === false && !b.liquid;
};

const isLiquid = (id) => id !== AIR && id !== undefined && Boolean(BLOCKS[id] && BLOCKS[id].liquid);

/**
 * Вершинный формат — 16 байт на вершину, packed:
 *   0  Uint16  x · SCALE          (локальные координаты чанка)
 *   2  Uint16  y · SCALE
 *   4  Uint16  z · SCALE
 *   6  Uint16  s · 65535           (UV внутри атласа)
 *   8  Uint16  t · 65535
 *  10  Uint8   свет · 255
 *  11  Int8    поток.x (-1…1)
 *  12  Int8    поток.z
 *  13  Uint8   флаг жидкости (1 = вода: шейдер включает анимацию)
 *  14..15      заполнение (выравнивание)
 *
 * Пакет вместо восьми float: чанк леса — 7 тыс. квадов, это 28 тыс. вершин; с
 * float32 только вершины занимали бы 900 KiB на чанк, а при радиусе обзора 5 их
 * 121. packed — ровно вдвое меньше, и загрузка в GPU короче. Точности хватает:
 * 1/16 блока на позицию (уклон воды 0,14 — это 2–3 шага), 1/65535 на UV.
 */
export const VERTEX_BYTES = 16;
export const POSITION_SCALE = 16;
const UV_SCALE = 65535;

/**
 * Буфер одной группы рисования: непрозрачная геометрия или вода. Индексы —
 * Uint16, пока хватает (чанк до 65535 вершин), иначе Uint32: почти всегда
 * хватает, а разница — ещё вдвое меньше данных.
 */
class Builder {
  constructor(capacity) {
    this.capacity = Math.max(64, capacity);
    this.buffer = new ArrayBuffer(this.capacity * VERTEX_BYTES);
    this.u16 = new Uint16Array(this.buffer);
    this.u8 = new Uint8Array(this.buffer);
    this.index = new Uint32Array(Math.max(24, this.capacity));
    this.vertices = 0;
    this.triangles = 0;
    this.quads = 0;
  }

  grow() {
    const next = new ArrayBuffer(this.buffer.byteLength * 2);
    new Uint8Array(next).set(this.u8.subarray(0, this.vertices * VERTEX_BYTES));
    this.buffer = next;
    this.u16 = new Uint16Array(next);
    this.u8 = new Uint8Array(next);
  }

  /** @param {number[]} v x, y, z, s, t, свет, поток.x, поток.z,液体-флаг */
  vertex(x, y, z, s, t, light, fx, fz, liquid) {
    const n = this.vertices * VERTEX_BYTES;
    if (n + VERTEX_BYTES > this.buffer.byteLength) this.grow();
    const u16 = this.u16;
    const u8 = this.u8;
    const base = n >> 1;
    u16[base] = Math.round(x * POSITION_SCALE);
    u16[base + 1] = Math.round(y * POSITION_SCALE);
    u16[base + 2] = Math.round(z * POSITION_SCALE);
    u16[base + 3] = Math.round(s * UV_SCALE);
    u16[base + 4] = Math.round(t * UV_SCALE);
    u8[n + 10] = Math.round(clamp01(light) * 255);
    u8[n + 11] = fx < 0 ? 255 : fx > 0 ? 1 : 0;
    u8[n + 12] = fz < 0 ? 255 : fz > 0 ? 1 : 0;
    u8[n + 13] = liquid ? 1 : 0;
    this.vertices += 1;
  }

  /** Квад из четырёх последних вершин: (0,1,2) + (0,2,3). */
  quad(base) {
    const at = this.triangles * 3;
    if (at + 6 > this.index.length) {
      const next = new Uint32Array(this.index.length * 2);
      next.set(this.index);
      this.index = next;
    }
    const x = this.index;
    x[at] = base;
    x[at + 1] = base + 1;
    x[at + 2] = base + 2;
    x[at + 3] = base;
    x[at + 4] = base + 2;
    x[at + 5] = base + 3;
    this.triangles += 2;
    this.quads += 1;
  }

  finish() {
    const bytes = this.vertices * VERTEX_BYTES;
    const wide = this.vertices > 65535;
    const indices = wide ? this.index.subarray(0, this.triangles * 3) : Uint16Array.from(this.index.subarray(0, this.triangles * 3));
    return {
      vertices: new Uint8Array(this.buffer, 0, bytes),
      indices,
      indexType: wide ? 'uint32' : 'uint16',
      vertexCount: this.vertices,
      indexCount: this.triangles * 3,
      quads: this.quads,
      triangles: this.triangles,
      bytes: bytes + indices.length * (wide ? 4 : 2),
    };
  }
}

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** 0 — вершина в кармане, 3 — открытая. Свет: 0.6…1.0. */
const aoLight = (level) => 0.6 + level * (0.4 / 3);

/**
 * Контекст текущей колонки. Один объект на чанк, поля обновляются на каждой
 * колонке — в горячем цикле не аллоцируется ничего.
 */
const makeContext = (chunk, solidTop, ao) => ({
  blocks: chunk.blocks,
  sx: chunk.sx,
  sz: chunk.sz,
  height: chunk.height,
  solidTop,
  ao,
  lx: 0,
  y: 0,
  lz: 0,
});

/** Занят ли соседний блок (для AO хватит верха непрозрачного — выборка блока не нужна). */
const occludes = (ctx, lx, y, lz) => {
  if (y < 0 || lx < 0 || lz < 0 || lx >= ctx.sx || lz >= ctx.sz) return 0;
  return y <= ctx.solidTop[lz * ctx.sx + lx] ? 1 : 0;
};

/** Блок рядом с (lx, y, lz) с проверкой границ чанка. */
const neighbour = (ctx, at, plane, face) => {
  const lx = ctx.lx + face.nx;
  const lz = ctx.lz + face.nz;
  const y = ctx.y + face.ny;
  if (lx < 0 || lz < 0 || lx >= ctx.sx || lz >= ctx.sz || y < 0 || y >= ctx.height) return AIR;
  return ctx.blocks[at + face.nx + face.nz * plane + face.ny * ctx.height];
};

/**
 * @param {object} chunk результат generateChunk (юбка обязательна — см. chunk.js)
 * @param {object} field поле из buildField — нужно направлению течения воды
 * @param {{ openOnly?: boolean, ao?: boolean }} [options]
 *   openOnly=false — мешить и стены замкнутых пещер (режим разреза)
 * @returns {{opaque: object, water: object, quads: number, triangles: number, bytes: number}}
 */
export const buildChunkMesh = (chunk, field, options = {}) => {
  const openOnly = options.openOnly !== false;
  const { sx, sz, height, x0, z0, ox, oz } = chunk;
  const spans = columnSpans(chunk, openOnly);
  const { tops, solidTop, cap } = spans;
  const ctx = makeContext(chunk, solidTop, options.ao !== false);
  const plane = sx * height;
  const columns = sx * sz;
  const opaque = new Builder(4096);
  const water = new Builder(256);

  for (let lz = oz; lz < sz - oz; lz += 1) {
    for (let lx = ox; lx < sx - ox; lx += 1) {
      const column = lz * sx + lx;
      const top = tops[column];
      if (top < 0) continue;
      const from = openOnly ? cap[column] : 0;
      ctx.lx = lx;
      ctx.lz = lz;
      let flow = null;
      for (let y = top; y >= from; y -= 1) {
        const id = chunk.blocks[column * height + y];
        if (id === AIR) continue;
        const block = BLOCKS[id];
        ctx.y = y;
        const at = column * height + y;
        if (isPlant(id)) {
          emitPlant(opaque, ctx, block);
          continue;
        }
        if (block.liquid) {
          if (flow === null) flow = flowAt(field, x0 + lx, z0 + lz);
          emitLiquid(water, ctx, block, flow, plane, at);
          continue;
        }
        for (let f = 0; f < FACES.length; f += 1) {
          const face = FACES[f];
          const ny = y + face.ny;
          if (ny < 0 || ny >= height) continue;
          const nId = neighbour(ctx, at, plane, face);
          if (nId !== AIR) {
            /* Непрозрачный сосед закрыл грань; такой же блок — сшить (листва к
               листве, лёд ко льду), иначе сквозь них видно изнанку. Грани в
               воду не режем: дно должно читаться сквозь прозрачную гладь. */
            if (isOpaque(nId) || nId === id) continue;
          } else if (openOnly) {
            const ncol = column + face.nx + face.nz * sx;
            const open = ncol < 0 || ncol >= columns || ny > solidTop[ncol];
            if (!open) continue; // полость внутри породы
          }
          const tile = face.axis === 1 ? (face.sign > 0 ? block.top : block.bottom) : block.side;
          emitQuad(opaque, ctx, face, tile, 0, 0, 0, plane, at);
        }
      }
    }
  }

  const opaqueMesh = opaque.finish();
  const waterMesh = water.finish();
  return {
    opaque: opaqueMesh,
    water: waterMesh,
    quads: opaqueMesh.quads + waterMesh.quads,
    triangles: opaqueMesh.triangles + waterMesh.triangles,
    bytes: opaqueMesh.bytes + waterMesh.bytes,
  };
};

/**
 * По колонке: верх заполненной части (`tops`), верх непрозрачного блока
 * (`solidTop`) и нижняя граница мешинга (`cap`). Ниже min(solidTop) по
 * окрестности 3 × 3 граней наружу быть не может — туда не смотрим вовсе.
 */
const columnSpans = (chunk, openOnly) => {
  const { blocks, sx, sz, height } = chunk;
  const size = sx * sz;
  const tops = new Int16Array(size).fill(-1);
  const solidTop = new Int16Array(size).fill(-1);
  for (let lz = 0; lz < sz; lz += 1) {
    for (let lx = 0; lx < sx; lx += 1) {
      const column = lz * sx + lx;
      let y = height - 1;
      let at = column * height + y;
      while (y >= 0 && blocks[at] === AIR) {
        y -= 1;
        at -= 1;
      }
      tops[column] = y;
      while (y >= 0 && !isOpaque(blocks[at])) {
        y -= 1;
        at -= 1;
      }
      solidTop[column] = y;
    }
  }
  const cap = new Int16Array(size);
  if (openOnly) {
    for (let lz = 0; lz < sz; lz += 1) {
      for (let lx = 0; lx < sx; lx += 1) {
        let min = solidTop[lz * sx + lx];
        for (let dz = -1; dz <= 1; dz += 1) {
          const nz = lz + dz;
          if (nz < 0 || nz >= sz) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = lx + dx;
            if (nx < 0 || nx >= sx) continue;
            const value = solidTop[nz * sx + nx];
            if (value < min) min = value;
          }
        }
        cap[lz * sx + lx] = min > 0 ? min - 1 : 0;
      }
    }
  }
  return { tops, solidTop, cap };
};

/** Направление течения колонки в мировых осях: на зеркальной колонке — обратно. */
const flowAt = (field, x, z) => {
  const { u, v, mx, my } = fold(field, x, z);
  const byte = field.flow[u + v * field.width];
  const [dx, dz] = flowVector(byte & 15);
  return { fx: mx ? -dx : dx, fz: my ? -dz : dz, depth: byte >> 4 };
};

/** Один квад грани. `drop` — насколько верхний край ниже полного блока. */
const emitQuad = (builder, ctx, face, tile, drop, fx, fz, liquid) => {
  const tu = (tile % ATLAS) * TILE_UV + PAD;
  const tv = ((tile / ATLAS) | 0) * TILE_UV + PAD;
  const x0 = ctx.lx;
  const z0 = ctx.lz;
  const y0 = ctx.y;
  const nx = x0 + face.nx;
  const nz = z0 + face.nz;
  const ny = y0 + face.ny;
  const base = builder.vertices;
  const ao = ctx.ao;
  for (let c = 0; c < 4; c += 1) {
    const corner = face.corners[c];
    let py = corner.py;
    if (drop > 0 && py === 1) {
      py = 1 - drop;
      if (fx || fz) {
        const downstream = (corner.px === 1 ? fx : -fx) + (corner.pz === 1 ? fz : -fz);
        if (downstream > 0) py -= SLOPE_DROP * (downstream / 2);
      }
    }
    let light = face.shade;
    if (ao) {
      const s1 = occludes(ctx, nx + corner.d1[0], ny + corner.d1[1], nz + corner.d1[2]);
      const s2 = occludes(ctx, nx + corner.d2[0], ny + corner.d2[1], nz + corner.d2[2]);
      const sc = occludes(ctx, nx + corner.dc[0], ny + corner.dc[1], nz + corner.dc[2]);
      light *= aoLight(s1 && s2 ? 0 : 3 - (s1 + s2 + sc));
    }
    builder.vertex(x0 + corner.px, y0 + py, z0 + corner.pz, tu + corner.s * UV_SPAN, tv + corner.t * UV_SPAN, light, fx, fz, liquid);
  }
  builder.quad(base);
};

/** Грань воды: только на границе с воздухом, верхний край опущен и наклонён по течению. */
const emitLiquid = (builder, ctx, block, flow, plane, at) => {
  const surface = !isLiquid(ctx.blocks[at + ctx.height]);
  for (let f = 0; f < FACES.length; f += 1) {
    const face = FACES[f];
    if (neighbour(ctx, at, plane, face) !== AIR) continue;
    const tile = face.axis === 1 && face.sign > 0 ? block.top : block.side;
    emitQuad(builder, ctx, face, tile, surface ? WATER_DROP : 0, flow.fx, flow.fz, 1);
  }
};

/** Крест из двух квадов: трава, папоротник, камыш. Лица двусторонние. */
const emitPlant = (builder, ctx, block) => {
  const tile = block.side;
  const tu = (tile % ATLAS) * TILE_UV + PAD;
  const tv = ((tile / ATLAS) | 0) * TILE_UV + PAD;
  const e = 0.36;
  const x0 = ctx.lx;
  const z0 = ctx.lz;
  const y0 = ctx.y;
  const planes = [
    [0.5 - e, 0.5 + e, 0.5 - e, 0.5 + e],
    [0.5 - e, 0.5 + e, 0.5 + e, 0.5 - e],
  ];
  for (const [az, bz, ax, bx] of planes) {
    for (const flip of [0, 1]) {
      const base = builder.vertices;
      const x1 = flip ? bx : ax;
      const x2 = flip ? ax : bx;
      const z1 = flip ? bz : az;
      const z2 = flip ? az : bz;
      builder.vertex(x0 + x1, y0, z0 + z1, tu, tv + UV_SPAN, 0.82, 0, 0, 0);
      builder.vertex(x0 + x2, y0, z0 + z2, tu + UV_SPAN, tv + UV_SPAN, 0.82, 0, 0, 0);
      builder.vertex(x0 + x2, y0 + 1, z0 + z2, tu + UV_SPAN, tv, 1, 0, 0, 0);
      builder.vertex(x0 + x1, y0 + 1, z0 + z1, tu, tv, 1, 0, 0, 0);
      builder.quad(base);
    }
  }
};

/** Пустой меш грузить в GPU незачем. */
export const meshIsEmpty = (mesh) => mesh.opaque.vertexCount === 0 && mesh.water.vertexCount === 0;
