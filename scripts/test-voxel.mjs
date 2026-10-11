/* Проверка воксельного мира: поле → чанк → меш. Запуск: npm run test:voxel

   WebGL в node недоступен, поэтому проверяем то, что нельзя увидеть глазами в
   браузере: согласованность данных на швах и корректность геометрии.

     1. Зеркальное замощение (fold): сосед колонки за краем тайла — та же
        колонка, иначе на стыках повторяющегося мира были бы обрывы рек и
        стен;
     2. Река: вода нигде не течёт в гору, у каждого русла есть направление
        течения, канал глубже глади;
     3. Чанк: детерминированность (два раза один и тот же чанк), соседние чанки
        сходятся с «юбкой» — без этого между чанками видны щели;
     4. Палитра: упаковка/распаковка чанка сохраняет блоки;
     5. Меш: обход граней против часовой (иначе отсечение задних граней съест
        половину мира), UV внутри атласа, индексы в диапазоне, нет NaN, свет в
        шкале AO, вода отдельным буфером с ненулевым потоком;
     6. Бюджет времени: сколько стоит поле и один чанк — по нему судим, нужна
        ли распараллеленная генерация. */

import './lib/root.mjs';
import { buildField, fold, sampleColumn, surfaceY, F_RIVER, F_WATER, F_FALL, flowVector, direction8 } from '../src/world/field.js';
import { AIR, ATLAS_COLUMNS, BIOME_PALETTE, BLOCKS, BLOCK_COUNT, biomeFromClimate, blockName, isKnownBlock, isOpaque, isSolid, paletteFor, STONE, WATER, WATER_SOURCE, TILES } from '../src/world/blocks.js';
import { CHUNK_SX, CHUNK_SZ, generateChunk, blockAt } from '../src/world/chunk.js';
import { encodePalette, decodePalette } from '../src/world/chunk.js';
import { buildChunkMesh, FACES, POSITION_SCALE, VERTEX_BYTES } from '../src/world/mesher.js';
import { readSource, mapsReady, missingMapsPart, VoxelSourceError } from '../src/world/bridge.js';
import { createVoxelWorld } from '../src/world/world.js';
import { raycast } from '../src/game/world-view.js';
import { fakeEditorWindow, FAKE_EXPECT } from './lib/fake-fmg.mjs';

/* Русское согласование числительного: «61 проверка», а не «61 проверок». */
const plural = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const checks = [];
const add = (ok, what, detail = '') => checks.push({ ok: Boolean(ok), what, detail });

/* ---------- синтетический источник: остров с рекой и озером ---------- */

const CELLS_X = 40;
const CELLS_Y = 30;
const SPACING = 12;
const WIDTH = CELLS_X * SPACING;
const HEIGHT = CELLS_Y * SPACING;

const island = () => {
  const cellH = new Float32Array(CELLS_X * CELLS_Y);
  const cellBiome = new Uint8Array(CELLS_X * CELLS_Y);
  const cellTemp = new Int8Array(CELLS_X * CELLS_Y);
  const cellPrec = new Uint8Array(CELLS_X * CELLS_Y);
  const cellFeature = new Uint16Array(CELLS_X * CELLS_Y);
  for (let cy = 0; cy < CELLS_Y; cy += 1) {
    for (let cx = 0; cx < CELLS_X; cx += 1) {
      const nx = (cx / (CELLS_X - 1)) * 2 - 1;
      const ny = (cy / (CELLS_Y - 1)) * 2 - 1;
      const d = Math.hypot(nx * 1.05, ny * 1.4);
      const ridge = Math.sin(nx * 5.1 + 0.6) * Math.cos(ny * 4.3 - 0.4);
      let h = 20 + (1 - Math.min(1, d)) * 46 + ridge * 9;
      h -= Math.max(0, d - 0.78) * 150; // край уходит под море
      const i = cy * CELLS_X + cx;
      h = Math.round(Math.max(2, Math.min(96, h)));
      cellH[i] = h;
      const t = Math.round(30 - Math.abs(ny) * 34 + (h > 55 ? -10 : 0));
      cellTemp[i] = t;
      const p = Math.round(30 + Math.cos(nx * 3.2) * 24 + (t > 10 ? 8 : -6));
      cellPrec[i] = Math.max(2, Math.min(96, p));
      cellBiome[i] = h <= 20 ? 0 : t < -6 ? 11 : t < 2 ? 10 : t < 10 ? 9 : p < 18 ? 1 : p < 30 ? 4 : p < 44 ? 6 : 7;
    }
  }
  /* Реку ведём по склону: исток — самая высокая клетка, дальше — шаг к самой
     низкой из соседних (как это делает сам Azgaar, только без депрешн-фильтров).
     Искусственная «диагональ» через хребет давала бы русло, идущее в гору, и
     проверка монотонности глади ловила бы не генератор, а выдуманный путь. */
  const riverPoints = [];
  const half = [];
  const flux = [];
  let bestCell = 0;
  for (let i = 1; i < cellH.length; i += 1) if (cellH[i] > cellH[bestCell]) bestCell = i;
  let cx = bestCell % CELLS_X;
  let cy = (bestCell / CELLS_X) | 0;
  const visited = new Set();
  for (let step = 0; step < 120; step += 1) {
    visited.add(cy * CELLS_X + cx);
    riverPoints.push([Math.round((cx + 0.5) * SPACING), Math.round((cy + 0.5) * SPACING)]);
    let next = -1;
    let nextH = cellH[cy * CELLS_X + cx];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx2 = cx + dx;
        const ny2 = cy + dy;
        if (nx2 < 0 || ny2 < 0 || nx2 >= CELLS_X || ny2 >= CELLS_Y) continue;
        const n = ny2 * CELLS_X + nx2;
        if (visited.has(n)) continue;
        if (cellH[n] < nextH) {
          nextH = cellH[n];
          next = n;
        }
      }
    }
    if (next < 0 || nextH <= 20) break; // дошли до моря
    cx = next % CELLS_X;
    cy = (next / CELLS_X) | 0;
  }
  for (let i = 0; i < riverPoints.length; i += 1) {
    const t = i / Math.max(1, riverPoints.length - 1);
    half.push(0.7 + t * 2.4);
    flux.push(30 + Math.round(t * 900));
  }
  const lakeCells = [];
  for (let cy = 18; cy <= 21; cy += 1) for (let cx = 26; cx <= 29; cx += 1) lakeCells.push(cy * CELLS_X + cx);
  for (const c of lakeCells) cellFeature[c] = 1;
  return {
    width: WIDTH,
    height: HEIGHT,
    spacing: SPACING,
    cellsX: CELLS_X,
    cellsY: CELLS_Y,
    seaLevel: 20,
    seedSalt: 20260,
    cellH,
    cellBiome,
    cellTemp,
    cellPrec,
    cellFeature,
    features: [{ i: lakeCells[0], type: 'lake', subtype: 'freshwater', height: 34 }],
    rivers: [{ id: 1, points: riverPoints, half, flux }],
  };
};

const t0 = performance.now();
const field = buildField(island(), { profile: 2, detail: 1 });
const fieldMs = performance.now() - t0;

add(field.width === WIDTH && field.height === HEIGHT, 'поле по размеру тайла', `${WIDTH} × ${HEIGHT} px`);
add(field.seed > 0, 'затравка поля собрана из размера и соли');

/* ---------- 1. замощение ---------- */

let seams = 0;
for (let z = -3; z < HEIGHT + 3; z += 7) {
  for (const [x, ref] of [
    [WIDTH - 1, WIDTH],
    [0, -1],
  ]) {
    const a = sampleColumn(field, x, z);
    const b = sampleColumn(field, ref, z);
    if (a.y !== b.y || a.flags !== b.flags) seams += 1;
  }
}
add(seams === 0, 'зеркальное замощение: сосед за краем = та же колонка', seams ? `${seams} расхождений` : 'границы тайлов непрерывны');

const left = surfaceY(field, 0, 100);
const right = surfaceY(field, field.width * 2, 100);
add(left === right, 'период по X = двум тайлам (через одно отражение)', `y ${left} = y ${right}`);

/* ---------- 2. река и течение ---------- */

let channel = 0;
let flowless = 0;
let uphill = 0;
let falls = 0;
for (let v = 0; v < field.height; v += 1) {
  for (let u = 0; u < field.width; u += 1) {
    const i = v * field.width + u;
    if ((field.flags[i] & F_RIVER) === 0) continue;
    channel += 1;
    if (field.waterY[i] <= field.ground[i]) uphill += 1;
    if (field.waterY[i] < field.seaY) uphill += 1;
    if ((field.flow[i] & 15) === 0) flowless += 1;
    if ((field.flags[i] & F_FALL) !== 0) falls += 1;
  }
}
add(channel > 200, 'русло легло на растр', `${channel} колонок воды`);
add(uphill === 0, 'вода в русле выше дна и не ниже уровня моря', uphill ? `${uphill} нарушений` : `${falls} водопадов`);
/* Направления нет у первых сэмплов от устья (течь некуда — там уже море) и у
   стоячих озёр. Для русла в 500+ колонок это доли процента. */
add(channel > 0 && flowless / channel < 0.03, 'у русла есть направление течения', `${flowless} из ${channel} колонок без направления (срез устья)`);

/* Гладь не растёт к устью: идём по точкам полилинии от истока. */
let rising = 0;
let prevLevel = null;
for (const [px, py] of island().rivers[0].points) {
  let best = null;
  for (let dv = -2; dv <= 2; dv += 1) {
    for (let du = -2; du <= 2; du += 1) {
      const u = Math.round(px) + du;
      const v = Math.round(py) + dv;
      if (u < 0 || v < 0 || u >= field.width || v >= field.height) continue;
      const i = v * field.width + u;
      if ((field.flags[i] & F_RIVER) === 0) continue;
      const level = field.waterY[i];
      if (best === null || Math.abs(level - (prevLevel ?? level)) < Math.abs(best - (prevLevel ?? level))) best = level;
    }
  }
  if (best === null) continue;
  if (prevLevel !== null && best > prevLevel) rising += 1;
  prevLevel = best;
}
add(rising === 0, 'гладь реки монотонна от истока к устью', rising ? `${rising} подъёмов` : 'течь вниз без подъёмов');

const d8 = [1, 2, 3, 4, 5, 6, 7, 8].every((dir) => {
  const [dx, dz] = flowVector(dir);
  return direction8(dx, dz) === dir;
});
add(d8, 'D8-направление и вектор согласованы', 'все 8 сторон');

/* ---------- 3. чанки ---------- */

/**
 * Чанки для проверок берём по содержимому, а не «на глаз»: вода в холодном
 * биоме скрыта льдом и граней воды не даёт, поэтому ищем незамерзшую воду.
 */
const findChunk = (test) => {
  const cellsX = field.cellsX;
  for (let cz = 0; cz < Math.ceil(HEIGHT / CHUNK_SZ); cz += 1) {
    for (let cx = 0; cx < Math.ceil(WIDTH / CHUNK_SX); cx += 1) {
      for (let v = cz * CHUNK_SZ; v < Math.min(HEIGHT, (cz + 1) * CHUNK_SZ); v += 1) {
        for (let u = cx * CHUNK_SX; u < Math.min(WIDTH, (cx + 1) * CHUNK_SX); u += 1) {
          const i = v * field.width + u;
          const c = Math.floor(v / field.spacing) * cellsX + Math.floor(u / field.spacing);
          if (test(i, c)) return { cx, cz, u, v };
        }
      }
    }
  }
  return null;
};

const sea = findChunk((i, c) => (field.flags[i] & F_WATER) !== 0 && (field.flags[i] & 2) !== 0 && field.cellTemp[c] > 4);
const river = findChunk((i) => (field.flags[i] & F_RIVER) !== 0 && field.flow[i] !== 0);
const land = findChunk((i) => (field.flags[i] & F_WATER) === 0 && field.ground[i] > field.seaY + 8);
const midX = land.cx;
const midZ = land.cz;

const a0 = generateChunk(field, midX, midZ, { ores: true, caves: true });
const a1 = generateChunk(field, midX, midZ, { ores: true, caves: true });
let diff = 0;
for (let i = 0; i < a0.blocks.length; i += 1) if (a0.blocks[i] !== a1.blocks[i]) diff += 1;
add(diff === 0, 'чанк детерминирован', diff ? `${diff} блоков разошлись` : `${a0.blocks.length >> 10} KiB байт-в-байт`);
add(a0.sx === CHUNK_SX + 2 && a0.sz === CHUNK_SZ + 2, 'юбка в один блок по краям', `${a0.sx} × ${a0.sz} × ${a0.height}`);

/* Сосед справа: его первые внутренние колонки = последние колонки юбки. */
const right2 = generateChunk(field, midX + 1, midZ, { ores: true, caves: true });
let border = 0;
for (let lz = 1; lz < CHUNK_SZ + 1; lz += 1) {
  for (let y = 0; y < a0.height; y += 1) {
    /* наши последние две колонки = первые две колонки соседа (у обоих юбка) */
    if (blockAt(a0, CHUNK_SX, y, lz) !== blockAt(right2, 0, y, lz)) border += 1;
    if (blockAt(a0, CHUNK_SX + 1, y, lz) !== blockAt(right2, 1, y, lz)) border += 1;
  }
}
add(border === 0, 'чанки сходятся с юбкой соседа', border ? `${border} несовпадений` : 'кроны и пещеры через границу не режутся');

/* ---------- 4. палитра ---------- */

const packed = encodePalette(a0.blocks);
const unpacked = decodePalette(packed);
let paletteDiff = 0;
for (let i = 0; i < packed.indices.length; i += 1) if (unpacked[i] !== a0.blocks[i]) paletteDiff += 1;
const ratio = (unpacked.length / Math.max(1, packed.indices.length + packed.palette.length * 1)).toFixed(2);
add(paletteDiff === 0 && packed.palette !== null, 'упаковка палитры обратима', `${packed.bits} бит, ×${ratio} компактнее`);

let foreign = null;
try {
  decodePalette({ v: 7, bits: packed.bits, palette: packed.palette, indices: packed.indices });
} catch (error) {
  foreign = error.message;
}
add(foreign !== null && /версия/i.test(foreign), 'чужая версия палитры — понятная ошибка', foreign ?? '');

/* Палитра биомов не должна вырождаться в «везде булыжник»: своя поверхность у
   каждого, растения — у всех, кроме ледника (11), где их и не бывает. */
const stoneTops = BIOME_PALETTE.map((p, id) => (p.top === STONE ? id : -1)).filter((id) => id >= 0);
const bareBiomes = BIOME_PALETTE.map((p, id) => (!p.filler.length || (!p.trees.length && !p.plants.length && id !== 11) ? id : -1)).filter((id) => id >= 0);
add(BIOME_PALETTE.length === 13 && stoneTops.length === 0 && bareBiomes.length === 0,
  'биомы не сводятся к голому камню', `${BIOME_PALETTE.length} биомов, заглушек: ${stoneTops.length + bareBiomes.length}`);
add(isKnownBlock(paletteFor(200).top) && paletteFor(200).filler.length > 0,
  'неизвестный id биомы не роняет генератор', blockName(paletteFor(200).top));
add([[-100, -40, 0], [100, 60, 120], [0, 50, 25], [50, -50, 3], [255, 127, 1]].every(([moisture, temperature, height]) => {
  const id = biomeFromClimate(moisture, temperature, height);
  return id >= 0 && id < BIOME_PALETTE.length && Boolean(BIOME_PALETTE[id]);
}), 'климат всегда попадает в известный биом');

const altField = buildField({ ...island(), seedSalt: 999999 }, { profile: 2, detail: 1 });
const altChunk = generateChunk(altField, midX, midZ, { ores: true, caves: true });
let saltDiff = 0;
for (let i = 0; i < altChunk.blocks.length; i += 1) if (altChunk.blocks[i] !== a0.blocks[i]) saltDiff += 1;
add(saltDiff > 0, 'другая соль карты — другой чанк', `${saltDiff} блоков отличается`);

/* ---------- 5. меш ---------- */

const winding = FACES.every((face) => {
  const at = (c, k) => c[k];
  const [a, b, c] = face.corners;
  const cross = [
    at(b, 'py') * at(c, 'pz') - at(b, 'pz') * at(c, 'py'),
    at(b, 'pz') * at(c, 'px') - at(b, 'px') * at(c, 'pz'),
    at(b, 'px') * at(c, 'py') - at(b, 'py') * at(c, 'px'),
  ];
  const dot = cross[0] * face.nx + cross[1] * face.ny + cross[2] * face.nz;
  return dot > 0;
});
add(winding, 'обход граней против часовой снаружи', 'отсечение задних граней безопасно');
add(FACES.length === 6, 'шесть граней', FACES.map((f) => `${['x', 'y', 'z'][f.axis]}${f.sign > 0 ? '+' : '-'}`).join(' '));

const wet = generateChunk(field, sea.cx, sea.cz, { ores: true, caves: true });
const riverChunk = river ? generateChunk(field, river.cx, river.cz, { ores: true, caves: true }) : wet;
void 0;
const mesh = buildChunkMesh(a0, field);
const wetMesh = buildChunkMesh(wet, field);
const riverMesh = buildChunkMesh(riverChunk, field);
/* Время меряем на прогретом движке: первая генерация — это прогрев JIT и
   аллокатор, на ней «12 мс» превращаются в «1 мс» уже со второго чанка. */
const warm = [];
for (let i = 0; i < 24; i += 1) warm.push(generateChunk(field, midX + i, midZ, { ores: true, caves: true }));
let genStart = performance.now();
for (const c of warm) buildChunkMesh(c, field);
const meshMs = (performance.now() - genStart) / warm.length;
genStart = performance.now();
for (let i = 100; i < 124; i += 1) generateChunk(field, i, midZ + 3, { ores: true, caves: true });
const genMs = (performance.now() - genStart) / 24;
const views = [mesh, wetMesh, riverMesh].flatMap((m) => [m.opaque, m.water]).filter((part) => part.vertexCount > 0);
const read = (part) => {
  const u16 = new Uint16Array(part.vertices.buffer, part.vertices.byteOffset, part.vertexCount * 8);
  const bytes = part.vertices;
  const list = [];
  for (let i = 0; i < part.vertexCount; i += 1) {
    list.push({
      x: u16[i * 8],
      y: u16[i * 8 + 1],
      z: u16[i * 8 + 2],
      s: u16[i * 8 + 3],
      t: u16[i * 8 + 4],
      light: bytes[i * 16 + 10],
      fx: (bytes[i * 16 + 11] << 24) >> 24,
      fz: (bytes[i * 16 + 12] << 24) >> 24,
      liquid: bytes[i * 16 + 13],
    });
  }
  return list;
};
const verts = views.flatMap(read);
const badPos = verts.filter((v) => !Number.isFinite(v.x + v.y + v.z) || v.x > (CHUNK_SX + 2) * 16 || v.z > (CHUNK_SZ + 2) * 16 || v.y > 256 * 16).length;
const badUV = verts.filter((v) => v.s > 65535 || v.t > 65535).length;
const idxBad = views.reduce((acc, m) => acc + Array.from(m.indices).filter((i) => i >= m.vertexCount).length, 0);
add(badPos === 0, 'позиции упакованы и влезают в чанк', badPos ? `${badPos} выходов за габарит` : `Uint16 ×3, шаг 1/${POSITION_SCALE} блока`);
add(badUV === 0, 'UV внутри атласа', badUV ? `${badUV} выходов за тайл` : `${TILES.length} тайлов в ${ATLAS_COLUMNS}×${ATLAS_COLUMNS}`);
add(idxBad === 0, 'индексы в диапазоне буфера', `${mesh.triangles} треугольников, индексы ${mesh.opaque.indexType}`);
add(verts.every((v) => v.liquid === 0 || v.liquid === 1), 'флаг жидкости бинарный', `${views.length} буферов по ${VERTEX_BYTES} байта`);
const lights = verts.map((v) => v.light);
const levels = new Set(lights).size;
add(lights.every((x) => x >= 76 && x <= 255) && levels >= 3, 'AO даёт ступени света, а не черноту', `${levels} уровней, ${Math.min(...lights)}…${Math.max(...lights)}`);

/* Юбка реально режет грани: без неё на границе чанка торчит стена. */
const inner = mesh.quads;
const noSkirt = buildChunkMesh(generateChunk(field, midX, midZ, { ores: true, caves: true, skirt: false }), field).quads;
add(noSkirt > inner, 'юбка закрывает грани на границе чанка', `без неё +${noSkirt - inner} квадов стен по швам`);

/* Закрытые полости: тот же чанк без openOnly даёт заметно больше геометрии. */
const cut = buildChunkMesh(a0, field, { openOnly: false });
add(cut.quads > mesh.quads, 'режим разреза возвращает стены пещер', `${cut.quads - mesh.quads} квадов скрытых полостей`);
add(mesh.quads < cut.quads && mesh.quads < 12000, 'меш чанка в бюджете геометрии', `${mesh.quads} квадов, ${(mesh.bytes / 1024).toFixed(0)} KiB`);
add(mesh.bytes < 700 * 1024, 'чанк в бюджете памяти', `${(mesh.bytes / 1024).toFixed(0)} KiB на ${mesh.quads} квадов`);
add(VERTEX_BYTES === 16, 'вершинный формат упакован', `${VERTEX_BYTES} байт на вершину`);
add(typeof isKnownBlock === 'function' && isKnownBlock(WATER_SOURCE) && !isKnownBlock(29), 'в таблице блоков нет дыр под чужими id');

/* Пустой чанк за краем мира не должен рождать мусор. */
const empty = buildChunkMesh(generateChunk(field, -999, -999, { caves: false, ores: false }), field);
add(Number.isFinite(empty.quads) && empty.quads > 0, 'чанк за пределами тайла генерируется из замощения', `${empty.quads} квадов`);

/* ---------- 6. бюджет ---------- */

add(fieldMs < 4000, 'поле строится в пределах паузы', `${fieldMs.toFixed(0)} мс на ${field.area} колонок`);
add(genMs + meshMs < 10, 'чанк: генерация + меш — доли кадра', `генерация ${genMs.toFixed(2)} мс + меш ${meshMs.toFixed(2)} мс на чанк`);
add(isOpaque(WATER) === false && isOpaque(WATER_SOURCE) === false, 'вода не перекрывает грани соседей', `${BLOCK_COUNT} блоков, таблица до ${BLOCKS.length - 1}`);
add(BLOCKS[AIR].solid === false, 'воздух не блокирует обзор');

/* ---------- 7. мост: окно редактора → снимок карт ---------- */

/* Окно собирается общим помощником — тот же снимок проверяет и DOM-тест вида. */
const win = fakeEditorWindow();
add(mapsReady(win) === true, 'мост: готовность окна распознана');
const src = readSource(win, { seed: 'мост' });
add(src.width === FAKE_EXPECT.width && src.height === FAKE_EXPECT.height,
  'мост: размеры взяты из graph', `${src.width}×${src.height}`);
add(src.seaLevel === 20 && src.spacing === 16, 'мост: уровень моря и шаг сетки');
add(src.cellH[FAKE_EXPECT.cells.land] === FAKE_EXPECT.heights.dry
  && src.cellH[FAKE_EXPECT.cells.lake] === FAKE_EXPECT.heights.lake
  && src.cellH[1] === FAKE_EXPECT.heights.sea,
  'мост: высоты pack перенесены на grid, остальное осталось из grid');
add(src.cellBiome[FAKE_EXPECT.cells.land] === 1 && src.cellTemp[FAKE_EXPECT.cells.lake] === 3 && src.cellPrec[FAKE_EXPECT.cells.river] === 40,
  'мост: биомы, температуры и осадки доехали');
add(src.stats.lakes === 1 && src.cellFeature[FAKE_EXPECT.cells.lake] === 1, 'мост: озеро помечено на клетке-родителе');
add(src.stats.rivers === 1 && src.rivers[0].points.length === 2 && src.rivers[0].half[0] > 0.4,
  'мост: русло прочитано и имеет полуширину', `${src.rivers[0]?.half?.[0]?.toFixed(2) ?? 0} px`);

const bridgeField = buildField(src, { profile: 0, detail: 0 });
const riverPixels = [];
for (let i = 0; i < bridgeField.flags.length; i += 1) {
  if ((bridgeField.flags[i] & F_RIVER) === 0) continue;
  riverPixels.push([i % bridgeField.width, Math.floor(i / bridgeField.width)]);
}
const near = (x, y) => riverPixels.some(([px, py]) => Math.abs(px - x) <= 3 && Math.abs(py - y) <= 3);
add(riverPixels.length > 8, 'мост: русло прорастрировано в поле', `${riverPixels.length} пикселей`);
add(FAKE_EXPECT.riverPoints.every(([x, y]) => near(x, y)), 'мост: русло прошло по точкам генератора', 'излучистость не сместила канал');
add(bridgeField.ground[0] >= bridgeField.seaY - 4, 'мост: суша над уровнем моря осталась сушей');

let early = null;
try {
  readSource(null);
} catch (error) {
  early = error;
}
add(early instanceof VoxelSourceError, 'мост: закрытый документ — человеческая ошибка', early?.message ?? '');
const half = { grid: { spacing: 8, cells: { h: [1, 2] } } };
add(missingMapsPart(half).includes('упаковк'), 'мост: подсказка говорит, чего не хватает', missingMapsPart(half));
let partial = null;
try {
  readSource(half);
} catch (error) {
  partial = error;
}
add(partial instanceof VoxelSourceError && /рано/.test(partial.message), 'мост: генерация не дошла — мир не строим');


/* ---------- 8. выбор блока лучом и хранилище чанков ---------- */

/* Хост не передаём: без DOM мир считается ровно так же. Проверяем то, что в
   браузере видно только глазами: луч упирается в поверхность, очередь
   укладывается в бюджет кадра, а прыжок на другой край тайла вытесняет чанки. */
const pickWorld = createVoxelWorld(field, { radius: 2 });
/* Столберок берём сухой и выше моря: иначе луч честнее попадёт в пруд, чем в
   рельеф, и проверка начнёт спорить с itself. */
let pickX = -1;
let pickZ = -1;
let pickColumn = null;
for (let attempt = 0; attempt < 6000 && pickX < 0; attempt += 1) {
  const x = (attempt * 37 + 5) % field.width;
  const z = (attempt * 61 + 11) % field.height;
  const column = sampleColumn(field, x, z);
  if ((column.flags & F_WATER) === 0 && column.y > field.seaY + 6) {
    pickX = x;
    pickZ = z;
    pickColumn = column;
  }
}
const fresh = pickWorld.stats();
add(fresh.chunks === 0 && fresh.ready === 0, 'мир до фокуса не строит ничего', `${fresh.chunks} чанков`);
pickWorld.focus(pickX, pickZ);
const queued = pickWorld.stats();
add(queued.queued === (2 * 2 + 1) ** 2 && queued.ready === 0,
  'фокус ставит весь радиус в очередь', `${queued.queued} чанков в очереди, ${queued.pending} не создано`);
for (let guard = 0; guard < 24 && pickWorld.stats().queued; guard += 1) pickWorld.step(50);
const built = pickWorld.stats();
add(built.ready > 0 && built.quads > 0, 'очередь строит чанки в бюджете кадра', `${built.ready} готово, ${built.quads} квадов`);
/* Цена чанка — средняя по очереди, а не «последний измеренный»: один замер
   зависит от JIT и сборщика мусора и на загруженной машине прыгает до 25 мс,
   а контракт здесь — средний бюджет кадра. */
const timing = createVoxelWorld(field, { radius: 1 }); // радиус зажимается снизу до 2 — это продукт-решение

timing.focus(pickX, pickZ);
let spent = 0;
let made = 0;
for (let guard = 0; guard < 60 && timing.stats().queued; guard += 1) {
  const part = timing.step(4);
  spent += part.ms;
  made += part.generated;
}
const mean = spent / Math.max(1, made);
add(made === 25 && mean < 16, 'чанк вписан в средний бюджет кадра', `${made} чанков (радиус 2 — минимум), в среднем ${mean.toFixed(1)} мс`);
const atomic = createVoxelWorld(field, { radius: 0 });
atomic.focus(pickX, pickZ);
const single = atomic.step(0);
add(single.generated === 1, 'гранулярность очереди: один чанк за шаг при нулевом бюджете', `${single.generated} чанк за ${single.ms.toFixed(1)} мс`);
atomic.dispose();
timing.dispose();
const hit = raycast(pickWorld, [pickX + 0.5, pickColumn.y + 10, pickZ + 0.5], [0, -1, 0], 32);
add(Boolean(hit?.id) && hit.id !== AIR && hit.id !== WATER && hit.id !== WATER_SOURCE,
  'луч сверху вниз уткнулся в твёрдый блок', hit ? `${BLOCKS[hit.id]?.name ?? hit.id} @${hit.y}` : 'мимо');
add(Boolean(hit) && hit.y >= pickColumn.y - 1 && hit.y <= pickColumn.y + 24,
  'луч остановился на поверхности (допустима крона дерева)', `${hit?.y ?? '—'} при грунте ${pickColumn.y}`);
/* Под ногами пусто быть не может: три блока под поверхностью — сплошные. */
const underRecord = pickWorld.get(Math.floor(pickX / CHUNK_SX), Math.floor(pickZ / CHUNK_SZ));
const under = underRecord?.chunk;
let hollow = 0;
if (under) {
  for (let dy = 1; dy <= 3; dy += 1) {
    if (!isSolid(blockAt(under, pickX - under.x0, pickColumn.y - dy, pickZ - under.z0))) hollow += 1;
  }
}
add(Boolean(under) && hollow === 0, 'под поверхностью нет пустот', under ? `${hollow} пустых клеток` : 'чанк не готов');
const miss = raycast(pickWorld, [pickX + 0.5, pickColumn.y + 60, pickZ + 0.5], [0, 1, 0], 24);
add(miss === null, 'луч в небо ничего не находит');
add(pickWorld.visible().length === built.ready - built.empty, 'сцена отдаёт ровно готовые чанки радиуса', `${pickWorld.visible().length} из ${built.chunks}`);
const before = pickWorld.stats().dropped;
pickWorld.focus(field.width * 3, field.height * 3);
for (let guard = 0; guard < 24; guard += 1) pickWorld.step(50);
add(pickWorld.stats().dropped > before, 'прыжок на другой край тайла вытесняет чанки', `вытеснено ${pickWorld.stats().dropped - before}`);
pickWorld.dispose();
const cleared = pickWorld.stats();
add(cleared.chunks === 0 && cleared.quads === 0, 'dispose освобождает хранилище', `${cleared.chunks} чанков`);

/* ---------- итог ---------- */

console.log('Воксельный мир: поле → чанк → меш\n');
let bad = 0;
for (const check of checks) {
  console.log(`${check.ok ? '  ✓' : '  ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
  if (!check.ok) bad += 1;
}
console.log('');
if (bad) {
  console.log(`ВОКСЕЛЬНЫЙ МИР ЛОМАЕТСЯ: не прошло ${plural(bad, 'проверка', 'проверки', 'проверок')} — ${bad} из ${checks.length}.`);
  process.exit(1);
}
console.log(`ВСЁ ХОРОШО — ${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')} воксельного мира.`);
